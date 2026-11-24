// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// Terminal and boot flow, loaded by main.ts once the preflight passed. The
// SDK does the work (download, streaming compile, memory with fallback
// sizes, console routing, network); this module shows it (with ?worker=1
// the kernel runs in a Web Worker, the SDK's worker mode, which gets the
// module compiled here; input and frames cross through shared memory when
// the page is cross-origin isolated, else as messages):
// a wterm terminal with a systemd-style boot transcript, the status
// indicator and stages (ui.ts), and the kernel's console as window 0, with
// more terminal windows over vsock (windows.ts). With several CPUs (?cpus=N,
// config.ts) it loads the SMP kernel instead and boots it in worker mode,
// whose worker starts the other CPUs; whatever stops that before the
// kernel runs reloads once on one CPU (bootUpOnce()). The kernel is the
// base bundle, with the distro image ?distro= picks (config.ts) attached
// read-only by URL (createKernel({ distro }); inline it is opened here
// first, for the resume check).
//
// Dashboard port: start(root) runs in the shell's root element (mount.tsx)
// and returns stop(), which aborts a boot in progress, syncs and stops the
// kernel, closes the terminal windows, lets go of the data disk (its lock
// too, so the next mount gets the persistent disk) and removes every
// listener, timer and global it added. A page reload is KW.reload() (a
// restart in place); the page URL is neither read nor written (mount.tsx).
import "@wterm/dom/src/terminal.css";
import { WTerm } from "@wterm/dom";
import { INLINE_ONCE_KEY, UP_ONCE_KEY } from "./config.ts";
import { attachDataDisk, detachDataDisk, downloadKwsparse, exportDataDisk, fmtSize, importDataDisk, resetDataDisk, storageState, acquireDiskLock, type DataAttach, type DiskLock } from "./data.ts";
import { KW as currentKW } from "./kw.ts";
import { browserNet, browserNetSpec } from "./net.ts";
import { ScreenTail, clearSession, loadSession, saveSession, sessionInfo, sessionMismatch, type SessionDevices, type SessionMeta } from "./session.ts";
import { takeResumeRequest } from "./ui.ts";
import { createWindows, normalizeInput, pasteText, setTermFont, termText, TERM_OPTIONS } from "./windows.ts";
import {
	BootError, ConsoleRouter, KernelInstance, WorkerKernel, bundledBoot, createKernel, loadKernelModule, openDistroDisk, serveWasiPrograms, snapshotDiskMismatch,
	type BlockDevice, type DistroDisk, type BootProgress, type DiskSpec, type DiskState, type DownloadProgress, type Kernel, type KernelHandle, type KernelSnapshot,
} from "./sdk.ts";

/** An error tagged with what failed (fetch, compile, memory, boot) and the boot stage it belongs to. */
type StageError = Error & { kind?: string; stageId?: string };
const tag = (e: unknown, kind: string, stageId: string): StageError => Object.assign(e instanceof Error ? e : new Error(String(e)), { kind, stageId });

const fmtMiB = (n: number) => `${(n / 1048576).toFixed(1)} MiB`;
const fmtS = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

// The terminal's colours and font are CSS custom properties (style.css, #term).
const SGR = { ok: "\x1b[32m", warn: "\x1b[33m", fail: "\x1b[31m", busy: "\x1b[36m", dim: "\x1b[2m", gray: "\x1b[90m", bold: "\x1b[1m", off: "\x1b[0m" };

/** Columns of LOGO that hold the icon alone (for a terminal too narrow for the whole logo). */
const ICON_COLS = 25;
/**
 * The Lamassu IoT logo (icon and wordmark, #0100f8), from the brand's 2649x476
 * artwork, in 132x12 cells. Each cell is one block glyph (U+2580-259F, which
 * wterm draws as exact shapes, not with the font) with two colours, chosen
 * offline for wterm's 11 px cell (6.6x13 px): the artwork sampled 8 across and
 * every half pixel down in each cell, against each glyph's shape as wterm
 * paints it (its eighths and half block snapped to whole pixels), with the two
 * colours fitted by least squares after a ~1 px blur, as the eye sees it, so
 * faint slivers lose to shapes that put the ink where it is; the logo shifted
 * half a cell right, the offset with the smallest error. A colour is a hex
 * digit for how much of the logo's blue it holds over the black terminal
 * (0 none, f all), blended gamma-correct. Rows: the glyphs, then their
 * foreground and their background (0: the terminal's own).
 */
