// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
// The shell's entry, in place of upstream's page entry (web/src/main.tsx):
// read the configuration (config.ts), set up the chrome (ui.ts and its React
// components), run the feature preflight with the SDK's checkSupport(), and
// only then start the boot (boot.ts). A browser without JSPI gets the panel
// with the reason and a hint, without downloading the kernel.
//
// Dashboard port: upstream owns the page for its whole lifetime. Here
// mountUnkernel() runs the same flow inside `root` and returns a session
// whose stop() undoes it (boot.ts stop(), then React), so the dock can close
// and open the shell again. Where upstream reloads the page (Reboot, Resume,
// a data disk import or reset), the session starts the shell again in the
// same root (KW.reload). The page URL is neither read nor written: the
// dashboard's own URL must not set shell settings (a link with ?wisp= would
// route the guest's traffic through another proxy, ?append= would change the
// kernel command line), so upstream's URL settings and its ?simulate= test
// hook are unavailable here; settings come from Options (kw.settings) and
// the operator's default.
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { start, type Boot } from './boot.ts';
import { App } from './components/App.tsx';
import { loadSettings, readConfig } from './config.ts';
import { createKW, type KWGlobal } from './kw.ts';
import { checkSupport, type KernelHandle } from './sdk.ts';
import { ui$, type Store, type UiState } from './store.ts';
import { browser, createUi, type Ui } from './ui.ts';

export interface UnkernelSession {
  /**
   * Abort a boot in progress, sync and stop the kernel, close every terminal
   * window, let go of the data disk (and its lock), unmount the UI and remove
   * every listener the shell added. A pending sendScript() rejects.
   */
  stop(): Promise<void>;
  /**
   * Once the system runs, write `script` to /tmp/est-enroll.XXXXXX/enroll.sh in
   * the guest (umask 077; it is not run) and resolve with the command that runs
   * it. A newer call replaces a pending one, which rejects with an AbortError.
   */
  sendScript(script: string): Promise<{ command: string }>;
  /** Give the keyboard focus to the current terminal window. */
  focus(): void;
}

export interface UnkernelOptions {
  /** The operator's Wisp server(s) (LAMASSU_TERMINAL_WISP_URL): the default `wisp` setting. */
  wisp?: string;
}

/** Why sendScript() failed (the guest could not prepare the file, or the system cannot run). */
const PREPARE_FAILED = 'Unable to prepare the enrollment script.';

/** Writes stdin to a fresh private directory and prints that directory: the script is only prepared, never run. */
const TRANSFER_SH = 'umask 077\ndir=$(mktemp -d /tmp/est-enroll.XXXXXX)\ncat > "$dir/enroll.sh"\nprintf "%s" "$dir"';
const ENROLL_DIR = /^\/tmp\/est-enroll\.[a-zA-Z0-9]+$/;

const abortError = (msg: string) => new DOMException(msg, 'AbortError');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One run of the shell: config, UI, preflight and boot, until stop(). */
interface Instance {
  kw: KWGlobal;
  store: Store<UiState>;
  stop(): Promise<void>;
}

function mountInstance(
  root: HTMLElement,
  { saved, defaults }: { saved: Record<string, string>; defaults: { wisp?: string } },
  reload: NonNullable<KWGlobal['reload']>,
): Instance {
  // Never the page URL (see the top of this file): an empty query.
  const cfg = readConfig('', saved, defaults);
  const kw = createKW(cfg);
  kw.reload = reload;
  const ui = createUi(cfg);
  kw.ui = ui;
  const store = ui$();
  const react = createRoot(root);
  // Rendered at once, so boot.ts finds the terminal's element.
  flushSync(() => react.render(<App root={root} />));

  let stopped = false;
  let boot: Boot | null = null;
  // Errors that happened before the UI existed.
  for (const e of kw.errors.slice()) ui.onError(e);
  if (ui.state() !== 'error') {
    preflight(kw, ui).then(
      (ok) => {
        if (!ok || stopped) return;
        ui.splash('Loading', 'Boot script…');
        try {
          boot = start(root);
        } catch (e) {
          const err = e as Error;
          ui.fail('resource', `The boot module failed to start: ${err.message}`, err.stack, { title: 'The terminal failed to start' });
        }
      },
      (e: Error) => {
        if (!stopped) ui.fail('preflight', `Feature check crashed: ${e.message}`, e.stack);
      },
    );
  }

  let stopping: Promise<void> | null = null;
  return {
    kw,
    store,
    stop: () =>
      (stopping ??= (async () => {
        stopped = true;
        await boot?.stop();
        await Promise.resolve(); // never unmount inside the caller's React commit
        react.unmount();
      })()),
  };
}

