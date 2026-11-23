// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// Terminal windows, tmux style. Window 0 is the console (hvc0, boot.ts);
// windows 1 to 9 are terminal sessions over vsock (the SDK's
// spawn(), served by the guest's kwtty), each with its own pty,
// size and login shell, and its own wterm in #terms, over the same box as
// window 0's. The status line lists them (store: win, wins), the prefix
// opens (n), switches (digits) and closes (x) them (shortcuts.ts), and
// KW.windows is the API for both and for the browser tests.
//
// - Opening waits until user space runs (the first console output), then
//   spawn() retries for up to 30 s while kwtty is not listening.
//   Typing while it opens is kept (64 KiB at most) and sent once it runs.
//   A failure (no kwtty: an older kernel, or a root on the data disk whose
//   own /etc/inittab hides the image's) stays in the window as a message.
// - Output: each window reads its session's output all the time, shown or
//   not, since a session nobody reads blocks its programs (vsock credit
//   follows the reads). wterm's write() parses at once into its grid and
//   bounded scrollback, so nothing queues up on this side: a hidden window
//   only has its painting paused (setRenderingPaused). The next chunk is
//   read only after write() returned, and the reader yields a task every
//   16 ms or 256 KiB, so a flood in one window cannot freeze the page.
// - The shell exiting closes its window and shows the window shown before
//   it (or window 0). A lost session or a failed one keeps the window
//   with a message until it is closed (Enter in it, or the prefix, x). The kernel stopping
//   (halt, power off, reboot, panic) closes them all.
// - Each window's size follows the stage like window 0's (the hidden ones
//   too: they are hidden with visibility, so they keep their box), and goes
//   to the shell with resize() (SIGWINCH).
// - A tty N window (opened without a name) shows the program in the
//   foreground of its terminal in the status line (vim, top) while it is
//   not the shell itself. Every second while such a window runs, one
//   vm.exec() reads them all from /proc (FG_SH); not while the page is
//   hidden or the system suspended, nor while the last one still runs.
import { WTerm } from "@wterm/dom";
import { trackBottom, type Bottom } from "./bottom.ts";
import { KW, type WindowInfo, type WindowsApi } from "./kw.ts";
import { PtyError, type KernelHandle, type Pty } from "./sdk.ts";
import { PREFIX } from "./shortcuts.ts";
import { MAX_WINDOWS, ui$, type Win as WinState } from "./store.ts";

/** How long spawn() waits for the guest's server once user space runs. */
const OPEN_TIMEOUT = 30000;
/** Typing kept while a window opens. */
const PENDING_MAX = 65536;
/** The output reader yields a task after this long or this much. */
const SLICE_MS = 16, SLICE_BYTES = 262144;
const SGR = { gray: "\x1b[90m", red: "\x1b[1;31m", off: "\x1b[0m" };
/** How often the foreground programs of the tty N windows are read. */
const FG_MS = 1000;
/**
 * A line per shell pid: the name of its terminal's foreground process group
 * leader (tpgid, the 6th field after the name in /proc/<pid>/stat), or an
 * empty line while the shell itself is in front or it cannot be read.
 */
const FG_SH = 'for p; do t=; c=; read -r s 2>/dev/null </proc/$p/stat && { set -- ${s##*\\) }; t=$6; }; ' +
	'[ "$t" -gt 0 ] 2>/dev/null && [ "$t" != "$p" ] && read -r c 2>/dev/null </proc/$t/comm; echo "$c"; done';

/** wterm's font: it takes the row height from --term-row-height, not from the font, so set both, at wterm's own ratio. */
export function setTermFont(el: HTMLElement, px: number): void {
	el.style.setProperty("--term-font-size", `${px}px`);
	el.style.setProperty("--term-row-height", `${Math.round(px * 1.2)}px`);
}

/** The options every terminal on the page has (window 0's in boot.ts too). */
export const TERM_OPTIONS = { scrollbackLines: 5000, cursorBlink: true } as const;

