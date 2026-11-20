// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The page's persistent data disk: an ext4 file system labelled kwdata (the
// guest mounts it at /data) kept in IndexedDB (the SDK's openDataDisk). This
// module owns the browser side: the template, the one-tab-at-a-time lock,
// storage persistence and quota, and export, import and reset. boot.ts
// calls attachDataDisk() and wires the rest to KW.*.
import { DATA_DISK_NAME, gzipBlob, importDataDisk, openDataDisk, resetDataDisk, type CowDisk } from "./sdk.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DiskLock {
	held: boolean;
	how: string;
	why?: unknown;
	/** Let go of a held lock (dashboard port: the shell's stop(), so the next mount gets it). */
	release(): void;
}

/**
 * Hold the disk until release() (upstream: for the page's lifetime), if no other tab does:
 * navigator.locks (secure contexts), else a BroadcastChannel probe (plain
 * http LAN pages are not a secure context; two tabs opened in the same
 * instant may both win there).
 */
export function acquireDiskLock(name = DATA_DISK_NAME): Promise<DiskLock> {
	const key = `kwdisk:${name}`;
	if (navigator.locks?.request) {
		return new Promise((resolve) => {
			navigator.locks.request(key, { ifAvailable: true }, (lock) => {
				if (!lock) { resolve({ held: false, how: "Web Locks", release() {} }); return undefined; }
				// Held until release(), or until the page goes away.
				return new Promise<void>((done) => resolve({ held: true, how: "Web Locks", release: done }));
			}).catch((e: unknown) => resolve(probeLock(key, e)));
		});
	}
	return probeLock(key);
}

async function probeLock(key: string, why?: unknown): Promise<DiskLock> {
	if (typeof BroadcastChannel !== "function") return { held: true, how: "none (no Web Locks or BroadcastChannel)", why, release() {} };
	const ch = new BroadcastChannel(key);
	let held = false, taken = false;
	ch.onmessage = (e: MessageEvent) => {
		if (e.data?.type === "held") taken = true;
		else if (e.data?.type === "probe" && held) ch.postMessage({ type: "held" });
	};
	ch.postMessage({ type: "probe" });
	await sleep(300);
	if (taken) {
		ch.close();
		return { held: false, how: "BroadcastChannel", release() {} };
	}
	held = true; // the channel stays open and answers probes until release() (or the page goes away)
	return { held: true, how: "BroadcastChannel", release() { held = false; ch.close(); } };
}

/** The template: the kernel bundle's custom section unkernel.datadisk (kernel/build.sh datadisk, bundle). */
export function loadTemplate(bundled: Uint8Array | undefined): { bytes: Uint8Array | null; from: string } {
	return bundled ? { bytes: bundled, from: "bundled in the kernel" } : { bytes: null, from: "the kernel has no unkernel.datadisk section" };
}

export const fmtSize = (n: number): string =>
	n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GiB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.round(n / 1024)} KiB`;

export interface StorageState {
	persisted?: boolean;
	usage?: number;
	quota?: number;
}

/** navigator.storage: persistence (asked for with `ask`), usage and quota; fields undefined where unsupported. */
export async function storageState({ ask = false }: { ask?: boolean } = {}): Promise<StorageState> {
	const s = navigator.storage;
	const out: StorageState = {};
	try {
		if (ask && s?.persist) out.persisted = await s.persist();
		else if (s?.persisted) out.persisted = await s.persisted();
	} catch {}
	try {
		if (s?.estimate) {
			const e = await s.estimate();
			out.usage = e.usage;
			out.quota = e.quota;
		}
	} catch {}
	return out;
}

export interface DataAttach {
	/** null: no data disk (reason says why). */
	disk: CowDisk | null;
	lock: DiskLock | null;
	/** Attached, but not persistently: why. */
	notice?: string;
	reason?: string;
	/** Where the template came from. */
	from?: string;
}

/** Open the data disk for this page. */
export async function attachDataDisk({ enabled, bundled, log, onError }: {
	enabled: boolean;
	bundled: Uint8Array | undefined;
	log: (m: string) => void;
	onError: (e: unknown) => void;
}): Promise<DataAttach> {
	if (!enabled) return { disk: null, lock: null, reason: "off (?data=0)" };
	if (typeof indexedDB === "undefined") return { disk: null, lock: null, reason: "no IndexedDB in this browser" };
	const tpl = loadTemplate(bundled);
	if (!tpl.bytes) return { disk: null, lock: null, reason: `no template (${tpl.from})` };
	const lock = await acquireDiskLock();
	if (!lock.held) {
		const disk = await openDataDisk({ template: tpl.bytes, mode: "snapshot", log });
		return { disk, lock, from: tpl.from, notice: `open in another tab: this tab's /data is ${disk.notice} (changes are not saved)` };
	}
	try {
		const disk = await openDataDisk({ template: tpl.bytes, log, onError });
		return { disk, lock, from: tpl.from };
	} catch (e) {
		// A saved disk of another format, or IndexedDB refusing (private
		// browsing, disabled storage): run on a copy of the template.
		const err = e as Error;
		log(`[host] data disk: not attached persistently: ${err.name}: ${err.message}`);
		const disk = await openDataDisk({ template: tpl.bytes, mode: "snapshot", log, snapshotLimit: 0 });
		const why = err.name === "DataDiskFormatError" ? err.message : `IndexedDB failed (${err.name}: ${err.message})`;
		return { disk, lock, from: tpl.from, notice: `${why}; this tab's /data is a fresh disk in memory (changes are not saved)` };
	}
}

/** Download the disk's current content as a .kwsparse.gz file. */
export async function exportDataDisk(disk: CowDisk): Promise<{ name: string; blocks: number; bytes: number }> {
	const { parts, blocks } = await disk.exportParts();
	return downloadKwsparse(parts, blocks);
}

/** Download kwsparse parts (CowDisk.exportParts(), here or from the kernel worker) as a .kwsparse.gz file. */
export async function downloadKwsparse(parts: BlobPart[], blocks: number): Promise<{ name: string; blocks: number; bytes: number }> {
	const blob = await gzipBlob(parts);
	const name = `kwdata-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.kwsparse.gz`;
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 60000);
	return { name, blocks, bytes: blob.size };
}

/** Stop a running disk's saves (and wait for one in flight) before its store is replaced. */
export async function detachDataDisk(disk: CowDisk | null | undefined): Promise<void> {
	if (!disk) return;
	disk.detach();
	await disk.saving?.catch(() => {});
	await disk.store?.close?.();
}

export { importDataDisk, resetDataDisk };
