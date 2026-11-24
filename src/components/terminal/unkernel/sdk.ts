// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// Adapter over the published SDK (the npm package `unkernel`, web build). It
// replaces upstream's sdk.ts, which builds the SDK from source and takes the
// page's kernel from the virtual module virtual:unkernel-kernel. Here the
// vendored files import everything from "./sdk.ts" as upstream's do, and this
// file re-exports it from "unkernel/web".
import kernelHref from "unkernel/unkernel.wasm?url";

export {
	// Values.
	BootError,
	ConsoleRouter,
	DATA_DISK_NAME,
	DEFAULT_MEMORY_FALLBACK_MIB,
	DEFAULT_WISP_SERVERS,
	Kernel,
	KernelInstance,
	NetStack,
	PtyError,
	WorkerKernel,
	autoMemoryMiB,
	bundledBoot,
	checkSupport,
	createKernel,
	decodeSnapshot,
	encodeSnapshot,
	gzipBlob,
	importDataDisk,
	loadKernelModule,
	openDataDisk,
	openDistroDisk,
	resetDataDisk,
	serveWasiPrograms,
	snapshotDiskMismatch,
	webCpuBlocker,
	wispBackend,
	// Types.
	type BlockDevice,
	type BootProgress,
	type ByteDuplex,
	type CowDisk,
	type DiskSnapshotState,
	type DiskSpec,
	type DiskState,
	type DistroDisk,
	type DownloadProgress,
	type GuestConnect,
	type HostCommandContext,
	type JitStats,
	type KernelHandle,
	type KernelSnapshot,
	type NetBackend,
	type NetSpec,
	type Pty,
} from "unkernel/web";

/**
 * The page's kernel: unkernel.wasm of the npm package, the base bundle
 * (kernel plus base initramfs), which boots the distro image given to
 * createKernel({ distro }). A hashed Vite asset in a build, resolved against
 * the page's URL (the dashboard is served from the site root).
 */
export const kernelUrl: URL = new URL(kernelHref, globalThis.location?.href ?? "http://localhost/");

/**
 * The SMP kernel of the base bundle: null, the npm package ships a single
 * unkernel.wasm without an SMP patch, so the page always boots on one CPU.
 */
export const kernelSmpUrl: URL | null = null;

/**
 * The distro images the page offers, debian first (the only one), fetched from
 * /terminal/debian.erofs. That image (debian.erofs of the pinned release
 * v0.2.0-261119-97d7945) is not in the repository: the Dockerfile downloads it
 * (checking its SHA-256); elsewhere it must be provided there, e.g. downloaded
 * into public/terminal/ before the build (its licence texts are already in
 * public/terminal/). Without it the terminal cannot boot.
 * `size` is the image's size in bytes, shown by the Options tooltip and the
 * Distro check: update it whenever the image is replaced.
 */
export const distros: { name: string; url: string; size: number; imageId?: string }[] = [
	{ name: "debian", url: "/terminal/debian.erofs", size: 72531968 },
];