/** History and screen as text, a line per row (wterm's own readText() is async). */
export function termText(term: WTerm): string {
	const c = term.bridge;
	if (!c) return "";
	const hist = c.getScrollbackCount(), out: string[] = [];
	for (let r = 0; r < hist + c.getRows(); r++) {
		const old = r < hist, off = hist - r - 1; // scrollback offset 0 is the newest line
		const n = old ? c.getScrollbackLineLen(off) : c.getCols();
		let s = "";
		for (let col = 0; col < n; col++) {
			const cell = old ? c.getScrollbackCell(off, col) : c.getCell(r - hist, col);
			if (cell.width === 0 || cell.spacerHead) continue;
			s += cell.chars ?? String.fromCodePoint(cell.char || 32);
		}
		out.push(s.trimEnd());
	}
	return out.join("\n");
}

/**
 * Text pasted as a terminal pastes it (newlines become CR), bracketed when the
 * application asked for it, without ESC bytes (as wterm's own paste: no way out early).
 */
export function pasteText(term: WTerm, t: string): string {
	const s = t.replace(/\r?\n/g, "\r");
	return term.bridge?.bracketedPaste() ? `\x1b[200~${s.split(String.fromCharCode(27)).join("")}\x1b[201~` : s;
}

/**
 * Keyboard/paste input from wterm. A native paste can carry CRLF (Windows clipboard); CR and LF
 * would be two Enters, splitting `\` continuations. Multi-character input is a paste, so its line
 * breaks become CR, as a terminal sends them. A single key (Enter is CR, Ctrl+J is LF) is untouched.
 */
export function normalizeInput(d: string): string {
	return d.length > 1 ? d.replace(/\r?\n/g, "\r") : d;
}

/** A task boundary that background tabs do not throttle (unlike setTimeout). */
function yieldTask(): Promise<void> {
	return new Promise((resolve) => {
		const ch = new MessageChannel();
		ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
		ch.port2.postMessage(0);
	});
}

interface Win {
	n: number;
	/** Shown in the status line: "tty N". */
	name: string;
	/** A tty N window (no name given): the status line shows its foreground program (fg). */
	tty: boolean;
	/** The program in the foreground of its terminal when it is not the shell, else "" (pollFg). */
	fg: string;
	el: HTMLElement;
	term: WTerm;
	bottom: Bottom;
	state: WinState["state"];
	note: string;
	session: Pty | null;
	abort: AbortController;
	pending: Array<string | Uint8Array>;
	pendingBytes: number;
	gone: boolean;
}

export interface WindowsOptions {
	/** Window 0: the console's terminal. */
	term0: WTerm;
	/** Type into the console. */
	send0: (data: string | Uint8Array) => void;
	/** The kernel once user space runs; rejects if it never does (the boot failed, the kernel stopped). */
	ready: () => Promise<KernelHandle>;
	/** The kernel is starting or running: false once it stopped or the boot failed. */
	alive: () => boolean;
	/** Give the current window the focus after a switch (not on touch devices, where it raises the keyboard). */
	autoFocus: boolean;
}

export interface Windows extends WindowsApi {
	/** The current window's terminal. */
	currentTerm(): WTerm;
	/** Type into the current window. */
	sendCurrent(data: string | Uint8Array): void;
	/** Focus the current window's terminal. */
	focus(): void;
	/** The font size of every window. */
	setFont(px: number): void;
	/** The kernel stopped: close every window (window 0 stays). */
	closeAll(): void;
}

/** An error from open() after the window was made: the window shows it. */
type OpenError = Error & { window?: number };

