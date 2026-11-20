// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The page chrome's imperative side: the API that main.ts and boot.ts drive
// (KW.ui: state, boot stages, environment checks, kernel log, errors, panel,
// toast, data disk status, Reboot) on top of the store (store.ts) that the
// React components (components/) render. Also the actions those components
// run: Copy diagnostics, the data disk buttons, the key bar, paste, font size.
import { flushSync } from "react-dom";
import { DEFAULT_CMDLINE, DEFAULT_DISTRO, saveSettings, type Config } from "./config.ts";
import { KW as currentKW, type KWError } from "./kw.ts";
import { initStore, type Ask, type CheckResult, type Options, type State, type Tab, type UiState } from "./store.ts";

export type { CheckResult, State } from "./store.ts";
export type StageState = "pending" | "active" | "done" | "fail" | "skip";

export const fmtT = (ms: number | null | undefined): string =>
	ms == null ? "" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
export const fmtMiB = (n: number): string => `${(n / 1048576).toFixed(1)} MiB`;

export function store(k: string, v?: string): string | null {
	try {
		if (v === undefined) return localStorage.getItem(`kw.${k}`);
		localStorage.setItem(`kw.${k}`, v);
	} catch {}
	return null;
}

/** sessionStorage: the Resume button reloaded the page, so resume the suspended session without asking. */
const RESUME_KEY = "kw-resume";
/** True once after the Resume button's reload (boot.ts). */
export function takeResumeRequest(): boolean {
	try {
		const v = sessionStorage.getItem(RESUME_KEY);
		sessionStorage.removeItem(RESUME_KEY);
		return v === "1";
	} catch {
		return false;
	}
}

interface BrowserInfo { name: string; v: number; ios?: boolean }

export function browser(): BrowserInfo {
	const ua = navigator.userAgent;
	let m: RegExpExecArray | null;
	if ((m = /EdgA?\/(\d+)/.exec(ua))) return { name: "Edge", v: +m[1]! };
	if ((m = /SamsungBrowser\/(\d+)/.exec(ua))) return { name: "Samsung Internet", v: +m[1]! };
	if ((m = /(?:Firefox|FxiOS)\/(\d+)/.exec(ua))) return { name: "Firefox", v: +m[1]!, ios: /FxiOS/.test(ua) };
	if ((m = /CriOS\/(\d+)/.exec(ua))) return { name: "Chrome (iOS)", v: +m[1]!, ios: true };
	if ((m = /Chrome\/(\d+)/.exec(ua))) return { name: "Chrome", v: +m[1]! };
	// iPadOS Safari presents a Mac UA; touch points give it away.
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	if ((m = /Version\/(\d+).*Safari/.exec(ua))) return { name: "Safari", v: +m[1]!, ios };
	return { name: "unknown browser", v: 0, ios };
}

const B = browser();

function hintFor(msg: string): string {
	if (/JSPI|Suspending|promising/i.test(msg)) {
		let s = "The kernel switches tasks with JSPI (WebAssembly JavaScript Promise Integration). " +
			"It is on by default in Chrome and Edge 137+ (desktop and Android) and in Safari 27+ (macOS, iOS and iPadOS 27).";
		if (B.ios) s += " On iPhone and iPad every browser (Safari, Chrome, Firefox, …) uses the system WebKit, so JSPI depends on the iOS version: update to iOS/iPadOS 27 or later." +
			(B.name === "Safari" && B.v ? ` This is Safari ${B.v}.` : "");
		else if (B.name === "Chrome" && B.v && B.v < 137) s += ` This is Chrome ${B.v}: update it (Play Store → Chrome → Update, or chrome://settings/help). Chrome 126–136 can try chrome://flags/#enable-experimental-webassembly-jspi.`;
		else if (B.name === "Samsung Internet") s += ` Samsung Internet ${B.v} is built on an older Chromium; use Chrome 137+ instead.`;
		else if (B.name === "Firefox") s += " Firefox only has it behind about:config javascript.options.wasm_js_promise_integration (Nightly).";
		else if (B.name === "Safari") s += ` This is Safari ${B.v || "(unknown version)"}; update macOS/Safari to 27 or later.`;
		return s;
	}
	if (/allocate|Memory\(\)|out of memory|array buffer/i.test(msg))
		return "The browser refused the kernel's memory. Phones (especially 32-bit Chrome builds) have little contiguous address space; " +
			"pick a smaller size under Options (e.g. 128 MiB) or add ?mem=128 to the URL. Alpine boots in 64 MiB.";
	if (/\b(404|403|500)\b|Failed to fetch|NetworkError|network/i.test(msg))
		return "The kernel could not be downloaded. Check the network and reload; a page from an older deploy may refer to a kernel that is gone.";
	if (/module|script/i.test(msg))
		return "A page script failed to load or parse: check the network and the server log. A browser too old for the syntax fails the same way; Chrome/Edge 137+ or Safari 27+ is required anyway.";
	const smp = (currentKW?.config?.cpus ?? 1) > 1;
	if (/panic|trap|unreachable|RuntimeError/i.test(msg) || (smp && /\bCPU \d/.test(msg)))
		return "The kernel stopped. The kernel log tab has the last console lines; Copy diagnostics and reboot." +
			(smp ? " To rule out the SMP kernel, set CPUs to 1 under Options and reboot." : "");
	return "";
}

