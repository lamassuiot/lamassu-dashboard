// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// Keyboard shortcuts (the dialog's Keys tab lists them):
// - the prefix: Ctrl-A as in GNU screen, then a key (COMMANDS). Ctrl-A
//   twice sends one Ctrl-A on to the guest (readline's start of line, or a
//   screen or tmux in the guest). On Apple devices ⌘A is the prefix too
//   (in place of the browser's select all), and ⌘ may stay held for the
//   command key: ⌘A ⌘K is ⌘A k. While it is armed, the status line shows
//   each item's key on it;
// - digits are windows, as in screen and tmux: Ctrl-A 0 or Ctrl-Shift-0 is
//   the console, window 0; 1 to 9 (after Ctrl-A, and with Ctrl-Shift) are
//   the terminal windows (windows.ts), which Ctrl-A n or c (as in tmux and
//   screen) opens and Ctrl-A x closes; Ctrl-A y copies diagnostics. Terminals send
//   nothing for Ctrl-Shift-digit, and browsers do not use it;
// - Ctrl-A z suspends (session.ts: the next load offers to resume).
// While a dialog is open the keys act on it directly (DIALOG_KEYS) and
// never reach the terminal or the guest under it.
//
// The listener is on window in the capture phase, and (dashboard port) acts
// only on keys whose target is inside the shell's root element: the same
// keys typed anywhere else on the page are left alone.
import { openAbout } from "./components/About.tsx";
import { KW } from "./kw.ts";
import { ui$, type Tab } from "./store.ts";

/** macOS, iOS, iPadOS: ⌘A is the prefix too. */
export const APPLE = /mac|iphone|ipad|ipod|ios/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent);
export const PREFIX = "Ctrl-A";
/** The prefix as the armed indicator shows it. */
export const PREFIX_SHORT = "^A";
const isCtrlA = (e: KeyboardEvent) => e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === "KeyA";
const isCmdA = (e: KeyboardEvent) => APPLE && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "KeyA";
const isPrefix = (e: KeyboardEvent) => isCtrlA(e) || isCmdA(e);
export const CHORD = "Ctrl-Shift";

const TABS: Tab[] = ["status", "guest", "env", "log", "errors", "keys"];

// ---- terminal windows (windows.ts, KW.windows): the prefix and the status line ----
/** Show window n (0: the console), over the dialog. */
export function selectWindow(n: number): void {
	const ui = KW.ui!, w = KW.windows;
	if (n !== 0 && !w?.list().some((x) => x.n === n)) {
		ui.toast(`No window ${n}: ${KW.config.coarse ? "+ on the status line" : `${PREFIX} n`} opens one`);
		return;
	}
	ui.closePanel();
	if (w) w.select(n);
}
/** Open a terminal window (its own shell over vsock) and show it. */
export function newWindow(): void {
	const ui = KW.ui!, w = KW.windows;
	if (!w) { ui.toast("The terminal is not ready yet"); return; }
	ui.closePanel();
	// A failure after the window was made shows in the window itself.
	w.open().catch((e: Error & { window?: number }) => { if (e?.window === undefined) ui.toast(e?.message ?? String(e)); });
}
/** Close window n (the current one by default), asking first while its shell runs; window 0 stays. */
export async function closeWindow(n = ui$().get().win): Promise<void> {
	const ui = KW.ui!, w = KW.windows?.list().find((x) => x.n === n);
	if (!w || n === 0) { ui.toast("Window 0, the console, cannot be closed"); return; }
	if (w.state === "open" && !await ui.ask({ title: `close window ${n}`, msg: "Its shell and the programs started from it are hung up (SIGHUP).", ok: "Close", danger: true })) return;
	await KW.windows!.close(n);
}

interface Command {
	keys: string[];
	/** KeyboardEvent.code of the Ctrl-Shift chord, if it has one. */
	chord?: string;
	label: string;
	run: () => void;
}

/** After the prefix, and the chords. */
export const COMMANDS: Command[] = [
	{ keys: ["0", "t"], chord: "Digit0", label: "Window 0: the console (closes the dialog)", run: () => selectWindow(0) },
	{ keys: ["n", "c"], label: "New terminal window (1 to 9: its own shell)", run: newWindow },
	{ keys: ["x"], label: "Close the current terminal window (asks first)", run: () => void closeWindow() },
	{ keys: ["s"], label: "System: options for the next boot", run: () => KW.ui!.openPanel("status") },
	{ keys: ["g"], label: "Guest: font size, data disk", run: () => KW.ui!.openPanel("guest") },
	{ keys: ["i"], label: "Environment: browser, memory, storage, JIT", run: () => KW.ui!.openPanel("env") },
	{ keys: ["l"], label: "Kernel log", run: () => KW.ui!.openPanel("log") },
	{ keys: ["e"], label: "Errors", run: () => KW.ui!.openPanel("errors") },
	{ keys: ["?"], chord: "Slash", label: "This list", run: () => KW.ui!.openPanel("keys") },
	{ keys: ["y"], label: "Copy diagnostics (in a dialog, c also)", run: () => KW.ui!.copyDiagnostics() },
	{ keys: ["r"], label: "Reboot (asks first)", run: () => KW.ui!.confirmReboot() },
	{ keys: ["z"], label: "Suspend: save the system in this browser and stop (asks first; the next load offers to resume)", run: () => void KW.ui!.confirmSuspend() },
	{ keys: ["a"], label: "About: credits and the build", run: openAbout },
];