/** Upstream's preflight (main.tsx): the environment checks, then WebAssembly, BigInt and JSPI. */
async function preflight(kw: KWGlobal, ui: Ui): Promise<boolean> {
  const cfg = kw.config;
  ui.stage('preflight', 'active');
  ui.splash('Checking browser', 'Testing WebAssembly features…');
  let fatalFail: { title: string; why: string } | null = null;
  const need = (id: string, label: string, ok: boolean, why: string, title: string) => {
    ui.check(id, label, ok ? 'pass' : 'fail', ok ? 'yes' : 'no', ok ? '' : why);
    if (!ok && !fatalFail) fatalFail = { title, why };
  };
  const B = browser();
  ui.check('browser', 'Browser', 'info', B.name + (B.v ? ` ${B.v}` : '') + (cfg.mobileUA ? ' (mobile)' : ''));
  ui.check('secure', 'Secure context', isSecureContext ? 'pass' : 'info', isSecureContext ? 'yes' : `no (${location.protocol}//${location.hostname})`,
    isSecureContext ? '' : 'not required: plain http on a LAN address is fine; only the clipboard and device-memory APIs are hidden');
  ui.check('coi', 'Cross-origin isolated', 'info', crossOriginIsolated ? 'yes' : 'no',
    'not required; with ?worker=1 it lets input and frames cross through shared memory instead of messages, and several CPUs (?cpus=) need it');
  const devMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  ui.check('devmem', 'Device memory', 'info', devMem ? `${devMem} GB` : 'unknown', devMem ? '' : isSecureContext ? 'API not supported' : 'hidden on insecure origins');
  ui.check('mem', 'Kernel memory', 'info', `${cfg.memMiB} MiB requested`, cfg.memWhy);
  ui.check('cpu', 'CPU threads', 'info', String(navigator.hardwareConcurrency || 'unknown'));
  // Several guest CPUs (?cpus=N, config.ts): what this load boots with, and why not more.
  ui.check('smp', 'Guest CPUs', cfg.smpParam < 2 ? 'info' : cfg.cpus > 1 ? 'pass' : 'warn',
    cfg.cpus > 1 ? `${cfg.cpus} (?cpus=${cfg.smpParam})` : cfg.smpParam > 1 ? `1 (asked for ${cfg.smpParam})` : '1',
    cfg.smpWhy ?? (cfg.cpus > 1 ? 'the SMP kernel, each CPU in a Web Worker on one shared memory'
      : cfg.smpBlocked ? `several CPUs are unavailable: ${cfg.smpBlocked}` : 'Options, CPUs, boots the SMP kernel on several'));
  ui.check('input', 'Input', 'info', (cfg.coarse ? 'touch' : 'mouse/keyboard') + (navigator.maxTouchPoints ? `, ${navigator.maxTouchPoints} touch points` : ''));
  ui.check('viewport', 'Viewport', 'info', `${innerWidth}×${innerHeight} @${devicePixelRatio || 1}x`);
  ui.check('clipboard', 'Clipboard API', navigator.clipboard ? 'pass' : 'info', navigator.clipboard ? 'yes' : 'no', navigator.clipboard ? '' : 'copy/paste use a manual fallback');
  const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string; bitness?: string }> } }).userAgentData;
  uad?.getHighEntropyValues(['bitness', 'architecture']).then((v) => {
    ui.check('arch', 'Architecture', 'info', `${v.architecture || '?'} ${v.bitness ? `${v.bitness}-bit` : ''}`);
  }, () => {});
  ui.check('ua', 'User agent', 'info', '', navigator.userAgent);

  const s = await checkSupport();
  if (cfg.simulate.includes('nojspi')) {
    s.jspi = false;
    s.problems = ['simulated failure (?simulate=nojspi): WebAssembly.Suspending is not defined (no JSPI)'];
  }
  need('wasm', 'WebAssembly', s.wasm, 'WebAssembly is unavailable (disabled by policy or a very old browser)', 'WebAssembly unavailable');
  need('bigint', 'BigInt', s.bigint, 'BigInt is required for 64-bit WebAssembly values', 'Browser too old');
  need('jspi', 'JSPI', s.jspi, s.problems.find((p) => /JSPI/.test(p)) ?? s.problems.join('; '), 'No JSPI (WebAssembly stack switching)');
  const f = fatalFail as { title: string; why: string } | null;
  if (f) {
    ui.stage('preflight', 'fail', f.why);
    ui.fail('preflight', f.why, '', { title: f.title });
    return false;
  }
  ui.stage('preflight', 'done', 'JSPI, BigInt');
  return true;
}

