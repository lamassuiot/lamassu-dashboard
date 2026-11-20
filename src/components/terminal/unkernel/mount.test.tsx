import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SDK is faked: no wasm, no network. createKernel resolves when the test says so
// (`boots`), and the fake kernel reaches "running" when the test feeds its console.
const fake = vi.hoisted(() => {
  type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
  const deferred = <T,>(): Deferred<T> => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  const support = {
    value: { ok: true, wasm: true, bigint: true, jspi: true, memory64: false, problems: [] as string[] },
  };
  interface Boot {
    opts: Record<string, unknown> & { onOutput: (b: Uint8Array) => void; signal?: AbortSignal };
    result: Deferred<unknown>;
    /** The kernel createKernel() resolved with, once it did. */
    kernel?: ReturnType<typeof makeKernel>;
  }
  const boots: Boot[] = [];
  const execResult = { value: { exitCode: 0, stdout: "/tmp/est-enroll.AbC123", stderr: "", signal: null } };
  function makeKernel() {
    const exited = deferred<{ kind: string; reason?: string }>();
    let halted = false;
    /** What happened to the kernel, in order: "sync" (a flush that worked), "sync-after-stop", "stop", "abort-stop". */
    const events: string[] = [];
    const halt = (why: string) => {
      events.push(why);
      if (halted) return;
      halted = true;
      exited.resolve({ kind: "stopped", reason: why });
    };
    const kernel = {
      events,
      /** As the SDK on abort: stopped at once, no clean shutdown (not the `stop` spy, which counts the shell's calls). */
      abortStop: () => halt("abort-stop"),
      cmdline: "",
      distro: undefined,
      vsock: undefined,
      exited: exited.promise,
      write: vi.fn(),
      resize: vi.fn(),
      sync: vi.fn(async () => {
        events.push(halted ? "sync-after-stop" : "sync");
        return !halted;
      }),
      stop: vi.fn(async () => {
        halt("stop");
        return { kind: "stopped", reason: "stop()" };
      }),
      snapshot: vi.fn(),
      stats: () => ({ cpus: 1, jit: { enabled: false, requested: false, compiled: 0, collected: -1 } }),
      exec: vi.fn(async (_file: string, args: string[] = [], opts?: { input?: string }) => {
        if (args.some((a) => a.includes("/run/kw-base"))) return { exitCode: 0, stdout: "name=debian\n", stderr: "", signal: null };
        void opts;
        return execResult.value;
      }),
    };
    return kernel;
  }
  // Web Locks with ifAvailable, as navigator.locks: the lock is held until the callback's promise settles.
  const held = new Set<string>();
  const locks = {
    request: (name: string, _opts: unknown, cb: (lock: unknown) => unknown) => {
      if (held.has(name)) return Promise.resolve(cb(null));
      held.add(name);
      return Promise.resolve(cb({ name })).finally(() => held.delete(name));
    },
  };
  const disks: Array<{ detach: ReturnType<typeof vi.fn>; closed: boolean }> = [];
  return { deferred, support, boots, execResult, makeKernel, held, locks, disks };
});