const LOGO = ((glyphs: string[], fg: string[], bg: string[]) => {
	const ink = [1, 0, 248];
	const rgb = (d: string) => ink.map((v) => Math.round(v * (parseInt(d, 16) / 15) ** (1 / 2.2))).join(";");
	const render = (cols: number) => glyphs.map((row, y) => {
		let s = "";
		for (let x = 0; x < cols; x++) {
			const c = row[x] ?? " ", f = fg[y]![x] ?? "0", b = bg[y]![x] ?? "0";
			s += c === " " ? `${SGR.off} ` : `\x1b[0;38;2;${rgb(f)}${b !== "0" ? `;48;2;${rgb(b)}` : ""}m${c}`;
		}
		return s.replace(/(\x1b\[0m )+$/, "") + SGR.off;
	});
	const width = glyphs[0]!.length;
	return { width, iconCols: ICON_COLS, full: render(width), icon: render(ICON_COLS) };
})([
	"                 ▛▆▃▃▅▜                                                                                                             ",
	"                 ▎▍  ▍▐                                                                                                             ",
	"▋▁▋▃▃▃▃▃▃▂▄▁     ▇▂▂▂▂▐                                                                                                             ",
	" █▂▘▃▃▃▃▃▆▚▜▄▁   ▎▛▅▅▜▌                                                                                                             ",
	"   ▝▃▝▀▀▚▃▅▙▚▜▀▁ ▎▙▜▗▟▌                                                                                                             ",
	"     ▛▃▃▃▙▚▖▄▝▚▜▀▝▜▙▟▛▟█      ▛▃▃                                                                             ▛▃▜          ▃▃▃▃▃▃▃▃▃",
	"    ▛▟███▙▄▙▂▚▄▂▙▃▖▅▆▅▇▏      ▊█▕       ▁▁▁▁ ▁▁▁ ▁▁▁▁▁▁▁   ▁▁▁▁     █▁▁▁▁ ▁▁▁  ▁▁▁▁█    ▁▁▁▁   ▁▁▁    ▁▁█     ▍█▐    ▁▁▁▁  ▅▅▅▖█▛▅▅▅",
	"   ▕▞▆▍████▔▔▔▔▔▔▔▔▔▇██▏      ▊█▕    █▀▆▁▂▂▁▆▟█▎ ▏█▆▁▂▁▇▆▃▆▁▂▁▇▆▜ ▁▄▔▁▂▂▁▅▏█▏▛▅▇▂▂▁▔▖ ▗▆▁▂▂▁▆▜ ▏█▏    ▏█▏     ▍█▐ ▁▄▔▁▂▂▁▆▀▁  ▐█▌   ",
	"   █▊ ▍████████████████▏      ▊█▕    ▐█▗▔  █▝▜█▎█▏█▘█  ▙██▘█  ▙█▊ ▘█▗▇  ▇▝██▏▋█▙▂▁▙▅▅▏▎█▝▁▁▙▅▘ ▏█▏    ▏█▏     ▍█▐█▟█▘▇  ▇▖█▝  ▐█▌   ",
	"   ▛▊▗▟▁▃▅▜█▐▇▇▇▇▇▐▁▅▜█▏      ▊█▕    ▎█▍     ▎█▎█▏█▏   ▉▏█▏   ▉█▕█▏█▎    ▕██▏█▆▀▂▁▔▅▃ ▇▅▃▂▁▆▅▜ ▎█▏   █▏█▏     ▍█▐▕██▏    ▊█▉  ▐█▌   ",
	"  ▝▟ ▎▕▁  ▙▜▝▜   ▛▟▘ ▌█▏      ▊█▕    ▝▏▙▂▁ ▁▀▏█▎█▏█▏   █▏█▏   ▕▏▉█▝█▙▂█ ▁▘██▏▗▅▖▁ ▇▏█▎▅▅▜██▋█▊ ▎█▝▁ ▁▗██▏     ▍█▐ ▖█▝▁ █▂▘█▘  ▐█▌   ",
	"     ▎▁▁▝  ▊▁▇▅▜ ▐▁▔▖▕▁▇▅     ▊▁▁▇▇▇▇▏▙▃▁▁▇▁▀▎▁▎█▁▁▏    ▁▁▏   █▁▁██▝▂▁▇▇▂▄▁▁▏▇▄▂▁▇▁▂▅█▙▃▁▇▇▁▂▟ ▙▀▁▁▇▁▃▁▁▏     ▍▁▌ ▇▅▂▁▇▇▁▃▟   ▐▁▌   ",
], [
	"000000000000000000c02e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"000000000000000000e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"0001111111e5000003ffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"000c10000c1ce40001f00ff0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"000f2dccdd2c1c1301f0fff0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"000000fff2ef001c1ffffe200000000fd000000000000000000000000000000000000000000000000000000000000000000000000000000f00000000000efffffffc",
	"00000fffffe2001012513ef70000000f000000006eb206a308a13dc30004dd40000008ea107a1001be7000004dd40008910000890000000f000005dd3001110ff111",
	"0001f12ffff800000000fff90000000f0000001fd205efff08fe201feee101fe002e4b108fafd0ff1075f0ff901cf000fa00004f4000000f003e2801bf1100fff000",
	"0000d01ffffffffffffffffa0000000f00000df07000ffff09ff0001ffe0001ff00f00000fffd1ffd301130f0d101f00fa00008f4000000f00eff00000f000fff000",
	"0000affc20ff000000ee2ffb0000000f000003fd000006ff0bfa0000df70000fb06fb00002ffd01f052fc00001afe006fc0000cf4000000f06ff500000ff00fff000",
	"00700065000f000000ff01fe0000000f00000fefd1062eff0cf800009f50001df0fffb0090ffdfff2007f9df1002ff01f0402fff4000000f000f0800a1ff00fff000",
	"000000cd0000bfd00d50cc6ea00000088eeeea025ae2f58f0788000078300007700f07ee3078d0029e9220013ee70000e2bf318840000008e00104fe211000e8e000",
], [
	"00000000000000000c0dd260000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"00000000000000000f000ef0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"9d6aaaaaaa2000000c211260000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"00d2bbbbb1b110000f6dd910000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"0002d00052e2b2d00f8e1b10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
	"000003010d52cca2d28793d000000050000000000000000000000000000000000000000000000000000000000000000000000000000000d0c0000000000000000000",
	"000063000a1e93d6dc1ed1c0000000c0f00000000000000000000000000000000000000000000000000000000000000000000000000000e0f0000000000ffff00ffd",
	"00005df0000fffffffffc000000000c0f00000c4ffff06010f01effe100effd1b001ffffe2f0073bffff2003ffff3d0f000000f0000000e0f001fffff3d000101000",
	"000000f00000000000000000000000c0f000020f00001d010f02000d002000e080d0d50024000e03004ff0e0c00bf20f000000f0000000e0f02042005d0c00101000",
	"000901cffd20e555553fdc00000000c0f0000f0000000f010f000001f0000040f0f00000000000e1fff2004effe20b0f000000f0000000e0f00000000e0300101000",
	"000a0ff10031e30009d30d00000000c0f00002f51000df010f000000f000000fc05010000c000103008f0000d00b070e0b000300000000e0f0d0c0000f0400101000",
	"00000effb007fa2100fd00f4100000bff55550dfff7f1ef10ff00000ef00000ff001efa8fdff03dfe2efd09ef73fed051ff5feff000000df001def7affd0001f1000",
]);
const STEP: Record<string, string> = { kernel: "Download the kernel", compile: "Compile the kernel", memory: "Allocate kernel memory", boot: "Boot the kernel" };

/**
 * A guest `reboot` (halt code 2) reloads the page, at most 3 times a
 * minute, so a guest that reboots in a loop ends up halted instead of
 * reloading forever. The count lives in sessionStorage (this tab only);
 * without it, auto-reboot still works but is not limited.
 */
const AUTO_REBOOT_KEY = "kw-auto-reboot", AUTO_REBOOT_MAX = 3, AUTO_REBOOT_WINDOW = 60000;
function autoRebootAllowed(): boolean {
	const now = Date.now();
	let times: number[] = [];
	try {
		const v: unknown = JSON.parse(sessionStorage.getItem(AUTO_REBOOT_KEY) ?? "[]");
		if (Array.isArray(v)) times = v.filter((t): t is number => typeof t === "number" && now - t < AUTO_REBOOT_WINDOW);
	} catch { /* storage blocked or bad value: no limit */ }
	if (times.length >= AUTO_REBOOT_MAX) return false;
	try { sessionStorage.setItem(AUTO_REBOOT_KEY, JSON.stringify([...times, now])); } catch { /* see above */ }
	return true;
}

/** What start() returns: stop() tears this boot down (see the top of this file). */
export interface Boot {
	stop(): Promise<void>;
}

/** Thrown inside boot() once stop() aborted it: nothing is reported. */
const ABORTED = Symbol("aborted");

export function start(root: HTMLElement): Boot {
	// This mount's KW (kw.ts): a callback that runs after stop() never reaches the next mount's.
	const KW = currentKW;
	const ui = KW.ui!;
	const cfg = KW.config;
	KW.started = true;
	const g = globalThis as unknown as { term?: WTerm; kernel?: Kernel; vm?: KernelHandle };
	// --- teardown (stop()) ---------------------------------------------------------
	const abort = new AbortController();
	const signal = abort.signal;
	/** Undo what this boot added to the page: listeners, timers, globals. */
	const teardown: Array<() => void> = [];
	const listen = (target: Document | Window, type: string, fn: (e: Event) => void) => {
		target.addEventListener(type, fn);
		teardown.push(() => target.removeEventListener(type, fn));
	};
	const every = (fn: () => void, ms: number) => {
		if (signal.aborted) return undefined; // a late boot step after stop(): its teardown already ran
		const id = setInterval(fn, ms);
		teardown.push(() => clearInterval(id));
		return id;
	};
	/** After an await in boot(): go on unless stop() was called. */
	const going = () => { if (signal.aborted) throw ABORTED; };
	// A KernelInstance, or with ?worker=1 a WorkerKernel (no low-level kernel; the display, evdev and sound through messages).
	let vm: KernelHandle | null = null;
	const local = (): KernelInstance | null => (vm instanceof KernelInstance ? vm : null);
	let vmExited = false;
	/** createKernel() is running (in worker mode the worker may be opening the data disk). */
	let kernelStarting = false;
	/** The kernel has exited (inline: the moment it does; a worker: once its exit message arrived). */
	const ended = () => { const l = local(); return l ? !!l.kernel.result : vmExited; };
	const send = (s: string | Uint8Array) => vm?.write(s);
	/** This load boots the SMP kernel on several CPUs (config.ts; never resumed, never suspended). */
	const smp = cfg.cpus > 1;
	/** The kernel this load runs: the base's UP bundle, or its SMP one (sdk.ts kernelSmpUrl). */
	const kernelUrl = smp ? cfg.kernelSmpUrl! : cfg.kernelUrl;
	/** The image this load boots (null: ?distro=none). */
	const distro = cfg.distro;
	/** The session's distro (session.ts). */
	const distroRef = distro ? { name: distro.name, url: distro.url } : null;
	/** Inline: the distro image, opened ahead (the snapshot's first disk, for the resume check). */
	let distroDisk: DistroDisk | null = null;

	// --- data disk (persistent /data) -------------------------------------------
	// Shown in the panel's Environment list ("Data disk", "Storage") and its
	// Data disk section; QuotaExceededError and other failed saves are errors.
	let data: DataAttach | null = null;
	let saveErrorShown = -Infinity, storageFailed = false;
	function saveError(e: unknown) {
		storageFailed = true;
		const err = e as Error | undefined;
		const quota = err?.name === "QuotaExceededError";
		ui.check("storage", "Storage", "fail", quota ? "quota exceeded" : "save failed", `${err?.name ?? ""} ${err?.message ?? e}`);
		if (performance.now() - saveErrorShown < 30000) return; // once per burst of failed flushes
		saveErrorShown = performance.now();
		KW.report("storage", quota
			? "The browser's storage quota is full: disk changes are NOT being saved (the guest sees I/O errors). Free space, or export the data disk and reset it."
			: `Saving disk changes to IndexedDB failed: ${err?.message ?? e}`, err?.stack ?? "", false);
	}
	const dataLog = (m: string) => { console.log(m); ui.hostLog(m); };
	async function showStorage({ ask = false } = {}) {
		const st = await storageState({ ask });
		if (storageFailed) return; // keep the failure visible
		const usage = st.usage !== undefined ? `${fmtSize(st.usage)} used${st.quota ? ` of ${fmtSize(st.quota)}` : ""}` : "usage unknown";
		ui.check("storage", "Storage", st.persisted ? "pass" : "info", `${st.persisted === undefined ? "persistence unknown" : st.persisted ? "persistent" : "best effort"}, ${usage}`,
			st.persisted ? "not evicted under storage pressure" : st.persisted === false ? "the browser may evict the saved disks under storage pressure (it did not grant navigator.storage.persist())" : "");
	}
	/** Worker mode: the worker's latest snapshot of the data disk (spec 0), if it was built. */
	const workerData = (): DiskState | undefined => (vm instanceof WorkerKernel ? vm.disks.find((d) => d.index === 0 && d.kind === "data") : undefined);
	function dataStatus() {
		const d = data?.disk;
		const w = d ? undefined : workerData();
		if (w) {
			const blocks = w.overlayBlocks ?? 0;
			ui.diskUsage(blocks * 4096, w.size, w.persistent);
			ui.dataStatus(w.persistent
				? `Saved in this browser (IndexedDB ${w.store}, written by the kernel worker): ${fmtSize(w.size)} disk, ${blocks} blocks (${fmtSize(blocks * 4096)}) stored.`
				: `In memory only: ${data?.notice ?? w.notice ?? "not saved"}.`);
			return;
		}
		if (!d) return;
		const blocks = d.overlayBlocks;
		ui.diskUsage(blocks * 4096, d.size, d.persistent);
		ui.dataStatus(d.persistent
			? `Saved in this browser (IndexedDB ${d.store?.name}): ${fmtSize(d.size)} disk, ${blocks} blocks (${fmtSize(blocks * 4096)}) stored.`
			: `In memory only: ${data?.notice ?? d.notice ?? "not saved"}.`);
	}
	async function openData(module: WebAssembly.Module): Promise<BlockDevice[]> {
		// Opening IndexedDB, the tab lock, and loading the stored blocks (or seeding from the template).
		const t0 = performance.now();
		try {
			data = await attachDataDisk({ enabled: cfg.data, bundled: bundledBoot(module).datadisk, log: dataLog, onError: saveError });
		} catch (e) {
			data = { disk: null, lock: null, reason: `failed: ${(e as Error).message}` };
			console.error(e);
		}
		const ms = performance.now() - t0;
		KW.dataDisk = data.disk;
		const d = data.disk;
		showData(d ? { size: d.size, seeded: d.seeded, storedBlocks: d.stored.size } : null, ms);
		return d ? [d] : [];
	}
	/** The data disk's rows, boot line and status, inline or (from the worker's snapshot) in worker mode. */
	function showData(d: { size: number; seeded?: boolean; storedBlocks?: number } | null, ms: number) {
		if (!data) return;
		if (!d) {
			ui.check("data", "Data disk", "info", "none", data.reason);
			ui.dataStatus(`No data disk: ${data.reason}.`);
			ui.hostLog(`[host] data disk: none (${data.reason}, ${fmtS(ms)})`);
			if (cfg.data && !/no IndexedDB/.test(data.reason ?? "")) warn(`No data disk: ${data.reason}`, ms);
			return;
		}
		const dev = distro ? "/dev/wdb" : "/dev/wda"; // the distro image is wda
		if (data.notice) {
			ui.check("data", "Data disk", "warn", `${dev}, not saved`, data.notice);
			warn(`Data disk ${dev}: ${data.notice}`, ms);
			ui.toast(`Data disk not saved: ${data.notice}`);
			ui.hostLog(`[host] data disk: ${data.notice}`);
		} else {
			const stored = d.storedBlocks ?? 0;
			ui.check("data", "Data disk", "pass", `${dev} (${fmtSize(d.size)}), saved in this browser`,
				`${d.seeded ? `created from the template (${data.from})` : `${stored} blocks stored`}; lock: ${data.lock?.how}; opened in ${fmtS(ms)}` +
				(cfg.worker ? "; the kernel worker writes it" : ""));
			ok(`Attached the data disk ${dev} (${d.seeded ? "new" : `${fmtSize(stored * 4096)} stored`})`, ms);
			void showStorage({ ask: true });
		}
		dataStatus();
		every(dataStatus, 5000); // the stored block count grows as the guest writes
	}
	/**
	 * Worker mode: the data disk as a spec. The lock is taken here, on the
	 * page (the worker then is the only writer of the store; a tab without
	 * the lock gets a snapshot); the worker opens IndexedDB and builds it.
	 */
	async function dataSpec(): Promise<DiskSpec[]> {
		if (!cfg.data) data = { disk: null, lock: null, reason: "off (?data=0)" };
		else if (typeof indexedDB === "undefined") data = { disk: null, lock: null, reason: "no IndexedDB in this browser" };
		else {
			const lock = await acquireDiskLock();
			data = { disk: null, lock, from: "bundled in the kernel" };
			return [{ kind: "data", template: "bundled", mode: lock.held ? "persistent" : "snapshot", optional: true }];
		}
		KW.dataDisk = null;
		showData(null, 0);
		return [];
	}
	/** Worker mode, once booted: what the worker built (or why not), shown like an inline attach. */
	function workerDataAttached(w: WorkerKernel, ms: number) {
		if (!data?.lock) return; // no spec was sent
		KW.dataDisk = null; // the CowDisk is in the worker: KW.vm.disks has its state
		const st = workerData();
		const skipped = w.skippedDisks.find((d) => d.index === 0);
		if (!st) {
			data.reason = skipped ? `failed: ${skipped.reason}` : "not attached";
			showData(null, ms);
			return;
		}
		if (!data.lock.held) data.notice = `open in another tab: this tab's /data is ${st.notice ?? "in memory"} (changes are not saved)`;
		else if (!st.persistent) data.notice = st.notice ?? "not saved";
		showData({ size: st.size, seeded: st.seeded, storedBlocks: st.storedBlocks }, ms);
	}
	/** Sync the guest's file systems to the persistent disks (the SDK's sync()). */
	KW.sync = (opts) => (vm && !ended() ? vm.sync(opts) : Promise.resolve(true));
	KW.beforeReboot = () => KW.sync!();
	listen(document, "visibilitychange", () => {
		if (document.visibilityState === "hidden") void KW.sync!().then(dataStatus);
	});
	listen(window, "pagehide", () => { void KW.sync!(); });
	/** Download the data disk as a .kwsparse.gz file (synced first). */
	KW.exportData = async () => {
		const d = data?.disk;
		const w = d ? undefined : workerData();
		if (w && vm instanceof WorkerKernel) {
			// Worker mode: the worker reads the disk (memory and store) and hands over the parts.
			if (w.persistent && !(await KW.sync!())) ui.hostLog("[host] data disk: the guest did not confirm a sync; exporting what was flushed");
			const { parts, blocks } = await vm.exportDisk(0);
			const r = await downloadKwsparse(parts, blocks);
			ui.hostLog(`[host] data disk: exported ${r.blocks} blocks as ${r.name} (${fmtSize(r.bytes)}), from the kernel worker`);
			return r;
		}
		if (!d) throw new Error(`no data disk is attached${data?.reason ? ` (${data.reason})` : ""}`);
		if (d.persistent && !(await KW.sync!())) ui.hostLog("[host] data disk: the guest did not confirm a sync; exporting what was flushed");
		const r = await exportDataDisk(d);
		ui.hostLog(`[host] data disk: exported ${r.blocks} blocks as ${r.name} (${fmtSize(r.bytes)})`);
		return r;
	};
	/** The lock takeOverData() took when this run held none (no data disk): kept until stop() (dashboard port). */
	let takenLock: DiskLock | null = null;
	async function takeOverData() {
		if (data?.lock && !data.lock.held) throw new Error("the data disk is open in another tab; close it first");
		if (!data?.lock && !takenLock) {
			// Upstream's page reload freed this lock; the restart in place must release it (releaseData()).
			const lock = await acquireDiskLock();
			if (!lock.held) throw new Error("the data disk is open in another tab; close it first");
			takenLock = lock;
		}
		if (cfg.worker) {
			// The kernel worker writes the store: it must stop (and close it) before this page touches it.
			if (!vm && kernelStarting) throw new Error("the kernel worker is still starting (it may be opening the data disk); try again once it runs");
			if (vm instanceof WorkerKernel && !ended() && workerData()?.store) await vm.detachDisk(0);
			return;
		}
		await detachDataDisk(data?.disk); // the running guest's later writes are not saved
	}
	function reloadPage() {
		KW.reload?.(); // the shell starts again in place (mount.tsx)
	}
	/** Replace the saved data disk with a .kwsparse[.gz] file (File, Blob or bytes), then reload. */
	KW.importData = async (file) => {
		const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
		await takeOverData();
		const r = await importDataDisk(bytes, { size: data?.disk?.size ?? workerData()?.size, log: dataLog });
		ui.hostLog(`[host] data disk: imported ${r.blocks} blocks; reloading`);
		reloadPage();
		return r;
	};
	/** Forget the saved data disk (the next boot starts from the template), then reload. */
	KW.resetData = async () => {
		await takeOverData();
		await resetDataDisk();
		ui.hostLog("[host] data disk: reset; reloading");
		reloadPage();
	};

	// --- terminal -------------------------------------------------------------
	// wterm renders the rows as DOM text in #term, which is also the scroll
	// container, so scrolling (touch momentum, the scrollbar) is the browser's
	// own. It sizes the grid to the element (autoResize, also when the font
	// size changes) and onResize passes the size on to the guest tty.
	const termEl = root.querySelector<HTMLElement>("#term")!;
	// wterm takes the row height from --term-row-height (it does not follow the font):
	// setTermFont sets both. Its font probe then refits the grid.
	setTermFont(termEl, cfg.fontSize);
	const term = new WTerm(termEl, {
		...TERM_OPTIONS,
		onData: (d) => send(ui.applyCtrl(normalizeInput(d))),
		onBinary: (d) => send(d),
		onResize: (cols, rows) => vm?.resize(cols, rows), // SIGWINCH
	});
	g.term = term;
	// init() instantiates wterm's parser (a small wasm module inside the package);
	// output written before then waits here. boot() waits for it before the kernel starts.
	let early: (string | Uint8Array)[] | null = [];
	const write = (data: string | Uint8Array) => { if (early) early.push(data); else term.write(data); };
	const termReady = term.init().then(() => {
		termEl.querySelector("textarea")?.setAttribute("enterkeyhint", "enter");
		const q = early ?? [];
		early = null;
		for (const d of q) term.write(d);
		if (!cfg.mobile) term.focus();
	});
	// --- terminal windows (windows.ts) -------------------------------------------
	// Window 0 is this console; 1 to 9 are terminal sessions over vsock, opened
	// once user space runs (guestReady) and closed when the kernel stops.
	let guestUp = false, stopped = false;
	let readyResolve!: (vm: KernelHandle) => void, readyReject!: (e: Error) => void;
	const guestReady = new Promise<KernelHandle>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
	guestReady.catch(() => {});
	const checkReady = () => { if (guestUp && vm && !stopped) readyResolve(vm); };
	/** The kernel stopped or never started: no more windows. */
	const stopWindows = (why: string) => {
		stopped = true;
		readyReject(new Error(why));
		windows.closeAll();
	};
	const windows = createWindows({
		term0: term, send0: send, ready: () => guestReady, alive: () => !stopped && !ended() && ui.state() !== "error" && ui.state() !== "halted",
		autoFocus: !cfg.coarse,
	});
	KW.windows = windows;
	KW.ready = () => guestReady;
	// What the base booted (/run/kw-base: the image id, the upper layer), for the
	// Environment rows, About and diagnostics.
	void guestReady.then(showBase, () => {});
	// Paste, the key bar, the touch controls and the shortcuts act on the current window.
	KW.term = {
		focus: () => windows.focus(),
		paste: (t) => windows.sendCurrent(pasteText(windows.currentTerm(), t)), // the panel's Paste
		send: (d) => windows.sendCurrent(d),
		appCursor: () => !!windows.currentTerm().bridge?.cursorKeysApp(),
		setFontSize: (px) => { setTermFont(termEl, px); windows.setFont(px); },
		notice: (m) => write(`\r\n\x1b[1;31m${m.replace(/\n/g, "\r\n")}\x1b[0m\r\n`), // the console's
	};
	KW.screenText = () => termText(term);
	ui.hideSplash(); // from here on the boot is shown on the terminal

	// --- host boot lines, systemd style -------------------------------------------
	// "[  OK  ] Downloaded ..." for each host step, and one transient line
	// (download progress, "Compiling") redrawn in place below them.
	let live = "";
	function hostLine(line: string) {
		write(`\r\x1b[K${line}\r\n${live}`);
	}
	const took = (ms: number | null | undefined) => (ms != null ? ` ${SGR.dim}(${fmtS(ms)})${SGR.off}` : "");
	const okLine = (msg: string, ms?: number | null) => `[${SGR.ok}  OK  ${SGR.off}] ${msg}${took(ms)}`;
	function status(t: string, color: string, msg: string, ms?: number | null) {
		if (ui.state() === "error") return; // e.g. a parallel download finishing after a failure
		// Dashboard port: the OK steps go only to the Kernel log (and the terminal with ?verbose=1);
		// warnings and failures still show on the terminal.
		if (t !== "  OK  " || cfg.verbose) hostLine(`[${color}${t}${SGR.off}] ${msg}${took(ms)}`);
		ui.hostLog(`[boot] ${t.trim()} ${msg}${ms != null ? ` (${fmtS(ms)})` : ""}`);
	}
	function ok(msg: string, ms?: number | null) { status("  OK  ", SGR.ok, msg, ms); }
	function warn(msg: string, ms?: number | null) { status(" WARN ", SGR.warn, msg, ms); }
	function failed(msg: string) { setLive(null); status("FAILED", SGR.fail, msg); }
	/**
	 * Show (or with null, remove) the transient line: tag (6 characters), msg,
	 * then detail in gray. It is cut to the terminal's width, so it never wraps.
	 */
	function setLive(t: string | null, msg = "", detail = "") {
		if (!t && !live) return;
		if (!t) { live = ""; write("\r\x1b[K"); return; }
		const max = Math.max(1, term.cols - 9);
		let a = ` ${msg}`, b = detail ? ` ${detail}` : "";
		if (a.length >= max) { a = `${a.slice(0, max - 1)}…`; b = ""; }
		else if (a.length + b.length > max) b = `${b.slice(0, max - 1 - a.length)}…`;
		live = `[${SGR.busy}${t}${SGR.off}]${a}${b && `${SGR.gray}${b}${SGR.off}`}`;
		write(`\r\x1b[K${live}`);
	}
	ok("Checked browser features", ui.stageTime("preflight"));

	// --- console output ------------------------------------------------------------
	// The SDK's ConsoleRouter splits the console into kernel lines and user
	// output. Every kernel line goes to the Kernel log tab. Boot phase: the
	// newest kernel line shows, in gray, after "Starting Linux" on the transient
	// line (cut to the terminal's width); IMPORTANT ones (warning, oops,
	// panic, ...) are written in full, and so is every kernel line after the
	// first of those, for its context. When user space prints its first line
	// (or a prompt), "Started Linux" replaces the transient line, followed by a
	// timing summary and the user-space output so far (buffered until then).
	// From then on only IMPORTANT kernel lines reach the terminal.
	// ?verbose=1 stays in the boot phase and writes every kernel line, in gray.
	let sawOutput = false, running = false, loud = false;
	let phase: "boot" | "user" = "boot";
	let replay = ""; // user-space output during the boot phase, redrawn below the summary
	// Each step already shows its own time: the summary is the total from page load.
	const summary = () => `${SGR.dim}Booted in${SGR.off} ${SGR.bold}${fmtS(Date.now() - KW.t0)}${SGR.off}` +
		(smp ? ` ${SGR.dim}on ${cfg.cpus} CPUs${SGR.off}` : cfg.worker ? ` ${SGR.dim}in a Web Worker${SGR.off}` : "") + "\r\n";
	// The Lamassu IoT logo above the summary: the whole logo where it fits, else the
	// icon alone, else neither.
	const intro = () => {
		const art = term.cols > LOGO.width ? LOGO.full : term.cols > LOGO.iconCols ? LOGO.icon : [];
		return [...art, ...(art.length ? [""] : []), summary().replace(/\r\n$/, "")].join("\r\n") + "\r\n";
	};
	// The command line is shown only when it is not the default one.
	const cmdlineNote = () => (cfg.cmdlineGiven ? `: ${SGR.dim}${cfg.cmdline}${SGR.off}` : "");
	let replayTimer: ReturnType<typeof setTimeout> | undefined;
	teardown.push(() => clearTimeout(replayTimer));
	/** Set when the kernel resumed a suspended session: what markRunning says instead of "Started Linux", and the old screen. */
	let resumed: { note: string; screen?: string } | null = null;
	function markRunning(why: string) {
		if (running) return;
		running = true;
		guestUp = true;
		checkReady();
		clearTimeout(replayTimer);
		if (ui.state() === "error") {
			if (phase === "boot" && !cfg.verbose) { phase = "user"; setLive(null); write(replay); replay = ""; }
			return;
		}
		ui.stage("boot", "done");
		ui.stage("userspace", "done", why);
		ui.setState("running");
		if (phase === "boot" && !cfg.verbose) {
			phase = "user";
			setLive(null); // "Starting Linux", replaced by its result
			if (resumed) {
				write(okLine(resumed.note) + "\r\n\r\n" + summary() + "\r\n");
				if (resumed.screen?.length) write(resumed.screen); // the console as it was (the guest does not redraw it)
				write(replay);
			} else {
				// Two steps: the kernel until it runs /init, then the base mounting the
				// distro image (its first blocks come over HTTP) and the distro's init.
				const user = cfg.distro ? cfg.guest[0]!.toUpperCase() + cfg.guest.slice(1) : "the base shell";
				// Dashboard port: logged, not shown (see status()); the logo and summary head the screen.
				const stageMs = (id: string) => { const ms = ui.stageTime(id); return ms != null ? ` (${fmtS(ms)})` : ""; };
				ui.hostLog(`[boot] OK Started Linux${cfg.cmdlineGiven ? `: ${cfg.cmdline}` : ""}${stageMs("boot")}`);
				ui.hostLog(`[boot] OK Started ${user}${stageMs("userspace")}`);
				write(intro() + "\r\n" + replay);
			}
			replay = "";
		}
	}
	/** What the console showed of the guest, saved by Suspend (session.ts). */
	const screenTail = new ScreenTail();
	/** Text the terminal shows once user space runs (kept for the redraw until then). */
	function show(t: string) {
		screenTail.push(t);
		if (phase === "user") write(t);
		else if (!cfg.verbose && (replay += t).length > 65536) replay = replay.slice(-49152);
	}
	const KSTAMP_RE = /^\[ *\d+\.\d+\] */;
	// The base's check of the root with the data disk's changes failed, so this boot
	// runs the plain image (safe mode), or it found no distro to boot and started its
	// base shell (guest/base/initramfs/init).
	let userTail = "", safeSeen = false, baseSeen = false;
	const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").trim();
	function watchUser(t: string) {
		if (safeSeen && baseSeen) return;
		userTail = (userTail + t).slice(-2048);
		const rs = baseSeen ? null : /unkernel base shell \([^)\r\n]*\): ([^\r\n]*)\r?\n/.exec(userTail);
		if (rs) {
			baseSeen = true;
			const reason = plain(rs[1]!);
			ui.hostLog(`[host] the base started its base shell: ${reason}`);
			ui.baseShell(reason);
		}
		const m = safeSeen ? null : /kw-overlay: SAFE MODE: ([^\r\n]*)\r?\n/.exec(userTail);
		if (!m) return;
		safeSeen = true;
		const reason = plain(m[1]!);
		ui.hostLog(`[host] the guest booted in safe mode: ${reason}`);
		ui.safeMode(reason);
	}
	/** A whole line during the boot phase, above the transient line. */
	const bootLine = (s: string) => write(live ? `\r\x1b[K${s}${live}` : s);
	const router = new ConsoleRouter({
		onKernelLine(line, info) {
			ui.log(line);
			if (/Run \S+ as init process/.test(line)) {
				ui.stage("boot", "done");
				ui.stage("userspace", "active", line.replace(KSTAMP_RE, "").trim());
			}
			if (phase === "boot") {
				if (info.important) {
					loud = true;
					bootLine(info.raw);
				} else if (cfg.verbose || loud) bootLine(`${SGR.gray}${line}${SGR.off}\r\n`);
				else setLive(" .... ", "Starting Linux", line.replace(KSTAMP_RE, ""));
			} else if (info.important) show(info.raw);
		},
		onUserOutput(t) {
			watchUser(t);
			if (cfg.verbose) { setLive(null); screenTail.push(t); write(t); return; }
			// Boot phase: drawn once, below the summary (markRunning). The router marks
			// user space on a whole line or a prompt; anything else shows after 300 ms.
			show(t);
			if (phase === "boot") replayTimer ??= setTimeout(() => markRunning("first output"), 300);
		},
		onUserspace(why) {
			if (why.startsWith("first output: ")) ui.log(why.slice(14));
			markRunning(why);
		},
	});
	function consoleWrite(bytes: Uint8Array) {
		sawOutput = true;
		router.write(bytes);
	}

	// --- download (the SDK's loader reports it) -----------------------------------
	let t0Download = 0, liveT = 0;
	function onDownload(d: DownloadProgress) {
		if (!t0Download) {
			t0Download = performance.now();
			ui.stage("kernel", "active", d.url);
		}
		if (d.done) {
			const ms = performance.now() - t0Download;
			const rate = `${(d.loaded / 1048576 / Math.max(ms / 1000, 0.001)).toFixed(1)} MiB/s`;
			ui.stage("kernel", "done", `${d.url} · ${fmtMiB(d.loaded)} · ${rate}`);
			ok(`Downloaded ${smp ? "unkernel-smp.wasm" : "unkernel.wasm"}, ${fmtMiB(d.loaded)}`, ms);
			// The kernel compiles while it downloads (compileStreaming); what is left shows as the compile step.
			ui.stage("compile", "active");
			ui.setState("booting", "Compiling");
			setLive(" .... ", `Compiling the kernel (${fmtMiB(d.loaded)} of WebAssembly)`);
		} else if (performance.now() - liveT >= 100) {
			liveT = performance.now();
			setLive(" .... ", `Downloading the kernel, ${fmtMiB(d.loaded)}`);
		}
	}

	// --- test hooks: fake an allocation failure --------------------------------
	if (cfg.simulate.includes("oom") || cfg.simulate.includes("lowmem")) {
		const Real = WebAssembly.Memory;
		const limitPages = cfg.simulate.includes("oom") ? 0 : 2048; // lowmem: nothing above 128 MiB
		const Fake = function Memory(desc: WebAssembly.MemoryDescriptor) {
			if (Number(desc?.initial) > limitPages)
				throw new RangeError(`WebAssembly.Memory(): could not allocate memory (simulated by ?simulate=${cfg.simulate.join(",")})`);
			return new Real(desc);
		} as unknown as typeof WebAssembly.Memory;
		Fake.prototype = Real.prototype;
		WebAssembly.Memory = Fake;
		teardown.push(() => { if (WebAssembly.Memory === Fake) WebAssembly.Memory = Real; });
	}

	// --- the suspended session (session.ts) ------------------------------------------
	const resumeRequested = takeResumeRequest();
	const sessionDevices = (): SessionDevices => ({ net: cfg.net, data: cfg.data });
	const ago = (t: number) => {
		const m = Math.round((Date.now() - t) / 60000);
		return m < 1 ? "just now" : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
	};
	/**
	 * Offer to resume the saved session, if this page can: the same kernel,
	 * the same devices and (inline, where the data disk is open here) the
	 * data disk unchanged since; in worker mode the worker checks the disk,
	 * and a refusal falls back to a fresh boot. null: boot fresh.
	 */
	async function offerResume(info: Promise<SessionMeta | null>, disks: BlockDevice[] | DiskSpec[]): Promise<{ snap: KernelSnapshot; meta: SessionMeta } | null> {
		let meta: SessionMeta | null;
		try {
			meta = await info;
		} catch (e) {
			ui.hostLog(`[host] suspended session: cannot read it: ${(e as Error)?.message ?? e}`);
			return null;
		}
		if (!meta) return null;
		const label = `saved ${ago(meta.saved)}, ${fmtMiB(meta.bytes)}`;
		// Inline: the disks as the snapshot lists them, the distro image first.
		const inlineDisks = !cfg.worker ? [...(distroDisk ? [distroDisk] : []), ...disks as BlockDevice[]] : null;
		// A data disk that changed since can never resume it: forget it then.
		const stale = inlineDisks ? snapshotDiskMismatch(meta.disks, inlineDisks)
			: cfg.data && meta.devices.data && data?.lock && !data.lock.held ? "the data disk is open in another tab" : null;
		const why = sessionMismatch(meta, cfg.kernelUrl, sessionDevices(), distroRef) ?? stale;
		if (why) {
			ui.check("session", "Suspended session", "info", `${label}; not resumed`, why);
			ui.hostLog(`[host] suspended session (${label}) not offered: ${why}`);
			if (stale && !/another tab/.test(stale)) await clearSession().catch(() => {});
			return null;
		}
		const dataNote = meta.devices.data ? " Boot fresh discards it: a fresh boot changes the data disk." : " Boot fresh keeps it for later.";
		// The Resume button (after Suspend) reloaded the page: resume without asking again.
		if (!resumeRequested && !await ui.ask({ title: "resume", msg: `Resume the session suspended ${ago(meta.saved)} (${fmtMiB(meta.bytes)}, ${meta.memoryMiB} MiB of memory)?${dataNote}`, ok: "Resume", cancel: "Boot fresh" })) {
			ui.hostLog(`[host] suspended session (${label}): booting fresh instead`);
			if (meta.devices.data) await clearSession().catch(() => {});
			return null;
		}
		try {
			return { snap: await loadSession(), meta };
		} catch (e) {
			warn(`Could not read the suspended session: ${(e as Error)?.message ?? e}`);
			await clearSession().catch(() => {});
			return null;
		}
	}
	/** The Suspend in progress: settles with null once saved, or why it failed (the exit waits for it). */
	let suspending: Promise<string | null> | null = null;
	/**
	 * Suspend: save the running machine in this browser and stop it
	 * (session.ts); the next load offers to resume it. Not with several CPUs:
	 * the SMP kernel cannot park, so it has no snapshots (ui.confirmSuspend()
	 * says so, and KW.suspend stays unset).
	 */
	if (!smp) KW.suspend = async () => {
		if (!vm || ended() || !running) throw new Error("the system is not running");
		if (suspending) throw new Error("a suspend is in progress");
		if (typeof indexedDB === "undefined") throw new Error("this browser has no IndexedDB to keep the session in");
		const t0 = performance.now();
		const target = vm;
		ui.setState("running", "Suspending");
		let tSnap = 0;
		const run = async () => {
			const snap = await target.snapshot({ stop: true });
			tSnap = performance.now() - t0;
			return saveSession(snap, { saved: Date.now(), kernelUrl: cfg.kernelUrl, devices: sessionDevices(), screen: screenTail.text(), worker: cfg.worker, distro: distroRef });
		};
		const p = run();
		suspending = p.then(() => null, (e: unknown) => (e as Error)?.message ?? String(e));
		try {
			const bytes = await p;
			ui.hostLog(`[host] suspended: ${fmtMiB(bytes)} saved in this browser (parked and copied in ${fmtS(tSnap)}, stored in ${fmtS(performance.now() - t0 - tSnap)})`);
			return { bytes, ms: performance.now() - t0 };
		} catch (e) {
			if (!ended()) { // refused before the copy (a task did not park, I/O in flight): it runs on
				suspending = null;
				ui.setState("running", "Running");
			}
			throw e;
		}
	};

	// --- several CPUs: what falls back to one ---------------------------------------
	/**
	 * Reload this tab once on one CPU (config.ts reads UP_ONCE_KEY; ?cpus= stays
	 * in the URL, so the next Reboot tries again), optionally resuming the
	 * suspended session. False if sessionStorage refuses the note, which would
	 * make the reload try the same again: then the caller reports the failure.
	 */
	function bootUpOnce(reason: string, resume = false, inline = false): boolean {
		try {
			sessionStorage.setItem(inline ? INLINE_ONCE_KEY : UP_ONCE_KEY, reason);
		} catch {
			return false;
		}
		const what = inline ? "on the page's thread" : "on one CPU";
		ui.hostLog(`[host] booting ${what} instead: ${reason}`);
		KW.term?.notice(`[host] booting ${what} instead: ${reason}`);
		if (resume) ui.resume(); // sets kw-resume and restarts
		else KW.reload?.();
		return true;
	}
	/**
	 * Several CPUs and a suspended session (always saved on one CPU, the UP
	 * kernel): offer to resume it on one CPU this time. True: the page
	 * reloads to do that. Asked before the kernel downloads, since the answer
	 * picks which one.
	 */
	async function offerResumeUp(info: Promise<SessionMeta | null>): Promise<boolean> {
		let meta: SessionMeta | null;
		try {
			meta = await info;
		} catch (e) {
			ui.hostLog(`[host] suspended session: cannot read it: ${(e as Error)?.message ?? e}`);
			return false;
		}
		if (!meta) return false;
		const label = `saved ${ago(meta.saved)}, ${fmtMiB(meta.bytes)}`;
		const why = sessionMismatch(meta, cfg.kernelUrl, sessionDevices(), distroRef) ??
			(cfg.data && meta.devices.data && data?.lock && !data.lock.held ? "the data disk is open in another tab" : null);
		if (why) {
			ui.check("session", "Suspended session", "info", `${label}; not resumed`, why);
			ui.hostLog(`[host] suspended session (${label}) not offered: ${why}`);
			return false;
		}
		const n = cfg.cpus;
		const dataNote = meta.devices.data ? ` Booting on ${n} CPUs discards it: that boot changes the data disk.` : ` Booting on ${n} CPUs keeps it for later.`;
		if (!resumeRequested && !await ui.ask({ title: "resume", msg: `Resume the session suspended ${ago(meta.saved)} (${fmtMiB(meta.bytes)}, ${meta.memoryMiB} MiB of memory)? It resumes on one CPU, as it was saved.${dataNote}`, ok: "Resume on 1 CPU", cancel: `Boot on ${n} CPUs` })) {
			ui.hostLog(`[host] suspended session (${label}): booting on ${n} CPUs instead`);
			ui.check("session", "Suspended session", "info", `${label}; not resumed`, `booted on ${n} CPUs instead${meta.devices.data ? " (discarded: the data disk changes)" : ""}`);
			if (meta.devices.data) await clearSession().catch(() => {});
			return false;
		}
		return bootUpOnce(`resuming the session suspended ${ago(meta.saved)}, which runs on one CPU`, true);
	}

	// --- the distro image and what the base made of it ---------------------------------
	/** The distro image's HttpBase counters (inline only: the worker reads it there). */
	const distroStats = () => (distroDisk?.inner as { base?: { stats?: { requests: number; bytes: number } } } | undefined)?.base?.stats;
	/** The image as the host read it (its superblock), as a boot line and the Distro row. */
	function showDistro(info: { fs: string; size: number; label: string; uuid: string }, ms: number | null) {
		if (!distro) return;
		ok(`Attached the ${distro.name[0]!.toUpperCase()}${distro.name.slice(1)} image (${fmtMiB(info.size)}, streamed)`, ms);
		ui.check("distro", "Distro", cfg.distroWhy ? "warn" : "pass", distro.name, `${cfg.distroWhy ? `${cfg.distroWhy}; ` : ""}${distro.url}: ${info.fs}, ${fmtMiB(info.size)}, label ${info.label}, uuid ${info.uuid}; read-only /dev/wda, read with Range requests as the guest needs it`);
		ui.hostLog(`[host] distro: ${distro.url} (${info.fs}, ${info.size} bytes, uuid ${info.uuid})${ms != null ? ` opened in ${fmtS(ms)}` : ""}`);
	}
	/** Once user space runs: /run/kw-base (guest/base/initramfs/init) says which image booted and where its changes go. */
	async function showBase(vm: KernelHandle) {
		try {
			// Shell builtins only: a program (cat) would be read from the distro image, over HTTP.
			const r = await vm.exec("/bin/sh", ["-c", 'while IFS= read -r l; do echo "$l"; done < /run/kw-base']);
			if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`);
			const kv: Record<string, string> = {};
			for (const l of r.stdout.split("\n")) if (l.includes("=")) kv[l.slice(0, l.indexOf("="))] = l.slice(l.indexOf("=") + 1);
			const st = distroStats();
			const reads = st ? `; ${st.requests} range requests, ${fmtMiB(st.bytes)} of the image read so far` : "";
			ui.hostLog(`[host] base: name=${kv.name ?? ""} image=${kv.image ?? ""} upper=${kv.upper ?? ""} why=${kv.why ?? ""}${reads}`);
			if (kv.upper === "none") return; // the base shell: watchUser() said why
			if (kv.image) ui.distroBooted(kv.image);
			if (distro) ui.check("distro", "Distro", cfg.distroWhy ? "warn" : "pass", kv.image || distro.name,
				`${cfg.distroWhy ? `${cfg.distroWhy}; ` : ""}${distro.url}${vm.distro ? `: ${vm.distro.fs}, ${fmtMiB(vm.distro.size)}` : ""}; read-only /dev/wda${reads}`);
			const why = kv.why ?? "";
			if (kv.upper === "data") ui.check("overlay", "Root", "pass", "overlay, changes on the data disk", `${kv.state}/upper over the ${kv.name} image`);
			else if (why === "kw.root=initramfs") ui.check("overlay", "Root", "warn", "safe mode (kw.root=initramfs)", `the plain ${kv.name} image; changes in memory, ${kv.state}/upper unused this boot`);
			else if (!why.startsWith("safe mode")) ui.check("overlay", "Root", "info", "overlay, changes in memory", why); // safe mode: watchUser() said why
		} catch (e) {
			ui.hostLog(`[host] /run/kw-base: ${(e as Error)?.message ?? e}`);
		}
	}

	// --- boot --------------------------------------------------------------------
	async function boot() {
		ui.setState("loading", "Downloading");
		setLive(" .... ", "Downloading");
		const t0 = performance.now();
		// The kernel downloads and compiles on this thread in both modes (the engine compiles
		// off-thread while it streams), so it overlaps the terminal's start and, in worker
		// mode, the data disk lock; the worker then gets the compiled Module.
		const load = (url: string) => {
			const p = loadKernelModule(url, { what: "kernel", onProgress: onDownload, signal }).catch((e: unknown) => {
				const compile = e instanceof BootError && e.stage === "compile";
				throw tag(e, compile ? "compile" : "fetch", compile ? "compile" : "kernel");
			});
			p.catch(() => {}); // awaited below; a failure there is the one reported
			return p;
		};
		// Several CPUs: the SMP kernel, once a suspended session was offered (below).
		let loading = smp ? null : load(kernelUrl);
		// The image to boot (worker mode: the worker opens it from its URL).
		if (cfg.distroWhy) {
			warn(cfg.distroWhy);
			ui.toast(cfg.distroWhy);
		}
		ui.check("distro", "Distro", cfg.distroWhy ? "warn" : "info", distro?.name ?? "none (base shell)",
			cfg.distroWhy ?? (distro ? `${distro.url}, ${fmtMiB(distro.size)}` : "?distro=none: the base initramfs's shell, no distro image"));
		// Inline: opened while the kernel downloads (one Range request and the first 64 KiB).
		const tDistro = performance.now();
		const distroOpening = distro && !cfg.worker
			? openDistroDisk(distro.url, { log: (m) => { console.log(m); ui.hostLog(m); } }).then((d) => ({ d, ms: performance.now() - tDistro }))
			: null;
		distroOpening?.catch(() => {}); // awaited below
		const session = sessionInfo();
		session.catch(() => {});
		let dataDisks: BlockDevice[] | DiskSpec[] = [];
		if (cfg.worker) {
			// The worker builds the data disk and the network from specs.
			ui.check("worker", "Worker mode", "pass", cfg.workerParam ? (cfg.workerAsked ? "on (?worker=1)" : "on (default)") : `for ${cfg.cpus} CPUs (?cpus=${cfg.smpParam})`,
				"the kernel, the data disk, the network, the display, input and sound devices run in a Web Worker" + (smp ? ", which starts the other CPUs as workers of its own" : ""));
			ui.hostLog(`[host] worker mode: the kernel runs in a Web Worker, with the data disk, the network, the display, input and sound${smp ? `; ${cfg.cpus} CPUs` : ""}`);
			dataDisks = await dataSpec();
			going();
		}
		if (smp) {
			if (await offerResumeUp(session)) return; // reloading to resume on one CPU
			going();
			loading = load(kernelUrl);
		}
		let module: WebAssembly.Module;
		try {
			module = await loading!;
		} catch (e) {
			if (signal.aborted) throw ABORTED;
			if (smp && bootUpOnce(`the SMP kernel did not load (${(e as Error)?.message ?? e})`)) return;
			throw e;
		}
		going();
		if (ui.stageState("compile") !== "active") ui.stage("compile", "active"); // no progress events (e.g. a cached module)
		ui.stage("compile", "done", `${WebAssembly.Module.imports(module).length} imports, ${WebAssembly.Module.exports(module).length} exports`);
		setLive(null);
		ok("Compiled the kernel", ui.stageTime("compile"));
		ui.hostLog(`[host] kernel downloaded and compiled in ${fmtS(performance.now() - t0)}`);
		const bundle = bundledBoot(module);
		const b = bundle.initrd;
		if (!b) throw tag(new Error(`${kernelUrl} has no bundled base initramfs`), "compile", "kernel");
		ui.hostLog(`[host] base initramfs: bundled in ${kernelUrl} (${fmtMiB(b.length)} gzipped)`);
		ok(`Found the base initramfs (${fmtMiB(b.length)})`);
		// The bundle's own command line unless ?append= gives one, with ?root= (kw.root=) after it.
		if (!cfg.append && bundle.cmdline) cfg.cmdline = cfg.root ? `${bundle.cmdline} kw.root=${cfg.root}` : bundle.cmdline;
		if (distroOpening) {
			try {
				const { d, ms } = await distroOpening;
				going();
				distroDisk = d;
				showDistro(d.info, ms);
			} catch (e) {
				if (e === ABORTED) throw e;
				throw tag(distroMissing(e, distro!.url), "distro", "kernel");
			}
		}
		if (!cfg.worker) dataDisks = await openData(module);
		going();

		await termReady.catch((e: unknown) => { throw tag(e, "terminal", ""); }); // the console needs it (and its size)
		going();
		const memoryStage = () => {
			ui.setState("booting", "Booting");
			ui.stage("memory", "active", `${cfg.memMiB} MiB requested (${cfg.memWhy})`);
		};
		if (!cfg.worker) memoryStage(); // worker mode: once the worker runs
		// A failed read of the distro image (the server went away, or the image was rebuilt:
		// the SDK's strict HttpBase refuses a changed one) is an I/O error in the guest: say so.
		let distroReadFailed = false;
		const log = (m: string) => {
			console.log(m);
			ui.hostLog(m);
			if (distro && !distroReadFailed && /^\[host\] block: wda op 0 /.test(m)) {
				distroReadFailed = true;
				KW.report("distro", `Reading the ${distro.name} image failed: the guest gets I/O errors from its root. If the image was rebuilt or the server stopped, reload the page.`, m, false);
			}
		};
		// Worker mode: a worker that never reports back must not leave the page waiting.
		let workerWatchdog: ReturnType<typeof setTimeout> | undefined;
		if (cfg.worker) {
			setLive(" .... ", "Starting the kernel worker");
			teardown.push(() => clearTimeout(workerWatchdog));
			workerWatchdog = setTimeout(() => {
				// A default worker: the page's thread once instead (an asked one is reported).
				if (!cfg.workerAsked && bootUpOnce("the kernel worker did not report back within 20 s", false, true)) return;
				ui.fail("worker", "The kernel worker did not report back within 20 s (it may have failed to load; the browser console may say why)", "",
					{ title: "Worker mode failed" });
			}, 20000);
		}
		const onProgress = (p: BootProgress) => {
			if (p.stage === "worker") {
				// Worker mode: the worker runs. JSPI in a worker is checked by nobody but this.
				clearTimeout(workerWatchdog);
				ui.check("worker-jspi", "JSPI in the worker", p.jspi ? "pass" : "fail", p.jspi ? "yes" : "no",
					p.jspi ? "WebAssembly.Suspending and promising exist in the Web Worker" : "the page has JSPI but its Web Worker does not, so worker mode cannot run in this browser (leave out ?worker=1)");
				ui.hostLog(`[host] kernel worker started; JSPI in the worker: ${p.jspi ? "yes" : "no"}`);
				memoryStage();
			} else if (p.stage === "download") {
				onDownload(p);
			} else if (p.stage === "memory") {
				KW.memActualMiB = p.mib;
				const fell = p.failures.length > 0;
				const kind = p.memory64 ? "64-bit" : "32-bit";
				ui.stage("memory", "done", fell ? `${p.mib} MiB ${kind} (${p.requestedMiB} MiB failed: ${p.failures.join("; ")})` : `${p.mib} MiB ${kind}`);
				ui.check("mem", "Kernel memory", fell ? "warn" : "pass", `${p.mib} MiB`, fell ? `wanted ${p.requestedMiB} MiB: ${p.failures.join("; ")}` : cfg.memWhy);
				if (fell) {
					ui.toast(`Using ${p.mib} MiB: ${p.requestedMiB} MiB could not be allocated`);
					warn(`Allocated ${p.mib} MiB of memory (${p.requestedMiB} MiB failed)`, ui.stageTime("memory"));
				} else ok(`Allocated ${p.mib} MiB of memory`, ui.stageTime("memory"));
			} else if (p.stage === "instantiate") {
				ui.stage("boot", "active", "instantiating the module");
			} else if (p.stage === "start") {
				ui.stage("boot", "active", `cmdline: ${cfg.cmdline}`);
				// The transient line, which the kernel's messages then follow; its result,
				// "Started Linux", heads the screen once user space runs. ?verbose=1 never
				// writes that, and lists every kernel line: a header line instead.
				if (cfg.verbose) bootLine(`         Starting Linux${cmdlineNote()}\r\n`);
				else setLive(" .... ", "Starting Linux");
			}
		};
		const common = {
			cmdline: cfg.cmdline, memoryMiB: cfg.memMiB, memoryFallbackMiB: cfg.memFallbackMiB, jit: cfg.jit,
			consoleSize: { cols: term.cols, rows: term.rows },
			onOutput: consoleWrite, log, onProgress,
			signal, // stop(): aborts the downloads, or stops a kernel that booted meanwhile
			display: false, sound: false, // no display or sound in this port (config.ts)
			vsock: true, // the terminal windows (windows.ts: kwtty sessions)
		};
		// Several CPUs: offered above (offerResumeUp), on one CPU only.
		const resume = smp ? null : await offerResume(session, dataDisks);
		going();
		kernelStarting = true;
		try {
			const create = (restore?: KernelSnapshot) => {
				// Worker mode: the SDK posts the Module compiled above to the worker. An engine
				// that cannot post one (not seen so far; Safari is untested) gets the kernel's
				// URL instead, absolute because the worker has no base of its own, and the
				// worker downloads (from the HTTP cache) and compiles it.
				const inWorker = (kernel: WebAssembly.Module | string) => createKernel({
					...common, worker: true, kernel, compileInWorker: typeof kernel === "string",
					cpus: smp ? cfg.cpus : undefined, // the worker starts the other CPUs (js/web/cpu.ts)
					shared: cfg.shared ? undefined : false, // shared memory where the page is cross-origin isolated (?shared=0: never)
					disks: dataDisks as DiskSpec[], onDiskError: (_i, e) => saveError(e),
					distro: distro?.url, // a spec the page makes (relative to the page); the worker opens it
					net: browserNetSpec({ enabled: cfg.net, servers: cfg.wisp }), // Wisp, in the worker (net.ts)
					restore, transferRestore: true, // the snapshot is read for this boot only
				});
				return cfg.worker
					? inWorker(module).catch((e: unknown) => {
						if (!(e instanceof BootError && e.stage === "support" && /cannot send the kernel/.test(e.message))) throw e;
						ui.hostLog(`[host] ${e.message}; the worker loads the kernel itself`);
						return inWorker(new URL(kernelUrl, location.href).href);
					})
					: createKernel({
						...common, kernel: module, disks: dataDisks as BlockDevice[], restore, distro: distroDisk ?? undefined,
						net: browserNet({ enabled: cfg.net, servers: cfg.wisp, log }), // Wisp (net.ts)
					});
			};
			if (resume) {
				try {
					vm = await create(resume.snap);
					resumed = { note: `Resumed the session suspended ${ago(resume.meta.saved)}`, screen: resume.meta.screen };
					if (resume.meta.screen) screenTail.push(resume.meta.screen);
					ui.check("session", "Suspended session", "pass", `resumed (saved ${ago(resume.meta.saved)})`, `${fmtMiB(resume.meta.bytes)}; saved ${cfg.worker === resume.meta.worker ? "in this mode" : resume.meta.worker ? "in worker mode" : "inline"}`);
				} catch (e) {
					going();
					// Refused (a disk or device that differs, another kernel build) or failed: boot fresh.
					const why = (e as Error)?.message ?? String(e);
					warn(`Could not resume the suspended session (${why}); booting fresh`);
					ui.toast(`Could not resume: ${why}`);
					ui.check("session", "Suspended session", "warn", "not resumed", why);
					vm = await create();
				}
				// Resumed or refused, it is used up: the running machine changes the disk.
				await clearSession().catch(() => {});
			} else vm = await create();
		} catch (e) {
			kernelStarting = false;
			clearTimeout(workerWatchdog);
			if (signal.aborted) throw ABORTED;
			// The distro image (worker mode opens it in the worker): not a reason to try one CPU.
			if (/^distro: /.test((e as Error)?.message ?? "")) throw tag(e, "distro", "kernel");
			const be = e instanceof BootError ? e : undefined;
			// A default worker that could not start (its JSPI, the module): the page's thread, one CPU.
			if (cfg.worker && !cfg.workerAsked && be?.stage === "support" && bootUpOnce(`the kernel worker did not start (${be.message})`, false, true)) return;
			// Several CPUs that did not start (the worker, its JSPI, the shared memory): one CPU.
			if (smp && bootUpOnce(`booting on ${cfg.cpus} CPUs failed (${(e as Error)?.message ?? e})`)) return;
			if (cfg.worker && be?.stage === "support") throw tag(e, "worker", "boot");
			if (cfg.worker && be?.stage === "download") throw tag(e, "fetch", "kernel");
			if (cfg.worker && be?.stage === "compile") throw tag(e, "compile", "compile");
			const stage = be?.stage === "memory" ? "memory" : "boot";
			throw tag(e, stage, stage);
		}
		kernelStarting = false;
		clearTimeout(workerWatchdog);
		// Booted just as stop() was called: stop it here, whether or not stop() still waits for this boot.
		if (signal.aborted) { void haltVm(); throw ABORTED; }
		// The guest's WASI programs (.wasm files, run by kwwasi over vsock port 1021)
		// on the page's wasm engine, each in a Web Worker (js/web/wasi.ts).
		const wasi = vm.vsock ? serveWasiPrograms(vm.vsock, { log }) : undefined;
		void vm.exited.then(() => { vmExited = true; wasi?.close(); });
		g.vm = vm;
		KW.vm = vm;
		checkReady();
		const inst = local();
		if (inst) {
			g.kernel = inst.kernel;
			KW.kernel = inst.kernel;
		}
		if (cfg.worker && vm.distro) showDistro(vm.distro, null);
		if (vm instanceof WorkerKernel) {
			workerDataAttached(vm, performance.now() - t0);
			const shared = vm.transport === "shared";
			const why = shared ? "the page is cross-origin isolated" : !cfg.shared ? "?shared=0" : "the page is not cross-origin isolated, so it has no SharedArrayBuffer";
			ui.check("worker-transport", "Worker input and frames", shared ? "pass" : "info", shared ? "shared memory" : "messages",
				shared ? `${why}: the worker reads input and frame requests while the kernel runs (about 1 ms)`
					: `${why}: they wait for the kernel's next yield, up to 20 ms while the guest is busy`);
			ui.hostLog(`[host] kernel worker: console and evdev input and frames by ${shared ? "shared memory" : "messages"} (${why})`);
		}
		if (smp) {
			// The worker gives the SMP kernel one CPU where it cannot start their threads (it logs why).
			const got = vm.stats().cpus;
			ui.check("smp", "Guest CPUs", got > 1 ? "pass" : "warn", got > 1 ? `${got} (?cpus=${cfg.smpParam})` : `1 (asked for ${cfg.cpus})`,
				got > 1 ? "the SMP kernel, each CPU in a Web Worker on one shared memory"
					: "the kernel worker could not start CPU threads (the Kernel log says why): the SMP kernel runs on one CPU");
			ui.hostLog(`[host] SMP kernel on ${got} CPU${got > 1 ? "s" : ""} (${cfg.cpus} asked)`);
			if (got < cfg.cpus) ui.toast(`Running on ${got} CPU${got > 1 ? "s" : ""}: the worker could not start more`);
		}
		const booted = vm;
		KW.jitStats = () => booted.stats().jit;
		// kwemu's JIT counters in the System tab (and Copy diagnostics), for devices without devtools.
		let jitShown = "";
		const showJit = () => {
			const j = booted.stats().jit;
			const value = !j.enabled ? (cfg.jit ? "unavailable" : "off (?jit=0)") : !j.requested ? "kernel without the JIT tier"
				: `${j.compiled} compiled, ${j.live} live (max ${j.maxLive}), ${j.freed} freed, ${j.failed} failed`;
			const gc = j.collected < 0 ? "" : `; ${j.collected} collected, ${j.retained} freed but uncollected (max ${j.maxRetained})` +
				(j.gcNudges ? `, ${j.gcNudges} GC nudges` : "") + (j.refused ? `, ${j.refused} refused` : "");
			const note = j.compiled ? `${j.compileMs.toFixed(0)} ms compiling, ${fmtMiB(j.bytes)} of modules${gc}` : "";
			if (value + note === jitShown) return;
			jitShown = value + note;
			ui.check("jit", "JIT tier", j.failed ? "warn" : j.compiled ? "pass" : "info", value, note);
		};
		showJit();

		// Not fatal, but worth flagging: the kernel started and printed nothing.
		const bootTime = inst ? inst.kernel.bootTime : performance.now();
		const jitTimer = every(() => (ended() ? clearInterval(jitTimer) : showJit()), 2000);
		const quiet = every(() => {
			if (ended()) return clearInterval(quiet);
			if (!sawOutput && performance.now() - bootTime > 30000) {
				clearInterval(quiet);
				KW.report("watchdog", "No console output 30 s after the kernel started", `cmdline: ${cfg.cmdline}`, false);
			}
		}, 2000);

		if (resumed) markRunning("resumed"); // the guest prints nothing by itself
		const res = await vm.exited;
		clearInterval(quiet);
		if (signal.aborted) return; // stop() stopped it
		stopWindows(`the kernel stopped (${res.kind})`);
		if (suspending && res.kind === "stopped") {
			const failed = await suspending;
			ui.setState("halted", failed ? "Stopped" : "Suspended");
			if (!failed) ui.setSuspended();
			KW.term!.notice(failed ? `[host] the suspend failed after the kernel stopped (${failed}) — use Reboot in the status panel to start again`
				: "[host] suspended — Resume (or reload the page) to continue");
			return;
		}
		if (res.kind === "halt") {
			const label = res.code === 0 ? "Powered off" : `Halted (${res.code})`;
			ui.hostLog(`[host] kernel halted (code ${res.code})`);
			if (!running) { ui.stage("boot", "done"); ui.stage("userspace", "skip"); }
			// `reboot` in the guest (code 2): start again, unless it keeps doing that.
			if (res.code === 2 && autoRebootAllowed()) {
				ui.setState("halted", "Restarting");
				KW.term!.notice("[host] restart requested — rebooting");
				await data?.disk?.saving?.catch(() => {}); // the last flush's transaction
				ui.reboot();
				return;
			}
			ui.setState("halted", label);
			const why = res.code === 2 ? ` (restart requested ${AUTO_REBOOT_MAX} times within a minute, so not rebooting on its own)` : "";
			KW.term!.notice(`[host] ${label.toLowerCase()}${why} — use Reboot in the status panel to start again`);
			return;
		}
		const titles: Record<string, string> = { panic: "Kernel panic", trap: "WebAssembly trap in the kernel", fatal: "Host runtime error" };
		ui.fail(res.kind, res.reason, (res.error as Error | undefined)?.stack ?? "", { title: titles[res.kind] ?? "Kernel stopped" });
	}

	const booting = boot().catch((e: StageError | typeof ABORTED) => {
		if (signal.aborted || e === ABORTED) return; // stop(): not a failure
		console.error(e);
		stopWindows("the boot failed");
		failed(e.kind === "distro" ? `Open the ${cfg.guest} image` : STEP[e.stageId ?? ""] ?? "Boot");
		if (e.stageId) ui.stage(e.stageId, "fail", e.message);
		const titles: Record<string, string> = { fetch: "Download failed", compile: "Kernel failed to compile", memory: "Not enough memory", boot: "Boot failed", terminal: "The terminal failed to start",
			worker: "Worker mode cannot run in this browser", distro: "The distro image could not be opened" };
		const hint = e.kind === "distro" ? `The page reads ${cfg.distro?.url ?? "the image"} from its own server with Range requests. ` +
			"The dashboard's Docker image includes it; other builds do not bundle the image: provide debian.erofs of the pinned unkernel release (v0.2.0-261119-97d7945) there, for example in public/terminal/ before the build. " +
			"Or set Distro to none under Options and Reboot for the base shell." : undefined;
		ui.fail(e.kind ?? "boot", e.message, (e.cause as Error | undefined)?.stack ?? e.stack, { title: titles[e.kind ?? ""] ?? "Boot failed", ...(hint ? { hint } : {}) });
	});

	// --- stop (dashboard port) --------------------------------------------------------
	/** Stop the kernel once (the boot or stop(), whichever gets there first). */
	let halting: { vm: KernelHandle; done: Promise<unknown> } | null = null;
	function haltVm(): Promise<unknown> {
		if (!vm) return Promise.resolve();
		if (halting?.vm !== vm) halting = { vm, done: vm.stop().catch(() => {}) };
		return halting.done;
	}
	/** Let go of the data disk once: its saves (the last one finishes), its store, then its lock(s). */
	let released: DataAttach | null = null;
	async function releaseData() {
		const extra = takenLock;
		takenLock = null;
		extra?.release();
		const d = data;
		if (!d || released === d) return;
		released = d;
		await detachDataDisk(d.disk).catch(() => {});
		d.lock?.release();
	}
	const finish = async () => { await haltVm(); await releaseData(); };
	let stopping: Promise<void> | null = null;
	function stop(): Promise<void> {
		return (stopping ??= (async () => {
			// Running: write the guest's file systems back first (as Reboot does). Before the abort:
			// createKernel() got the signal, and the SDK stops a booted kernel on abort at once (no
			// clean shutdown), which would lose the writes not yet flushed.
			if (vm && running && !ended()) await vm.sync({ timeout: 3000 }).catch(() => false);
			abort.abort();
			ui.answer(false); // a question in the confirm dialog (resume?) that boot() awaits
			void booting.then(finish); // whatever a late boot step leaves behind (see below)
			if (vm) await haltVm(); // boot() then returns from its wait for the exit
			// createKernel() and loadKernelModule() take the signal; a step that does not (opening
			// IndexedDB, the distro image) is waited for, but not forever.
			let waited: ReturnType<typeof setTimeout> | undefined;
			await Promise.race([booting, new Promise((r) => { waited = setTimeout(r, STOP_WAIT_MS); })]);
			clearTimeout(waited);
			await finish();
			stopWindows("the shell was closed");
			for (const undo of teardown.splice(0).reverse()) {
				try { undo(); } catch { /* keep going */ }
			}
			try { term.destroy(); } catch { /* already gone */ }
			if (g.term === term) delete g.term;
			if (vm && g.vm === vm) delete g.vm;
			if (g.kernel && g.kernel === local()?.kernel) delete g.kernel;
			// Let go of the kernel (its memory) and of every closure over this run: KW (kw.ts) stays
			// the current one until the next mount, and the session keeps it too.
			for (const k of ["vm", "kernel", "term", "ready", "windows", "dataDisk", "sync", "beforeReboot", "exportData", "importData", "resetData", "suspend", "jitStats", "screenText"] as const) delete KW[k];
			vm = null;
			distroDisk = null;
		})());
	}
	return { stop };
}

/**
 * Dashboard port: the distro image is provided at deploy time, and a server
 * without it may answer its URL with the app's index.html (an SPA fallback).
 * Say that plainly instead of the SDK's "neither an erofs nor an ext4 image".
 */
function distroMissing(e: unknown, url: string): unknown {
	const why = (e as Error)?.message ?? String(e);
	if (!/neither an erofs nor an ext4 image|does not support Range requests|HTTP 404/.test(why)) return e;
	return new Error(`No distro image at ${url} (the server answered with something else: ${why}). The image comes with the dashboard's Docker image only; elsewhere it must be provided at that URL.`, { cause: e });
}

/** How long stop() waits for a boot step that cannot be aborted before it tears down anyway. */
const STOP_WAIT_MS = 5000;
