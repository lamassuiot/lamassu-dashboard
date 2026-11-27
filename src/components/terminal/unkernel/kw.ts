// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// KW: state shared by the shell (ui.ts, mount.tsx) and the boot module
// (boot.ts), and the hooks the browser tests (web/test/*.mjs) read: KW.config, KW.ui.state()/stageState(),
// KW.errors, KW.screenText(), KW.memActualMiB, KW.term, KW.vm (the SDK's KernelInstance, or with
// ?worker=1 a WorkerKernel, which has no low-level kernel; KW.vm.stats(), KW.vm.evdev,
// KW.vm.frame() in both),
// KW.jitStats() (kwemu's JIT counters), the data disk (KW.dataDisk, KW.sync(),
// KW.exportData(), KW.importData(), KW.resetData()), KW.suspend() (session.ts), the terminal windows (KW.windows:
// list(), open(), select(), close(), text(), send(); windows.ts); KW.kernel and globalThis.kernel (the
// low-level Kernel, with sendInput(); not in worker mode) and globalThis.term (the wterm WTerm).
//
// Dashboard port: upstream's index.html creates window.KW in an inline script
// before the page module runs. Here mount.tsx creates a fresh one per mount
// (createKW()) and the modules read it through the live binding `KW`; it is
// not put on window.
import type { Config } from "./config.ts";
import type { CowDisk, JitStats, KernelHandle } from "./sdk.ts";
import type { Ui } from "./ui.ts";

export interface KWError {
	t: number;
	kind: string;
	message: string;
	detail: string;
	fatal: boolean;
	hint?: string;
	title?: string;
}

export interface TermApi {
	focus(): void;
	paste(text: string): void;
	send(data: string | Uint8Array): void;
	setFontSize(px: number): void;
	appCursor(): boolean;
	notice(msg: string): void;
}

/** A terminal window as KW.windows.list() gives it. */
export interface WindowInfo {
	/** 0: the console (hvc0); 1 to 9: a terminal session over vsock. */
	n: number;
	name: string;
	/** Window 0 is always "open". */
	state: "opening" | "open" | "ended";
	current: boolean;
	/** The shell's pid and pty number in the guest, once open (not for window 0). */
	pid?: number;
	pts?: number;
	/** Why it ended, or what it waits for. */
	note?: string;
}

/** The terminal windows (windows.ts), for the shortcuts, the status line and the browser tests. */
export interface WindowsApi {
	list(): WindowInfo[];
	/**
	 * Open a window (the lowest free number) and switch to it unless
	 * select is false; name labels it in the status line (default "sh"),
	 * and file and args run in place of root's login shell. Resolves once its shell runs; rejects with why it
	 * could not (the window then stays, showing that, until closed).
	 */
	open(opts?: { select?: boolean; name?: string; file?: string; args?: string[] }): Promise<WindowInfo>;
	/** Run a command block in a visible Bash session shared by command blocks. */
	runCommand(source: string, signal: AbortSignal): Promise<void>;
	/** Show window n and give it the keyboard focus (false: there is no such window). */
	select(n: number): boolean;
	/** Close window n (1 to 9): its shell is hung up. Resolves once it is gone. */
	close(n: number): Promise<void>;
	/** Window n's history and screen as text, a line per row. */
	text(n: number): string;
	/** Type into window n (as its terminal does: no Ctrl-key latching). */
	send(n: number, data: string | Uint8Array): void;
}

export interface KWGlobal {
	t0: number;
	errors: KWError[];
	ui: Ui | null;
	started: boolean;
	early(e: KWError): void;
	report(kind: string, message: string, detail?: string, fatal?: boolean): KWError;
	config: Config;
	term?: TermApi;
	screenText?: () => string;
	memActualMiB?: number;
	jitStats?: () => JitStats;
	/** The data disk, once attached (null: none). */
	dataDisk?: CowDisk | null;
	/** Ask the guest to sync its file systems to the persistent disks; true once confirmed. */
	sync?: (opts?: { timeout?: number }) => Promise<boolean>;
	/** Run by Reboot before the page reloads (a sync, at most 3 s). */
	beforeReboot?: () => Promise<unknown>;
	exportData?: () => Promise<{ name: string; blocks: number; bytes: number }>;
	importData?: (file: Blob | Uint8Array) => Promise<{ size: number; blocks: number }>;
	resetData?: () => Promise<void>;
	/** Save the running machine in this browser and stop it (session.ts); the next load offers to resume it. */
	suspend?: () => Promise<{ bytes: number; ms: number }>;
	/** The kernel once user space runs (rejects if it never does), once the boot module runs. */
	ready?: () => Promise<KernelHandle>;
	/** The terminal windows, once the boot module runs. */
	windows?: WindowsApi;
	/**
	 * Start the shell again in place (mount.tsx), where upstream reloads the
	 * page: Reboot passes the settings it saved (they then apply without the
	 * URL's), the other reloads (resume, data disk import or reset, one CPU
	 * fallback) pass none.
	 */
	reload?: (settings?: Record<string, string>) => void;
	[key: string]: unknown;
}

/** The current mount's KW (a live binding: createKW() replaces it). */
export let KW: KWGlobal = undefined as unknown as KWGlobal;

/**
 * A fresh KW for a mount, made current: what upstream's index.html bootstrap
 * sets up (t0, errors, report()), without its page-wide error listeners and
 * its fallback markup (early() does nothing: mount.tsx shows the errors
 * recorded before the UI existed once it does).
 */
export function createKW(config: Config): KWGlobal {
	const kw: KWGlobal = {
		t0: Date.now(), errors: [], ui: null, started: false, config,
		early() {},
		report(kind, message, detail, fatal) {
			const e: KWError = { t: Date.now() - kw.t0, kind, message: String(message), detail: detail ? String(detail) : "", fatal: !!fatal };
			kw.errors.push(e);
			try { if (kw.ui) kw.ui.onError(e); else kw.early(e); } catch { kw.early(e); }
			return e;
		},
	};
	KW = kw;
	return kw;
}