vi.mock("./sdk.ts", () => {
  class BootError extends Error {
    stage: string;
    constructor(stage: string, message: string) {
      super(message);
      this.stage = stage;
    }
  }
  class PtyError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  class ConsoleRouter {
    #opts: { onUserOutput(t: string): void; onUserspace(why: string): void };
    #up = false;
    constructor(opts: { onUserOutput(t: string): void; onUserspace(why: string): void }) {
      this.#opts = opts;
    }
    write(bytes: Uint8Array) {
      this.#opts.onUserOutput(new TextDecoder().decode(bytes));
      if (!this.#up) {
        this.#up = true;
        this.#opts.onUserspace("prompt");
      }
    }
  }
  class KernelInstance {}
  class WorkerKernel {}
  return {
    BootError,
    PtyError,
    ConsoleRouter,
    KernelInstance,
    WorkerKernel,
    DATA_DISK_NAME: "kwdata",
    DEFAULT_MEMORY_FALLBACK_MIB: [256, 128],
    DEFAULT_WISP_SERVERS: ["wss://wisp.default/"],
    NetStack: class {},
    wispBackend: vi.fn(() => ({})),
    autoMemoryMiB: () => ({ mib: 256, why: "test" }),
    webCpuBlocker: () => "no workers in tests",
    checkSupport: vi.fn(async () => ({ ...fake.support.value, problems: [...fake.support.value.problems] })),
    loadKernelModule: vi.fn(async () => new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))),
    bundledBoot: () => ({ initrd: new Uint8Array(16), datadisk: new Uint8Array(16), cmdline: "console=hvc0 rdinit=/init" }),
    openDistroDisk: vi.fn(async () => ({ info: { fs: "erofs", size: 1048576, label: "debian", uuid: "u" }, inner: {} })),
    openDataDisk: vi.fn(async (o: { mode?: string }) => {
      const disk = {
        size: 1 << 26,
        seeded: false,
        stored: new Set<number>(),
        overlayBlocks: 0,
        persistent: o.mode !== "snapshot",
        notice: o.mode === "snapshot" ? "a snapshot in memory" : undefined,
        store: { name: "kwdisk:kwdata-v1", close: vi.fn(async () => {}) },
        saving: undefined,
        closed: false,
        detach: vi.fn(() => {
          disk.closed = true;
        }),
      };
      fake.disks.push(disk);
      return disk;
    }),
    importDataDisk: vi.fn(),
    resetDataDisk: vi.fn(),
    gzipBlob: vi.fn(),
    serveWasiPrograms: vi.fn(() => ({ close: vi.fn() })),
    snapshotDiskMismatch: () => null,
    decodeSnapshot: vi.fn(),
    encodeSnapshot: vi.fn(),
    createKernel: vi.fn((opts: Record<string, unknown> & { onOutput: (b: Uint8Array) => void; signal?: AbortSignal }) => {
      const result = fake.deferred<unknown>();
      const boot: (typeof fake.boots)[number] = { opts, result };
      fake.boots.push(boot);
      const resolve = result.resolve;
      result.resolve = (k) => {
        boot.kernel ??= k as typeof boot.kernel;
        resolve(k);
      };
      // As the SDK: an abort stops a kernel that booted (at once: inline, instance.stop() from the abort
      // listener), else fails the boot, unless the kernel comes up just before (a test resolves it first).
      opts.signal?.addEventListener("abort", () => {
        if (boot.kernel) boot.kernel.abortStop();
        else setTimeout(() => result.reject(new DOMException("aborted", "AbortError")), 0);
      });
      return result.promise;
    }),
    kernelUrl: new URL("http://localhost/assets/unkernel.wasm"),
    kernelSmpUrl: null,
    distros: [{ name: "debian", url: "/terminal/debian.erofs", size: 72531968 }],
  };
});

vi.mock("@wterm/dom", () => {
  class WTerm {
    element: HTMLElement;
    cols = 80;
    rows = 24;
    bridge = undefined;
    constructor(el: HTMLElement) {
      this.element = el;
    }
    init = vi.fn(async () => {});
    write = vi.fn();
    focus = vi.fn();
    destroy = vi.fn();
    setRenderingPaused = vi.fn();
  }
  return { WTerm };
});

import * as sdk from "./sdk.ts";
import { openAbout } from "./components/About.tsx";
import { KW } from "./kw.ts";
import { mountUnkernel, type UnkernelSession } from "./mount.tsx";
import { ui$ } from "./store.ts";

const createKernel = vi.mocked(sdk.createKernel);
const loadKernelModule = vi.mocked(sdk.loadKernelModule);
const openDataDisk = vi.mocked(sdk.openDataDisk);

type Target = Window | Document;
type Call = [Target, string, EventListenerOrEventListenerObject, boolean];
const capture = (o?: boolean | AddEventListenerOptions) => (typeof o === "boolean" ? o : !!o?.capture);