export function createWindows(opts: WindowsOptions): Windows {
	const $ = ui$();
	const wins = new Map<number, Win>();
	const host = () => document.getElementById("terms")!;
	const el0 = opts.term0.element;
	/** Windows shown before, most recent first (for when the current one closes). */
	let history: number[] = [];

	const current = () => $.get().win;
	const termOf = (n: number): WTerm | null => (n === 0 ? opts.term0 : wins.get(n)?.term ?? null);

	function publish() {
		const list = [...wins.values()].sort((a, b) => a.n - b.n).map((w) => ({ n: w.n, name: w.name, state: w.state, note: w.note, fg: w.fg }));
		$.set({ wins: list });
	}

	/** The tty N windows whose shell runs: those pollFg() reads. */
	const ttys = () => [...wins.values()].filter((w) => w.tty && w.state === "open" && w.session);
	let fgTimer: ReturnType<typeof setTimeout> | undefined;
	/** Poll while there is a tty N window to read (see the top of this file). */
	function scheduleFg() {
		if (fgTimer === undefined && ttys().length) fgTimer = setTimeout(() => void pollFg(), FG_MS);
	}
	async function pollFg() {
		const list = ttys();
		try {
			if (!list.length || document.hidden || $.get().suspended || !opts.alive()) return;
			const vm = await opts.ready();
			const r = await vm.exec("/bin/sh", ["-c", FG_SH, "sh", ...list.map((w) => String(w.session!.pid))]);
			const lines = r.stdout.split("\n");
			let changed = false;
			list.forEach((w, i) => {
				const fg = (lines[i] ?? "").trim();
				if (!w.gone && w.fg !== fg) { w.fg = fg; changed = true; }
			});
			if (changed) publish();
		} catch {
			// The kernel stopped or the guest could not run it: try again next time.
		} finally {
			fgTimer = undefined;
			scheduleFg();
		}
	}

	/** Show window n (it exists), hide and pause the others. */
	function show(n: number) {
		const prev = current();
		if (prev !== n) history = [prev, ...history.filter((h) => h !== prev && h !== n)];
		const focused = document.activeElement as HTMLElement | null;
		const had = !!focused?.closest?.("#terms");
		for (const [m, el, term] of [[0, el0, opts.term0] as const, ...[...wins.values()].map((w) => [w.n, w.el, w.term] as const)]) {
			const on = m === n;
			el.classList.toggle("term-off", !on);
			el.inert = !on;
			term.setRenderingPaused(!on);
		}
		// Focus inside a window that got hidden would type into it unseen.
		if (focused?.closest?.(".term-off")) focused.blur();
		if (prev !== n) $.set({ win: n });
		return had;
	}

	function focus() {
		termOf(current())?.focus();
	}

	function select(n: number): boolean {
		if (!termOf(n)) return false;
		const had = show(n);
		if (opts.autoFocus || had) focus();
		return true;
	}

	function info(w: Win): WindowInfo {
		return { n: w.n, name: w.name, state: w.state, current: current() === w.n, pid: w.session?.pid, pts: w.session?.pts, note: w.note || undefined };
	}

	function list(): WindowInfo[] {
		return [{ n: 0, name: "con", state: "open", current: current() === 0 }, ...[...wins.values()].sort((a, b) => a.n - b.n).map(info)];
	}

	function pixels(w: Win) {
		const cell = parseFloat(w.el.style.getPropertyValue("--term-cell-width")) || 0;
		const row = parseFloat(w.el.style.getPropertyValue("--term-row-height")) || 0;
		return { x: Math.min(0xffff, Math.round(w.term.cols * cell)), y: Math.min(0xffff, Math.round(w.term.rows * row)) };
	}

	function write(w: Win, s: string) {
		if (!w.gone) w.term.write(s);
	}

	/** The window stays, showing why its session is over, until it is closed. */
	function endWith(w: Win, msg: string) {
		if (w.gone) return;
		w.state = "ended";
		w.note = msg;
		w.session = null;
		w.pending = [];
		write(w, `\r\n${SGR.red}[host] ${msg.replace(/\n/g, "\r\n")}${SGR.off}\r\n${SGR.gray}[host] Enter or ${PREFIX} x closes this window${SGR.off}\r\n`);
		publish();
	}

	/** Remove window w; if it was shown, show the one shown before it. */
	function remove(w: Win) {
		if (w.gone) return;
		w.gone = true;
		w.abort.abort();
		const wasCurrent = current() === w.n;
		const had = !!(document.activeElement as HTMLElement | null)?.closest?.(`#${w.el.id}`);
		wins.delete(w.n);
		history = history.filter((h) => h !== w.n);
		if (wasCurrent) {
			const next = history.find((h) => h === 0 || wins.has(h)) ?? 0;
			show(next);
			history = history.filter((h) => h !== w.n);
			if (opts.autoFocus || had) focus();
		}
		w.term.destroy();
		w.bottom.dispose();
		w.el.remove();
		publish();
	}

	function input(w: Win, d: string | Uint8Array) {
		if (w.state === "open" && w.session) w.session.write(d).catch(() => {});
		else if (w.state === "ended" && typeof d === "string" && d.includes("\r")) void close(w.n);
		else if (w.state === "opening" && w.pendingBytes + d.length <= PENDING_MAX) {
			w.pending.push(d);
			w.pendingBytes += d.length;
		}
	}

	/** Read the session's output for as long as it lasts (see the top of this file). */
	async function pump(w: Win, s: Pty) {
		const reader = s.output.getReader();
		let t = performance.now(), bytes = 0;
		try {
			for (;;) {
				const r = await reader.read();
				if (r.done) return;
				if (w.gone) { void reader.cancel(); return; } // closed: discard the rest, so `ended` settles
				w.term.write(r.value);
				bytes += r.value.length;
				if (bytes >= SLICE_BYTES || performance.now() - t >= SLICE_MS) {
					await yieldTask();
					t = performance.now();
					bytes = 0;
				}
			}
		} catch {
			// The session failed: `ended` rejects with why.
		}
	}

	function watch(w: Win, s: Pty) {
		s.ended.then((end) => {
			if (w.gone) return;
			if (end.type === "exit" || end.type === "closed") remove(w);
			else if (end.type === "signal") {
				KW.ui?.toast(`Window ${w.n}: the shell was killed by signal ${end.signal}${end.coreDumped ? " (core dumped)" : ""}`);
				remove(w);
			} else if (!opts.alive()) remove(w); // the kernel stopped: closeAll()
			else endWith(w, "The session was lost: its connection closed without an exit status.");
		}, (e: unknown) => {
			if (!w.gone) endWith(w, `The session failed: ${(e as Error)?.message ?? e}`);
		});
	}

	/** Why spawn() failed, for the window; null: nothing to show (closed, or the kernel stopped). */
	function openFailure(e: unknown): string | null {
		const code = e instanceof PtyError ? e.code : undefined;
		if (code === "ABORTED" || code === "ECONNABORTED" || !opts.alive()) return null;
		if (code === "ETIMEDOUT")
			return `No terminal server answered in the guest within ${OPEN_TIMEOUT / 1000} s (kwtty on vsock port 1022). Window 0 still works.\n` +
				"The distro's init must keep /usr/bin/kwtty serve running (Alpine: the line ::respawn:/usr/bin/kwtty serve in /etc/inittab). " +
				"A root changed on the data disk can hide the image's init files (kw-overlay status says where the changes are).";
		if (code === "ENODEV") return "This kernel was started without the vsock device, so it has no terminal sessions.";
		if (code === "EREMOTE") return `The guest refused the session: ${(e as Error).message.replace(/^kwtty: /, "")}`;
		return `The terminal session could not open: ${(e as Error)?.message ?? e}`;
	}

	/** Settle with p, or reject when the signal aborts. */
	const abortable = <T>(p: Promise<T>, signal: AbortSignal): Promise<T> => new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new PtyError("ABORTED", "the window was closed"));
		if (signal.aborted) return onAbort();
		signal.addEventListener("abort", onAbort, { once: true });
		p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
	});

	async function open({ select: sel = true, name, file, args }: { select?: boolean; name?: string; file?: string; args?: string[] } = {}): Promise<WindowInfo> {
		if (!opts.alive()) throw new Error("The kernel is not running: reboot to open terminal windows");
		let n = 1;
		while (wins.has(n)) n++;
		if (n > MAX_WINDOWS) throw new Error(`All ${MAX_WINDOWS} terminal windows are open`);
		const tty = name === undefined;
		name ??= `tty ${n}`;
		const el = document.createElement("div");
		el.id = `term-${n}`;
		el.className = "term-win term-off";
		el.inert = true;
		setTermFont(el, KW.config.fontSize);
		host().appendChild(el);
		const bottom = trackBottom(el); // before wterm's own ResizeObserver
		const w: Win = {
			n, name, tty, fg: "", el, bottom, term: null as unknown as WTerm, state: "opening", note: "", session: null,
			abort: new AbortController(), pending: [], pendingBytes: 0, gone: false,
		};
		w.term = new WTerm(el, {
			...TERM_OPTIONS,
			// A native paste can carry CRLF (Windows clipboard); CR and LF would be two Enters,
			// splitting `\` continuations. Typed Enter is a lone CR, so it is unaffected.
			onData: (d) => {
				const text = normalizeInput(d);
				input(w, KW.ui ? KW.ui.applyCtrl(text) : text);
			},
			onBinary: (d) => input(w, d),
			onResize: (cols, rows) => { const px = pixels(w); w.session?.resize(cols, rows, px.x, px.y); },
		});
		w.term.setRenderingPaused(true);
		wins.set(n, w);
		publish();
		if (sel) select(n);
		const failed = (msg: string): OpenError => Object.assign(new Error(msg), { window: n });
		try {
			await w.term.init();
		} catch (e) {
			const msg = `The terminal failed to start: ${(e as Error)?.message ?? e}`;
			endWith(w, msg);
			throw failed(msg);
		}
		if (w.gone) throw failed("The window was closed");
		el.querySelector("textarea")?.setAttribute("enterkeyhint", "enter");
		if (current() === n && (opts.autoFocus || el.contains(document.activeElement))) focus();
		// A line while it waits (the guest may still be booting), cleared once the shell runs.
		let waiting = false;
		const waitTimer = setTimeout(() => { waiting = true; write(w, `${SGR.gray}[host] window ${n}: waiting for the guest's terminal server…${SGR.off}`); }, 300);
		let s: Pty;
		try {
			const vm = await abortable(opts.ready(), w.abort.signal);
			const px = pixels(w);
			s = await vm.spawn(file, args ?? [], { cols: w.term.cols, rows: w.term.rows, xpixel: px.x, ypixel: px.y, timeout: OPEN_TIMEOUT, signal: w.abort.signal });
		} catch (e) {
			clearTimeout(waitTimer);
			const msg = openFailure(e);
			if (msg === null || w.gone) {
				remove(w);
				throw failed((e as Error)?.message ?? "The window was closed");
			}
			if (waiting) write(w, "\r\x1b[2K");
			endWith(w, msg);
			throw failed(msg);
		}
		clearTimeout(waitTimer);
		if (w.gone) {
			void s.close().catch(() => {});
			throw failed("The window was closed");
		}
		if (waiting) write(w, "\r\x1b[2K");
		w.session = s;
		w.state = "open";
		const px = pixels(w);
		s.resize(w.term.cols, w.term.rows, px.x, px.y); // it may have changed while opening
		for (const d of w.pending) s.write(d).catch(() => {});
		w.pending = [];
		w.pendingBytes = 0;
		publish();
		void pump(w, s);
		watch(w, s);
		scheduleFg();
		return info(w);
	}

	async function close(n: number): Promise<void> {
		const w = wins.get(n);
		if (!w) return;
		const s = w.session;
		remove(w);
		// Hang up: the shell gets SIGHUP. remove() already let go of the output.
		if (s) await s.close().catch(() => {});
	}

	return {
		list,
		open,
		select,
		close,
		text: (n) => { const t = termOf(n); return t ? termText(t) : ""; },
		send(n, data) {
			if (n === 0) opts.send0(data);
			else { const w = wins.get(n); if (w) input(w, data); }
		},
		currentTerm: () => termOf(current()) ?? opts.term0,
		sendCurrent(data) {
			const n = current();
			if (n === 0) opts.send0(data);
			else { const w = wins.get(n); if (w) input(w, data); }
		},
		focus,
		setFont(px) { for (const w of wins.values()) setTermFont(w.el, px); },
		closeAll() {
			for (const w of [...wins.values()]) {
				const s = w.session;
				remove(w);
				if (s) void s.close().catch(() => {});
			}
		},
	};
}