const LABEL: Record<State, string> = { checking: "Checking", loading: "Downloading", booting: "Booting", running: "Running", halted: "Halted", error: "Error" };

interface Stage { id: string; label: string; s: StageState; t0: number | null; t1: number | null; detail: string }
export interface LogLine { t: number; line: string; cls: string }

/** Phones: 12 px fits ~47 columns at 360 px. */
export const autoFont = (): number => (innerWidth < 600 ? 12 : 14);

export function createUi(cfg: Config) {
	// This mount's KW (kw.ts): a callback that runs after the shell stopped never reaches the next mount's.
	const KW = currentKW;
	const now = () => Date.now() - KW.t0;

	const fontPref = store("font") || "auto";
	cfg.fontSize = fontPref === "auto" ? autoFont() : Number(fontPref);
	const options: Options = {
		mem: cfg.memParam || "auto",
		// Dashboard port: servers from readConfig()'s defaults (LAMASSU_TERMINAL_WISP_URL) are the
		// default, not custom ones, so that Reboot does not save them as a setting (config.ts).
		net: !cfg.net ? "off" : cfg.wisp && cfg.settings.wisp !== undefined ? "custom" : "default",
		wisp: cfg.settings.wisp !== undefined ? (cfg.wisp ?? []).join(", ") : "", // the default servers are not shown
		jit: cfg.jit ? "on" : "off",
		verbose: cfg.verbose ? "keep" : "clear",
		append: cfg.baseCmdline,
		data: cfg.data ? "on" : "off",
		root: cfg.root === "initramfs" ? "safe" : "overlay",
		worker: cfg.workerParam ? "on" : "off",
		cpus: String(cfg.smpParam),
		distro: cfg.distroParam,
	};
	// Where the root's changes live on the data disk: per distro (guest/base/initramfs/init).
	const upperDir = `/data/distros/${cfg.guest}/upper`;
	const imageName = `${cfg.guest} image`;
	const $ = initStore({
		state: "checking", label: LABEL.checking, suspended: false,
		splash: { title: "Starting", msg: "Loading the page scripts…", hidden: false, error: false, details: false },
		checks: [], errors: [], fatal: null,
		panelOpen: false, tab: "status", toast: null,
		dataStatus: "Not attached yet.", disk: null,
		safeNote: cfg.root === "initramfs" && cfg.distro
			? `Safe mode: the root is the plain ${imageName} (kw.root=initramfs, until you leave safe mode); /data is mounted as usual and your root changes stay in ${upperDir}. kw-overlay status explains, kw-overlay discard starts over from the image.`
			: null,
		distro: cfg.distro ? { name: cfg.distro.name, image: cfg.distro.imageId ?? "", url: cfg.distro.url } : null,
		ctrl: false, keysOn: false, pasteOpen: false, ask: null, prefix: false,
		fontPref, fontSize: cfg.fontSize, copyText: null,
		win: 0, wins: [],
		options,
	} satisfies UiState);

	// ---- boot stages ------------------------------------------------------
	// Timed here, shown on the terminal by boot.ts and in Copy diagnostics.
	const STAGES: Array<[string, string]> = [
		["preflight", "Feature checks"], ["kernel", "Download kernel + root file system"],
		["compile", "Compile kernel"], ["memory", "Allocate memory"], ["boot", "Kernel boot"], ["userspace", "Start user space"],
	];
	const stages: Record<string, Stage> = {};
	for (const [id, label] of STAGES) stages[id] = { id, label, s: "pending", t0: null, t1: null, detail: "" };

	// The kernel log is kept outside the store: it grows by a line at a time,
	// and the Kernel log tab appends to its <pre> instead of re-rendering.
	const logLines: LogLine[] = [];
	const logListeners = new Set<(reset: boolean) => void>();
	const LOG_MAX = 4000;
	let fatalShown = false;
	let opener: HTMLElement | null = null;
	let toastId = 0, toastTimer: ReturnType<typeof setTimeout> | undefined;
	let askId = 0, answer: ((ok: boolean) => void) | null = null;

	const ui = {
		state: (): State => $.get().state,
		setState(s: State, label?: string) {
			const cur = $.get().state;
			if (cur === "error" || (cur === "halted" && s !== "error")) return; // terminal states stick
			$.set({ state: s, label: label || LABEL[s] });
		},
		splash(title: string, msg?: string, force?: boolean) {
			if ($.get().state === "error" && !force) return;
			$.set((s) => ({ splash: { ...s.splash, title, msg: msg || "" } }));
		},
		hideSplash() { $.set((s) => ({ splash: { ...s.splash, hidden: true } })); },

		stage(id: string, s: StageState, detail?: string) {
			const st = stages[id];
			if (!st) return;
			if (s === "active" && st.t0 == null) st.t0 = now();
			if ((s === "done" || s === "fail") && st.t1 == null) { st.t1 = now(); st.t0 ??= st.t1; }
			st.s = s;
			if (detail != null) st.detail = detail;
		},
		/** State of a stage: pending, active, done, fail or skip. */
		stageState: (id: string): StageState | null => stages[id]?.s ?? null,
		/** Duration in ms of a finished stage, else null. */
		stageTime(id: string): number | null {
			const st = stages[id];
			return st && st.t0 != null && st.t1 != null ? st.t1 - st.t0 : null;
		},

		check(id: string, label: string, r: CheckResult, value: string, note?: string) {
			$.set((s) => {
				const c = { id, label, r, value, note: note || "" };
				const i = s.checks.findIndex((x) => x.id === id);
				return { checks: i < 0 ? [...s.checks, c] : s.checks.map((x, j) => (j === i ? c : x)) };
			});
		},

		log(line: string, cls?: string) {
			logLines.push({ t: now(), line, cls: cls || "" });
			const reset = logLines.length > LOG_MAX;
			if (reset) logLines.splice(0, logLines.length - LOG_MAX);
			for (const l of logListeners) l(reset);
		},
		hostLog(m: string) { ui.log(m, /fatal|panic|trap|error|fail/i.test(m) ? "e" : "h"); },
		/** The Kernel log tab: the lines, and a subscription (reset: the oldest lines were dropped). */
		logView: { lines: logLines as readonly LogLine[], subscribe(l: (reset: boolean) => void) { logListeners.add(l); return () => { logListeners.delete(l); }; } },

		onError(e: KWError) {
			e.hint ||= hintFor(`${e.message} ${e.detail || ""}`);
			ui.log(`[${e.kind}] ${e.message}`, "e");
			$.set({ errors: [...KW.errors] });
			if (e.fatal) fatal(e);
			else ui.toast(e.message);
		},
		fail(kind: string, message: string, detail?: string, extra?: Partial<KWError>): KWError {
			const e: KWError = { t: now(), kind, message: String(message), detail: detail ? String(detail) : "", fatal: true, ...extra };
			KW.errors.push(e);
			ui.onError(e);
			return e;
		},

		openPanel(t?: Tab) {
			if (!$.get().panelOpen) {
				// Focus goes back here on close: a status line button the dialog was opened from.
				const a = document.activeElement as HTMLElement | null;
				opener = a?.closest?.("#bar") ? a : null;
				a?.blur?.();
			}
			$.set((s) => ({ panelOpen: true, tab: t ?? s.tab }));
			// Keys go to the dialog, not to the terminal under it (shortcuts.ts): focus its
			// current tab, so arrows move between tabs and Tab goes on into the pane.
			if (!cfg.coarse || opener) requestAnimationFrame(() => {
				const p = document.getElementById("panel");
				if (p && !p.contains(document.activeElement)) (p.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? p).focus({ preventScroll: true });
			});
		},
		closePanel() {
			if (!$.get().panelOpen) return;
			$.set({ panelOpen: false });
			const back = opener;
			opener = null;
			if (back?.isConnected) back.focus({ preventScroll: true });
			else if (!cfg.coarse) KW.term?.focus();
		},
		/** The bar's shortcuts: open the panel on that tab, or close it if already there. */
		togglePanel(t: Tab) {
			const s = $.get();
			if (s.panelOpen && s.tab === t) ui.closePanel();
			else ui.openPanel(t);
		},
		selectTab(t: Tab) { $.set({ tab: t }); },
		setPrefix(on: boolean) { if ($.get().prefix !== on) $.set({ prefix: on }); },
		/** Reboot from a shortcut or the status line: one key away from a running session, so ask first. */
		async confirmReboot() {
			const state = $.get().state;
			if ((state === "running" || state === "booting") &&
				!await ui.ask({ title: "reboot", msg: "The running system and its unsaved state are lost.", ok: "Reboot", danger: true })) return;
			reboot();
		},
		/** Suspend from a shortcut or the dialog: asks first (boot.ts does it: KW.suspend). */
		async confirmSuspend() {
			if (cfg.cpus > 1) { ui.toast("Suspend needs one CPU: the SMP kernel cannot be saved (Options, CPUs)"); return; }
			if (!KW.suspend || $.get().state !== "running") { ui.toast("Suspend works once the system runs"); return; }
			if (!await ui.ask({ title: "suspend", msg: "Save the running system in this browser and stop it? The next load offers to resume it. Terminal windows 1-9 and network connections do not survive.", ok: "Suspend" })) return;
			ui.closePanel();
			ui.toast("Suspending…");
			KW.suspend().then((r) => ui.toast(`Suspended: ${fmtMiB(r.bytes)} saved in this browser`),
				(e: Error) => KW.report("suspend", `Suspend failed: ${e?.message ?? String(e)}`, e?.stack ?? "", false));
		},
		/** boot.ts, once Suspend has saved the system and the kernel stopped. */
		setSuspended() { $.set({ suspended: true }); },
		/**
		 * Resume after Suspend: start the shell again and resume without asking
		 * (boot.ts reads RESUME_KEY once). The restart keeps the settings, so the
		 * devices match the saved session.
		 */
		resume() {
			try { sessionStorage.setItem(RESUME_KEY, "1"); } catch { /* the next load asks instead */ }
			KW.reload?.();
		},

		/**
		 * Ask in the confirm dialog (components/Overlays.tsx, a modal <dialog>)
		 * instead of confirm(): true for OK. A newer question cancels an open one.
		 */
		ask(q: Omit<Ask, "id">): Promise<boolean> {
			answer?.(false);
			if (document.pointerLockElement) document.exitPointerLock(); // the pointer must reach the buttons
			return new Promise((resolve) => {
				answer = (ok) => { answer = null; $.set({ ask: null }); resolve(ok); };
				$.set({ ask: { ...q, id: ++askId } });
			});
		},
		/** The confirm dialog's answer. */
		answer(ok: boolean) { answer?.(ok); },

		toast(msg: string) {
			$.set({ toast: { msg: msg.length > 140 ? `${msg.slice(0, 137)}…` : msg, id: ++toastId } });
			clearTimeout(toastTimer);
			toastTimer = setTimeout(() => $.set({ toast: null }), 3200);
		},

		/** The Data disk section's status line (boot.ts). */
		dataStatus(text: string) { $.set({ dataStatus: text }); },
		/** The status line's disk segment (boot.ts, every 5 s). */
		diskUsage(used: number, size: number, saved: boolean) {
			const d = $.get().disk;
			if (d?.used !== used || d.size !== size || d.saved !== saved) $.set({ disk: { used, size, saved } });
		},
		/**
		 * The base fell back to safe mode for this boot (boot.ts saw "kw-overlay: SAFE MODE: <reason>"):
		 * the root with the changes failed its check, so this boot runs the plain image. Each boot checks again.
		 */
		safeMode(reason: string) {
			$.set({
				safeNote: `Safe mode: ${reason}. This boot runs the plain ${imageName}; your changes to the root are kept, unused, in ${upperDir}. ` +
					"Fix them there and reboot: each boot tries them again (kw-overlay status explains, kw-overlay discard sets them aside and starts over from the image).",
			});
			ui.check("overlay", "Root", "warn", "safe mode", reason);
			ui.toast(`Safe mode: ${reason}. Your root changes are kept but unused this boot; fix them and reboot.`);
		},

		/**
		 * The base found no distro to boot and started its base shell (boot.ts
		 * saw "unkernel base shell (...): <reason>").
		 */
		baseShell(reason: string) {
			if (cfg.distro) {
				ui.check("overlay", "Root", "warn", "base shell", `the ${cfg.distro.name} image did not boot: ${reason}`);
				KW.report("distro", `The ${cfg.distro.name} image did not boot (${reason}): this is the base shell. Reboot, or pick another distro under Options.`, "", false);
			} else ui.check("overlay", "Root", "info", "base shell", `no distro (?distro=none): ${reason}`);
		},
		/** What the guest says it booted (/run/kw-base; boot.ts). */
		distroBooted(image: string) {
			const d = $.get().distro;
			if (d && image && d.image !== image) $.set({ distro: { ...d, image } });
		},

		diagText,
		/** The page URL that Reboot loads (the Options as chosen; config.ts reads them back); defaults are left out. */
		nextSettings, optionsChanged,
		/** Reload the page with the Options as chosen, like the Reboot button. */
		reboot,
		setOption<K extends keyof Options>(k: K, v: Options[K]) { $.set((s) => ({ options: { ...s.options, [k]: v } })); },

		/** Turn the next typed character into its control code when the key bar's Ctrl is armed. */
		applyCtrl(d: string): string {
			if (!$.get().ctrl || d.length !== 1) return d;
			ui.setCtrl(false);
			const c = d.charCodeAt(0);
			if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return String.fromCharCode(c & 31);
			const map: Record<string, number> = { "@": 0, " ": 0, "2": 0, "[": 27, "3": 27, "\\": 28, "4": 28, "]": 29, "5": 29, "^": 30, "6": 30, "~": 30, "_": 31, "-": 31, "/": 31, "7": 31, "?": 127, "8": 127 };
			return d in map ? String.fromCharCode(map[d]!) : d;
		},
		setCtrl(on: boolean) { $.set({ ctrl: on }); },
		/** A key bar button: arrows, Esc, Tab, ^C, Ctrl (latches), Paste, or a character. */
		pressKey(k: string) {
			const ctrl = $.get().ctrl;
			if (k === "ctrl") { ui.setCtrl(!ctrl); return; }
			if (k === "paste") { ui.setCtrl(false); openPaste(); return; }
			if (!KW.term) return;
			const arrows: Record<string, string> = { up: "A", down: "B", right: "C", left: "D" };
			let seq: string;
			if (arrows[k]) seq = ctrl ? `\x1b[1;5${arrows[k]}` : (KW.term.appCursor() ? "\x1bO" : "\x1b[") + arrows[k];
			else if (k === "esc") seq = "\x1b";
			else if (k === "tab") seq = "\t";
			else if (k === "^c") seq = "\x03";
			else seq = ui.applyCtrl(k);
			ui.setCtrl(false);
			KW.term.send(seq);
		},
		closePaste() { $.set({ pasteOpen: false }); KW.term?.focus(); },
		sendPaste(t: string) {
			if (t && KW.term) KW.term.paste(t);
			ui.closePaste();
		},

		/** The Font size option ("auto" or px), or a pinch (px, whole, 9 to 24). */
		setFont(pref: string) {
			const size = pref === "auto" ? autoFont() : Math.min(24, Math.max(9, Math.round(Number(pref))));
			if (pref !== "auto") pref = String(size);
			store("font", pref);
			cfg.fontSize = size;
			$.set({ fontPref: pref, fontSize: size });
			KW.term?.setFontSize(size);
		},

		copyDiagnostics,
		dataExport, dataImport, dataReset, safeModeToggle,
	};

	function fatal(e: KWError) {
		for (const id in stages) if (stages[id]!.s === "active") ui.stage(id, "fail");
		ui.setState("error", "Error");
		if (fatalShown) return;
		fatalShown = true;
		const titles: Record<string, string> = { resource: "A page script failed to load", exception: "Script error", rejection: "Script error",
			watchdog: "Startup stalled", preflight: "This browser cannot run the kernel" };
		$.set({ fatal: { title: e.title || titles[e.kind] || `Stopped: ${e.kind}`, msg: e.message, hint: e.hint || "" } });
		if (!$.get().splash.hidden) $.set({ splash: { title: e.title || "Couldn't start", msg: e.message, hidden: false, error: true, details: true } });
		KW.term?.notice(`[host] ${e.message}`);
		ui.openPanel("errors");
	}

	// ---- diagnostics / copy / reboot ---------------------------------------
	function diagText(): string {
		const s = $.get();
		const L: string[] = [];
		L.push(`unkernel diagnostics, ${new Date().toISOString()}`);
		L.push(`url: ${location.href}`);
		L.push(`state: ${s.state} (${s.label}) after ${fmtT(now())}`);
		L.push(`config: mem=${cfg.memMiB} MiB (${cfg.memWhy})${KW.memActualMiB ? ` allocated=${KW.memActualMiB} MiB` : ""} kernel=${cfg.cpus > 1 ? cfg.kernelSmpUrl : cfg.kernelUrl} distro=${cfg.guest}${s.distro ? ` image=${s.distro.image || "?"} (${s.distro.url})` : ""} cmdline="${cfg.cmdline}"${cfg.worker ? " worker=1" : ""}${cfg.smpParam > 1 ? ` cpus=${cfg.cpus}${cfg.smpWhy ? ` (asked ${cfg.smpParam}: ${cfg.smpWhy})` : ""}` : ""}`);
		L.push("", "== stages");
		for (const [id] of STAGES) {
			const st = stages[id]!;
			L.push(`  ${id}: ${st.s}${st.t0 != null ? ` @${fmtT(st.t0)}` : ""}${st.t1 != null ? ` took ${fmtT(st.t1 - st.t0!)}` : ""}${st.detail ? ` - ${st.detail}` : ""}`);
		}
		L.push("", "== environment");
		for (const c of s.checks) L.push(`  [${c.r}] ${c.label}: ${c.value}${c.note ? ` (${c.note})` : ""}`);
		L.push("", `== errors (${KW.errors.length})`);
		for (const e of KW.errors) {
			L.push(`  +${fmtT(e.t)} ${e.kind}${e.fatal ? " FATAL" : ""}: ${e.message}`);
			if (e.detail) L.push(`    ${e.detail.split("\n").join("\n    ")}`);
		}
		L.push("", "== log (last 300 lines)");
		for (const l of logLines.slice(-300)) L.push(l.line);
		return L.join("\n");
	}
	function copyDiagnostics() {
		const text = diagText();
		const fallback = () => {
			flushSync(() => $.set({ copyText: text })); // the textarea must exist to select it
			const area = document.getElementById("copy-area") as HTMLTextAreaElement | null;
			let ok = false;
			if (area) {
				area.focus();
				area.select();
				try { ok = document.execCommand("copy"); } catch {}
				area.scrollIntoView({ block: "nearest" });
			}
			ui.toast(ok ? "Diagnostics copied" : "Clipboard unavailable here: select the text below and copy it");
		};
		if (navigator.clipboard?.writeText && isSecureContext) navigator.clipboard.writeText(text).then(() => ui.toast("Diagnostics copied"), fallback);
		else fallback();
	}

	/**
	 * The settings Reboot saves (config.ts SETTINGS_KEY): the options as
	 * chosen, by their parameter names, only where they differ from the
	 * defaults; a setting without a control (?shared=) is kept as it is.
	 */
	function nextSettings(): Record<string, string> {
		const o = $.get().options;
		const p = new URLSearchParams(cfg.settings);
		const set = (k: string, v: string | null) => (v === null ? p.delete(k) : p.set(k, v));
		set("mem", o.mem === "auto" ? null : o.mem);
		const wisp = o.wisp.split(",").map((s) => s.trim()).filter(Boolean).join(",");
		set("wisp", o.net === "off" ? "0" : o.net === "custom" && wisp ? wisp : null);
		set("jit", o.jit === "off" ? "0" : null);
		set("verbose", o.verbose === "keep" ? "1" : null);
		const append = o.append.trim();
		set("append", append && append !== DEFAULT_CMDLINE ? append : null);
		set("data", o.data === "off" ? "0" : null);
		set("root", o.root === "safe" ? "initramfs" : null);
		// Worker thread and CPUs: saved only where they differ from this device's defaults (config.ts).
		set("worker", (o.worker === "on") === cfg.workerDefault ? null : o.worker === "on" ? "1" : "0");
		// The next load's default count: the suggestion in worker mode (config.ts cpuDefault).
		const cpuNext = o.worker === "on" && !cfg.smpBlocked && cfg.cpuSuggested ? cfg.cpuSuggested : 1;
		set("cpus", o.cpus === String(cpuNext) ? null : o.cpus);
		set("distro", o.distro === DEFAULT_DISTRO ? null : o.distro);
		return Object.fromEntries([...p].sort(([a], [b]) => a.localeCompare(b)));
	}
	/** The options differ from the settings this load booted with (the Reboot button says so). */
	function optionsChanged(): boolean {
		const sorted = (s: Record<string, string>) => JSON.stringify(Object.entries(s).sort(([a], [b]) => a.localeCompare(b)));
		return sorted(nextSettings()) !== sorted(cfg.settings);
	}
	let rebooting = false;
	/** A data disk reset or import is running (dataAction); it ends in a reload. */
	let dataBusy = false;
	function reboot() {
		if (rebooting) return;
		// A reset or import in progress reloads the page itself; a reload now would cut it off.
		if (dataBusy) { ui.toast("The data disk is being replaced; the page reloads when it is done"); return; }
		rebooting = true;
		// Save the options and start the shell again with them (mount.tsx; the page URL is
		// never written): the URL's settings applied to one load and are saved with the rest
		// now. Where localStorage refuses, the restart still gets them.
		const next = nextSettings();
		saveSettings(next);
		const go = () => KW.reload?.(next);
		// Let the guest write its file systems back to the saved disks first
		// (boot.ts: KW.sync, at most 3 s).
		if (KW.beforeReboot && $.get().state === "running") {
			ui.toast("Saving disks…");
			KW.beforeReboot().then(go, go);
		} else go();
	}

	// ---- data disk ------------------------------------------------------------
	// The actions live in boot.ts (KW.exportData / importData / resetData).
	function dataAction(name: "exportData" | "importData" | "resetData", run: () => Promise<unknown>) {
		if (!KW[name]) { ui.toast("The data disk is not ready yet"); return; }
		if (dataBusy) { ui.toast("The data disk is busy; wait for it to finish"); return; }
		dataBusy = name !== "exportData";
		run().finally(() => { dataBusy = false; }).catch((e: Error) => KW.report("data", `Data disk: ${e?.message ?? String(e)}`, e?.stack ?? "", false));
	}
	function dataExport() {
		dataAction("exportData", async () => {
			ui.toast("Exporting the data disk…");
			const r = await KW.exportData!();
			ui.toast(`Saved ${r.name} (${fmtMiB(r.bytes)})`);
		});
	}
	/** Without a file, asks first; true: go on and pick the file (the OK click still counts as a user gesture). */
	async function dataImport(f?: File): Promise<boolean> {
		if (!KW.importData) { ui.toast("The data disk is not ready yet"); return false; }
		if (!f) return ui.ask({ title: "import data disk", msg: "Replace /data with a .kwsparse.gz file? Its current content is lost, and the page reloads.", ok: "Choose file…", danger: true });
		dataAction("importData", () => { ui.toast(`Importing ${f.name}…`); return KW.importData!(f); });
		return true;
	}
	async function dataReset() {
		if (!await ui.ask({ title: "reset data disk", msg: "Everything in /data is deleted, and the page reloads.", ok: "Reset", danger: true })) return;
		dataAction("resetData", () => { ui.toast("Resetting the data disk… the page reloads when it is done"); return KW.resetData!(); });
	}
	// Safe mode: one boot on the plain image root (kw.root=initramfs), with
	// /data still mounted, to repair or turn off an overlay root (kw-overlay).
	async function safeModeToggle() {
		const state = $.get().state;
		if (cfg.root !== "initramfs" && (state === "running" || state === "booting") &&
			!await ui.ask({ title: "safe mode", msg: `Reboot on the plain ${imageName} as the root: your root changes on /data are not used. /data stays mounted.`, ok: "Reboot" })) return;
		ui.setOption("root", cfg.root === "initramfs" ? "overlay" : "safe");
		reboot();
	}

	// ---- paste ------------------------------------------------------------------
	function openPaste() {
		const show = () => $.set({ pasteOpen: true });
		if (navigator.clipboard?.readText && isSecureContext) {
			navigator.clipboard.readText().then((t) => { if (t && KW.term) KW.term.paste(t); else show(); }, show);
		} else show();
	}

	return ui;
}

export type Ui = ReturnType<typeof createUi>;