/** Spy on add/removeEventListener of window and document; `live()` lists what was added and not removed. */
function spyListeners() {
  const added: Call[] = [];
  const removed: Call[] = [];
  for (const target of [window, document] as Target[]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation((type, fn, o) => {
      if (fn) added.push([target, type, fn, capture(o)]);
      add(type, fn, o);
    });
    vi.spyOn(target, "removeEventListener").mockImplementation((type, fn, o) => {
      if (fn) removed.push([target, type, fn, capture(o)]);
      remove(type, fn, o);
    });
  }
  return {
    added,
    live: () => added.filter(([t, type, fn, c]) => !removed.some(([t2, type2, fn2, c2]) => t === t2 && type === type2 && fn === fn2 && c === c2)),
  };
}

const encode = (s: string) => new TextEncoder().encode(s);

describe("mountUnkernel", () => {
  let roots: HTMLElement[] = [];
  let sessions: UnkernelSession[] = [];
  const newRoot = () => {
    const el = document.createElement("div");
    document.body.append(el);
    roots.push(el);
    return el;
  };
  const mount = async (root = newRoot()) => {
    const s = await mountUnkernel(root, { wisp: "wss://operator.example/" });
    sessions.push(s);
    return s;
  };
  /** Boot the latest createKernel() call to a running kernel. */
  const bootToRunning = async (i = fake.boots.length - 1) => {
    const kernel = fake.makeKernel();
    fake.boots[i]!.result.resolve(kernel);
    await vi.waitFor(() => expect(kernel.stats).toBeDefined());
    // Let boot() take the handle, then feed the console: the fake router reports user space.
    await new Promise((r) => setTimeout(r, 0));
    fake.boots[i]!.opts.onOutput(encode("root@unkernel:~# "));
    await vi.waitFor(() => expect(ui$().get().state).toBe("running"));
    return kernel;
  };

  beforeEach(() => {
    vi.stubGlobal("crossOriginIsolated", false);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("indexedDB", {});
    Object.defineProperty(navigator, "locks", { value: fake.locks, configurable: true });
    fake.support.value = { ok: true, wasm: true, bigint: true, jspi: true, memory64: false, problems: [] };
    fake.boots.length = 0;
    fake.disks.length = 0;
    fake.held.clear();
    fake.execResult.value = { exitCode: 0, stdout: "/tmp/est-enroll.AbC123", stderr: "", signal: null };
    vi.clearAllMocks();
  });

  afterEach(async () => {
    for (const s of sessions) await s.stop();
    sessions = [];
    for (const r of roots) r.remove();
    roots = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "locks");
  });

  it("stop() during boot aborts it, stops the kernel once and frees the data disk for the next mount", async () => {
    const first = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    expect(openDataDisk).toHaveBeenLastCalledWith(expect.not.objectContaining({ mode: "snapshot" }));
    expect(fake.held.size).toBe(1);

    const boot = fake.boots[0]!;
    const stopping = first.stop();
    expect(boot.opts.signal?.aborted).toBe(true);
    // The kernel finishes booting just after the dock closed: it must still be stopped.
    const kernel = fake.makeKernel();
    boot.result.resolve(kernel);
    await stopping;
    expect(kernel.stop).toHaveBeenCalledTimes(1);
    expect(fake.disks[0]!.detach).toHaveBeenCalled();
    expect(fake.held.size).toBe(0);
    expect(ui$().get().state).not.toBe("error");

    await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(2));
    expect(openDataDisk).toHaveBeenCalledTimes(2);
    expect(openDataDisk).toHaveBeenLastCalledWith(expect.not.objectContaining({ mode: "snapshot" }));
    await bootToRunning();
  });

  it("a mount right after an unawaited stop() waits for it and gets the persistent data disk", async () => {
    const root = newRoot();
    const first = await mount(root);
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    const kernel = fake.makeKernel();
    void first.stop();
    fake.boots[0]!.result.resolve(kernel);
    await mount(root);
    expect(kernel.stop).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(2));
    expect(openDataDisk).toHaveBeenLastCalledWith(expect.not.objectContaining({ mode: "snapshot" }));
  });

  it("closing while running syncs the guest before anything stops the kernel", async () => {
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    const kernel = await bootToRunning();
    await s.stop();
    expect(kernel.events[0]).toBe("sync");
    expect(kernel.events).not.toContain("sync-after-stop");
    expect(kernel.events.some((e) => e === "stop" || e === "abort-stop")).toBe(true);
    expect(fake.held.size).toBe(0);
  });

  it("keeps the data disk persistent after a reset when this run had no data disk lock", async () => {
    // This run boots without a data disk (?data=0), so it holds no lock; Reset takes one, then restarts.
    localStorage.setItem("kw.settings", JSON.stringify({ data: "0" }));
    await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    await bootToRunning();
    expect(openDataDisk).not.toHaveBeenCalled();
    localStorage.setItem("kw.settings", "{}");
    await KW.resetData!();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(2));
    expect(openDataDisk).toHaveBeenCalledTimes(1);
    expect(openDataDisk).toHaveBeenLastCalledWith(expect.not.objectContaining({ mode: "snapshot" }));
    await bootToRunning(1);
  });

  it("stop() returns when createKernel rejects on abort", async () => {
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    const boot = fake.boots[0]!;
    boot.opts.signal?.addEventListener("abort", () => boot.result.reject(new DOMException("aborted", "AbortError")));
    await s.stop();
    expect(fake.held.size).toBe(0);
    expect(ui$().get().state).not.toBe("error");
  });

  it("removes every window and document listener it added once stopped", async () => {
    const spy = spyListeners();
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    await bootToRunning();
    const types = new Set(spy.added.map(([, type]) => type));
    expect(types).toContain("keydown");
    expect(types).toContain("visibilitychange");
    expect(types).toContain("pagehide");
    await s.stop();
    expect(spy.live().map(([t, type]) => `${t === window ? "window" : "document"}:${type}`)).toEqual([]);
  });

  it("shows why a browser without JSPI cannot boot and never downloads the kernel", async () => {
    fake.support.value = {
      ok: false, wasm: true, bigint: true, jspi: false, memory64: false,
      problems: ["WebAssembly.Suspending is not defined (no JSPI)"],
    };
    const root = newRoot();
    await mount(root);
    await vi.waitFor(() => expect(ui$().get().state).toBe("error"));
    expect(root.textContent).toContain("WebAssembly.Suspending is not defined (no JSPI)");
    expect(createKernel).not.toHaveBeenCalled();
    expect(loadKernelModule).not.toHaveBeenCalled();
  });

  it("About, opened with show(), gives the focus back on Esc (not left on its hidden Close button)", async () => {
    const root = newRoot();
    await mount(root);
    const status = await vi.waitFor(() => {
      const el = root.querySelector<HTMLButtonElement>("#status");
      expect(el).not.toBeNull();
      return el!;
    });
    status.focus();
    openAbout();
    const about = root.querySelector<HTMLDialogElement>("#about")!;
    expect(about.open).toBe(true);
    expect(document.activeElement?.id).toBe("about-close");
    about.querySelector("#about-close")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(about.open).toBe(false));
    await vi.waitFor(() => expect(document.activeElement).toBe(status));
  });

  it("delivers a script sent while booting once the kernel runs", async () => {
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    let done = false;
    const sent = s.sendScript("echo enroll").then((r) => {
      done = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    const kernel = await bootToRunning();
    await expect(sent).resolves.toEqual({ command: "cd /tmp/est-enroll.AbC123 && sh ./enroll.sh" });
    const scripted = kernel.exec.mock.calls.filter(([, , o]) => o?.input !== undefined);
    expect(scripted).toHaveLength(1);
    expect(scripted[0]![0]).toBe("/bin/sh");
    expect(scripted[0]![1]?.[1]).toContain("umask 077");
    expect(scripted[0]![1]?.[1]).toContain("mktemp -d /tmp/est-enroll.XXXXXX");
    expect(scripted[0]![2]?.input).toBe("echo enroll");
  });

  it("replaces a pending script with a newer one: only the second runs", async () => {
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    const first = s.sendScript("echo first");
    const second = s.sendScript("echo second");
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const kernel = await bootToRunning();
    await expect(second).resolves.toEqual({ command: "cd /tmp/est-enroll.AbC123 && sh ./enroll.sh" });
    const inputs = kernel.exec.mock.calls.map(([, , o]) => o?.input).filter((i) => i !== undefined);
    expect(inputs).toEqual(["echo second"]);
  });

  it("reboots in place with the saved options, without touching the page URL", async () => {
    const href = location.href;
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    const first = await bootToRunning();
    ui$().set((st) => ({ options: { ...st.options, mem: "128" } }));
    KW.ui!.reboot();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(2));
    expect(first.sync).toHaveBeenCalled();
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(fake.boots[1]!.opts.memoryMiB).toBe(128);
    expect(JSON.parse(localStorage.getItem("kw.settings") ?? "{}")).toMatchObject({ mem: "128" });
    expect(location.href).toBe(href);
    // A script sent during the restart reaches the new kernel.
    const sent = s.sendScript("echo after reboot");
    const second = await bootToRunning(1);
    await expect(sent).resolves.toEqual({ command: "cd /tmp/est-enroll.AbC123 && sh ./enroll.sh" });
    expect(second.exec.mock.calls.map(([, , o]) => o?.input).filter((i) => i !== undefined)).toEqual(["echo after reboot"]);
  });

  it("never takes shell settings from the dashboard's URL, nor saves them on Reboot", async () => {
    const before = location.pathname + location.search;
    history.replaceState(null, "", "/ra/x?wisp=wss://evil.example/&append=x&distro=none&mem=64");
    try {
      await mount();
      await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
      expect(KW.config.wisp).toEqual(["wss://operator.example/"]);
      expect(KW.config.append).toBeNull();
      expect(KW.config.distro?.name).toBe("debian");
      expect(KW.config.settings).toEqual({});
      const opts = fake.boots[0]!.opts;
      expect(opts.cmdline).not.toContain("x");
      expect(opts.memoryMiB).toBe(256);
      await bootToRunning();
      KW.ui!.reboot();
      await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(2));
      expect(localStorage.getItem("kw.settings")).toBeNull();
      expect(KW.config.wisp).toEqual(["wss://operator.example/"]);
    } finally {
      history.replaceState(null, "", before);
    }
  });

  it("lets go of the kernel once stopped (KW keeps no handle), and a reopen still boots", async () => {
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    const kernel = await bootToRunning();
    expect(KW.vm).toBe(kernel);
    const kw = KW;
    await s.stop();
    expect(kw.vm).toBeUndefined();
    expect(kw.kernel).toBeUndefined();
    expect(Object.values(kw)).not.toContain(kernel);
    for (const k of ["term", "ready", "windows", "sync", "jitStats", "suspend"]) expect(kw[k]).toBeUndefined();
    await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(2));
    await bootToRunning();
  });

  it("says plainly that the distro image is missing when the server answers with something else", async () => {
    vi.mocked(sdk.openDistroDisk).mockRejectedValueOnce(new Error("http://localhost/terminal/debian.erofs is neither an erofs nor an ext4 image"));
    const root = newRoot();
    await mount(root);
    await vi.waitFor(() => expect(ui$().get().state).toBe("error"));
    expect(root.textContent).toContain("No distro image at /terminal/debian.erofs");
    expect(ui$().get().errors.at(-1)?.hint).toContain("does not bundle the image");
    expect(createKernel).not.toHaveBeenCalled();
  });

  it("rejects on a bad exit code or a directory outside /tmp/est-enroll.*", async () => {
    const s = await mount();
    await vi.waitFor(() => expect(createKernel).toHaveBeenCalledTimes(1));
    await bootToRunning();
    fake.execResult.value = { exitCode: 1, stdout: "/tmp/est-enroll.AbC123", stderr: "", signal: null };
    await expect(s.sendScript("echo a")).rejects.toThrow("Unable to prepare the enrollment script.");
    fake.execResult.value = { exitCode: 0, stdout: "/tmp/elsewhere", stderr: "", signal: null };
    await expect(s.sendScript("echo b")).rejects.toThrow("Unable to prepare the enrollment script.");
    fake.execResult.value = { exitCode: 0, stdout: "/tmp/est-enroll.AbC123\n; rm -rf /", stderr: "", signal: null };
    await expect(s.sendScript("echo c")).rejects.toThrow("Unable to prepare the enrollment script.");
  });
});