/**
 * Sessions still stopping. A new mount waits for them: the data disk's lock must be free
 * (else the new boot gets an unsaved copy) and KW (kw.ts) is one per page.
 */
const stopsInFlight = new Set<Promise<void>>();

/**
 * Run the unkernel shell inside `root` (an empty element the caller sizes); see
 * UnkernelSession. Resolves once the UI is up (the boot goes on); waits first for a
 * session that is still stopping, so closing and reopening at once is safe.
 */
export async function mountUnkernel(root: HTMLElement, opts: UnkernelOptions = {}): Promise<UnkernelSession> {
  while (stopsInFlight.size) await Promise.allSettled(stopsInFlight);
  const defaults = { wisp: opts.wisp };
  let closed = false;
  let restarting: Promise<void> | null = null;
  let stopping: Promise<void> | null = null;
  /** Called when `current` is replaced (a restart). */
  const swapped = new Set<() => void>();

  const reload = (settings?: Record<string, string>) => {
    if (closed || restarting) return;
    restarting = (async () => {
      await sleep(0); // out of the click (Reboot, Resume) that asked, before its UI goes away
      await current.stop();
      if (closed) return;
      current = mountInstance(root, { saved: settings ?? loadSettings(), defaults }, reload);
    })().finally(() => {
      restarting = null;
      for (const fn of [...swapped]) fn();
    });
  };

  let current = mountInstance(root, { saved: loadSettings(), defaults }, reload);

  /** This session's KW once the system runs; rejects if the boot fails, or with an AbortError. */
  const whenRunning = (signal: AbortSignal) =>
    new Promise<KWGlobal>((resolve, reject) => {
      let unsubscribe = () => {};
      const done = () => {
        unsubscribe();
        swapped.delete(watch);
        signal.removeEventListener('abort', check);
      };
      function check() {
        if (signal.aborted) {
          done();
          reject(signal.reason instanceof Error ? signal.reason : abortError('The script was not sent.'));
          return;
        }
        if (restarting) return; // the next run decides
        const state = current.store.get().state;
        if (state === 'running') {
          done();
          resolve(current.kw);
        } else if (state === 'error') {
          done();
          reject(new Error(PREPARE_FAILED));
        }
        // Halted (powered off, suspended): Reboot or Resume start a run that gets the script.
      }
      function watch() {
        unsubscribe();
        unsubscribe = current.store.subscribe(check);
        check();
      }
      swapped.add(watch);
      signal.addEventListener('abort', check);
      watch();
    });

  const deliver = async (script: string, signal: AbortSignal): Promise<{ command: string }> => {
    const kw = await whenRunning(signal);
    let vm: KernelHandle;
    let result: { exitCode: number | null; stdout: string; stderr: string };
    try {
      vm = await kw.ready!();
      result = await vm.exec('/bin/sh', ['-ec', TRANSFER_SH], { input: script, signal });
    } catch (error) {
      if (signal.aborted) throw abortError('The script was not sent.');
      kw.report('est', PREPARE_FAILED, error instanceof Error ? error.message : String(error), false);
      throw new Error(PREPARE_FAILED);
    }
    if (result.exitCode !== 0 || !ENROLL_DIR.test(result.stdout)) {
      kw.report('est', PREPARE_FAILED, result.stderr || `Unexpected exit code or output (${result.exitCode})`, false);
      throw new Error(PREPARE_FAILED);
    }
    return { command: `cd ${result.stdout} && sh ./enroll.sh` };
  };

  let pending: { abort: AbortController; reject: (e: unknown) => void } | null = null;
  const cancelPending = (why: string) => {
    const p = pending;
    pending = null;
    if (!p) return;
    const e = abortError(why);
    p.reject(e);
    p.abort.abort(e);
  };

  return {
    stop() {
      if (stopping) return stopping;
      closed = true;
      cancelPending('The terminal was closed.');
      // Synchronously when no restart runs, so the boot is aborted at once.
      const p = restarting ? restarting.then(() => current.stop()) : current.stop();
      stopping = p.finally(() => stopsInFlight.delete(stopping!));
      stopsInFlight.add(stopping);
      return stopping;
    },
    sendScript(script) {
      cancelPending('Replaced by a newer script.');
      if (closed) return Promise.reject(abortError('The terminal was closed.'));
      const abort = new AbortController();
      return new Promise((resolve, reject) => {
        const mine = { abort, reject };
        pending = mine;
        deliver(script, abort.signal).then(resolve, reject).finally(() => {
          if (pending === mine) pending = null;
        });
      });
    },
    focus() {
      current.kw.term?.focus();
    },
  };
}