/** In an open dialog, without the prefix. */
export const DIALOG_KEYS: Array<[string, string]> = [
	["s g i l e ?", "System, Guest, Environment, Kernel log, Errors, Keys"],
	["← →  [ ]", "Previous, next tab"],
	["↑ ↓", "Scroll"],
	["Tab  ⇧Tab", "Move between controls (they stay in the dialog)"],
	["c", "Copy diagnostics"],
	["r", "Reboot (asks first)"],
	["z", "Suspend (asks first)"],
	["Esc  q", "Close"],
];

const field = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, select, textarea") && !(t as HTMLElement).closest("#terms");
/** A key code as the Keys tab shows it: KeyO is O, Digit0 is 0, Slash is /. */
export const codeLabel = (code: string) => code === "Slash" ? "/" : code.replace(/^(Key|Digit)/, "");
const swallow = (e: KeyboardEvent) => { e.preventDefault(); e.stopImmediatePropagation(); };
const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.altKey && !e.metaKey;

/**
 * The dialog is modal: Tab and Shift-Tab go round its controls and never
 * leave it (the page under it is inert to the pointer only through the
 * scrim, so the keyboard needs this).
 */
function trapTab(e: KeyboardEvent) {
	const panel = document.getElementById("panel");
	if (!panel) return;
	const all = [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
		.filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest("[hidden]")
			&& !(el instanceof HTMLInputElement && el.type === "radio" && !el.checked && panel.querySelector(`input[type="radio"][name="${el.name}"]:checked`)));
	if (!all.length) return;
	const first = all[0]!, last = all[all.length - 1]!, at = document.activeElement as HTMLElement | null;
	const outside = !at || !panel.contains(at) || at === panel;
	if (outside || (e.shiftKey ? at === first : at === last)) {
		swallow(e);
		(outside ? (e.shiftKey ? last : first) : e.shiftKey ? last : first).focus();
	}
}

export function installShortcuts(root: HTMLElement): () => void {
	const ui = KW.ui!, $ = ui$();

	function onKeyDown(e: KeyboardEvent) {
		if (!(e.target instanceof Node) || !root.contains(e.target)) return; // typed outside the shell
		const s = $.get();
		if (s.ask) return; // the confirm dialog (a modal <dialog>) takes its keys itself
		if (s.prefix) {
			if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
			ui.setPrefix(false);
			if (isCtrlA(e)) return; // send-prefix: this one goes through
			if (isCmdA(e)) { swallow(e); return; } // ⌘A never reaches the guest: it only disarms
			swallow(e);
			const cmd = COMMANDS.find((c) => c.keys.includes(e.key));
			if (cmd) cmd.run();
			else if (/^[1-9]$/.test(e.key)) selectWindow(Number(e.key));
			else if (e.key !== "Escape") ui.toast(`${PREFIX} ${e.key}: not a shortcut (${PREFIX} ? lists them)`);
			return;
		}
		if (isPrefix(e) && !e.repeat) {
			swallow(e);
			ui.setPrefix(true);
			return;
		}
		if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
			const cmd = COMMANDS.find((c) => c.chord === e.code);
			if (cmd) { swallow(e); if (!e.repeat) cmd.run(); return; }
			const digit = /^Digit([1-9])$/.exec(e.code);
			if (digit) { swallow(e); if (!e.repeat) selectWindow(Number(digit[1])); return; }
		}
		if (s.pasteOpen) {
			if (e.key === "Escape") { swallow(e); ui.closePaste(); }
			return;
		}
		if (!s.panelOpen) return;
		if (e.key === "Escape") { swallow(e); ui.closePanel(); return; }
		if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) { trapTab(e); return; }
		// Typing in a field, browser shortcuts (copy, find), Tab and buttons work as usual.
		if (field(e.target) || !plain(e) || e.key === "Tab") return;
		const onButton = !!(e.target as HTMLElement | null)?.closest?.("#panel button, #panel summary");
		if (onButton && (e.key === "Enter" || e.key === " ")) return;
		swallow(e); // nothing reaches the terminal under the dialog
		const i = TABS.indexOf(s.tab);
		const tab = ({ s: "status", g: "guest", i: "env", l: "log", e: "errors", "?": "keys" } as Record<string, Tab>)[e.key];
		if (tab) ui.selectTab(tab);
		else if (e.key === "ArrowLeft" || e.key === "[") ui.selectTab(TABS[(i + TABS.length - 1) % TABS.length]!);
		else if (e.key === "ArrowRight" || e.key === "]") ui.selectTab(TABS[(i + 1) % TABS.length]!);
		else if (e.key === "q") ui.closePanel();
		else if (e.key === "c") ui.copyDiagnostics();
		else if (e.key === "r") ui.confirmReboot();
		else if (e.key === "z") void ui.confirmSuspend();
		else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			const body = document.getElementById("pbody");
			body?.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * 48 });
		}
	}
	// Key-ups pass: a guest that saw Ctrl go down must see it come up.
	window.addEventListener("keydown", onKeyDown, true);
	return () => window.removeEventListener("keydown", onKeyDown, true);
}
