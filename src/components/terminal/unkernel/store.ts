// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The page's UI state: one small external store that the imperative side
// (ui.ts, boot.ts) writes and the React components (components/)
// read with useStore(). Updates replace the changed fields, so a selector that
// returns a field gets the same reference until that field changes.
import { useSyncExternalStore } from "react";
import type { KWError } from "./kw.ts";

export type State = "checking" | "loading" | "booting" | "running" | "halted" | "error";
export type CheckResult = "pass" | "fail" | "warn" | "info";
export type Tab = "status" | "guest" | "env" | "log" | "errors" | "keys";

export interface Check { id: string; label: string; r: CheckResult; value: string; note: string }

/** Terminal windows 1 to 9 (the digits; 0 is the console). */
export const MAX_WINDOWS = 9;

/**
 * A terminal window besides window 0 (the console, hvc0): a kwtty session
 * over vsock with its own pty and shell (windows.ts). opening: waiting for
 * the guest's server; open: the shell runs; ended: the session failed or
 * was lost, and the window shows why until it is closed.
 */
/** fg: the program in the foreground of a tty N window, when it is not the shell (windows.ts); else "". */
export interface Win { n: number; name: string; state: "opening" | "open" | "ended"; note: string; fg: string }

/**
 * A question in the confirm dialog; `cancel` labels the other button (default "Cancel"), `url` shows
 * under the message. `untrusted`: OK (focused, as always), Enter and y confirm only after a moment, so a
 * key or a click meant for the terminal does not confirm it (nothing sets it since open.ts is not vendored).
 */
export interface Ask { title: string; msg: string; ok: string; cancel?: string; danger?: boolean; url?: string; untrusted?: boolean; id: number }

export interface UiState {
	state: State;
	label: string;
	/** Suspend saved the system and the kernel stopped (halted): the page offers Resume (components/Overlays.tsx, Bar.tsx). */
	suspended: boolean;
	splash: { title: string; msg: string; hidden: boolean; error: boolean; details: boolean };
	checks: Check[];
	/** KW.errors, copied on each change. */
	errors: KWError[];
	fatal: { title: string; msg: string; hint: string } | null;
	panelOpen: boolean;
	tab: Tab;
	toast: { msg: string; id: number } | null;
	dataStatus: string;
	/** The data disk's blocks in use (non-zero, written at some point) and its size, in bytes; null: none. */
	disk: { used: number; size: number; saved: boolean } | null;
	/** The safe-mode explanation in the Data disk section, or null. */
	safeNote: string | null;
	/**
	 * The distro this load boots, as the About dialog shows it (its name,
	 * then its image id once the guest said it, from /run/kw-base); null with
	 * ?distro=none.
	 */
	distro: { name: string; image: string; url: string } | null;
	/** The key bar's Ctrl is armed. */
	ctrl: boolean;
	/** The key bar is showing (phones, on-screen keyboard up). */
	keysOn: boolean;
	pasteOpen: boolean;
	/** A question in the confirm dialog (ui.ask()), or null. */
	ask: Ask | null;
	/** The shortcut prefix (Ctrl-A, shortcuts.ts) was pressed: the next key is a command. */
	prefix: boolean;
	/** The Font size option: "auto" or a size in px. */
	fontPref: string;
	fontSize: number;
	/** The Copy diagnostics fallback text, shown when the clipboard is unavailable. */
	copyText: string | null;
	/** The current terminal window: 0 is the console (hvc0), 1 to 9 are in wins. */
	win: number;
	/** The terminal windows besides window 0, by number. */
	wins: Win[];
	/** The Options as chosen (components/Options.tsx), read by nextSettings(). */
	options: Options;
}

export interface Options {
	mem: string;
	net: "default" | "custom" | "off";
	wisp: string;
	jit: "on" | "off";
	verbose: "clear" | "keep";
	append: string;
	data: "on" | "off";
	root: "overlay" | "safe";
	worker: "on" | "off";
	/** CPUs, "1" to "16" (?cpus=). */
	cpus: string;
	/** The distro image (?distro=): a name, or "none". */
	distro: string;
}

type Listener = () => void;

export function createStore<T extends object>(init: T) {
	let s = init;
	const listeners = new Set<Listener>();
	return {
		get: (): T => s,
		set(patch: Partial<T> | ((s: T) => Partial<T>)) {
			s = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
			for (const l of listeners) l();
		},
		subscribe(l: Listener) {
			listeners.add(l);
			return () => { listeners.delete(l); };
		},
	};
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>;

let store: Store<UiState> | null = null;

/** The page's store; ui.ts creates it (initStore) before anything renders. */
export function ui$(): Store<UiState> {
	if (!store) throw new Error("the UI store is not initialised");
	return store;
}

export function initStore(init: UiState): Store<UiState> {
	store = createStore(init);
	return store;
}

/** A field of the UI state; the component re-renders when it changes. */
export function useStore<U>(select: (s: UiState) => U): U {
	const s = ui$();
	return useSyncExternalStore(s.subscribe, () => select(s.get()));
}
