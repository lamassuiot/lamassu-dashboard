import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KW_BUILD } from "./build.ts";
import * as sdk from "./sdk.ts";

const runtimeNames = [
	"createKernel",
	"KernelInstance",
	"WorkerKernel",
	"BootError",
	"ConsoleRouter",
	"bundledBoot",
	"loadKernelModule",
	"openDistroDisk",
	"serveWasiPrograms",
	"snapshotDiskMismatch",
	"decodeSnapshot",
	"encodeSnapshot",
	"PtyError",
	"gzipBlob",
	"NetStack",
	"wispBackend",
	"DEFAULT_WISP_SERVERS",
	"autoMemoryMiB",
	"DEFAULT_MEMORY_FALLBACK_MIB",
	"webCpuBlocker",
	"DATA_DISK_NAME",
	"importDataDisk",
	"openDataDisk",
	"resetDataDisk",
	"checkSupport",
	"Kernel",
	"kernelUrl",
	"kernelSmpUrl",
	"distros",
] as const;

describe("unkernel sdk adapter", () => {
	it.each(runtimeNames)("exports %s", (name) => {
		expect(typeof (sdk as Record<string, unknown>)[name]).not.toBe("undefined");
	});

	it("has no SMP kernel (the npm package ships a single unkernel.wasm)", () => {
		expect(sdk.kernelSmpUrl).toBeNull();
	});

	it("offers only the debian distro", () => {
		expect(sdk.distros.map((d) => d.name)).toEqual(["debian"]);
		expect(sdk.distros[0].url).toBe("/terminal/debian.erofs");
	});

	// The image is not in the repository (it is provided at build or deploy time): checked only where present.
	const image = join(process.cwd(), "public/terminal/debian.erofs");
	it.skipIf(!existsSync(image))("gives the debian image's real size (update sdk.ts when the image changes)", () => {
		expect(sdk.distros[0].size).toBe(statSync(image).size);
	});

	it("names the Linux release of the packaged kernel in About (update build.ts with the package)", () => {
		const wasm = readFileSync(join(process.cwd(), "node_modules/unkernel/dist/unkernel.wasm")).toString("latin1");
		expect(wasm).toContain(`Linux version ${KW_BUILD.linux}`);
	});
});
