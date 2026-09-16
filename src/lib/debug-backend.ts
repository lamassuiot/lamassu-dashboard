// Developer-only switch for WHICH updates backend this browser talks to.
//
// The two backends are independent implementations and a real deployment runs exactly one of them,
// so several screens differ between them — the software module's delivery format, the distribution
// set's driver, the workflow/driver mismatch warning, where the SWU is built. Reviewing both used to
// mean redeploying against the other one.
//
// This switches the updates API's BASE URL, so with both running locally (each on its own port) the
// dashboard can be pointed at either. That is the whole mechanism: everything downstream —
// capabilities, distribution sets, modules, devices — is then the real answer from the real backend,
// and the two show their own independent data, as they should.
//
// It deliberately does NOT synthesise capabilities. It used to, and that was actively misleading:
// the faked "native" map claimed software_module_deliverables, so the module form offered a
// per-module sw-description, build switch and signing fields that native has no endpoint for —
// native builds ONE SWU on the distribution set. A real backend cannot lie about what it supports.
//
// Not a Settings page control — that page was removed once already (see src/app/settings/page.tsx).
// It lives in the user menu, gated on developer builds.

const MODE_KEY = 'ota_debug_backend_override';
const URL_KEY = 'ota_debug_backend_url';

export type DebugBackend = 'native' | 'hawkbit';

/** Where each backend runs in this repo's local dev setup: the ports cmd/monolithic binds with its
 *  default config (native) and with config-hawkbit-demo.yml (hawkbit). A starting point only — the
 *  switch lets the URL be edited, since nothing stops either running elsewhere. */
export const DEFAULT_BACKEND_URLS: Record<DebugBackend, string> = {
  native: 'http://localhost:10090',
  hawkbit: 'http://localhost:10091',
};

function isDebugBackend(value: string | null): value is DebugBackend {
  return value === 'native' || value === 'hawkbit';
}

/** The forced backend, or null to use whatever the deployment is configured with. A
 *  `?debugBackend=native|hawkbit` URL param wins on first read and is persisted, so a link can set it. */
export function getDebugBackendOverride(): DebugBackend | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('debugBackend');
    if (isDebugBackend(fromUrl)) {
      window.localStorage.setItem(MODE_KEY, fromUrl);
      return fromUrl;
    }
    const stored = window.localStorage.getItem(MODE_KEY);
    return isDebugBackend(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** The explicitly-set URL, when the default for the chosen backend was edited. */
export function getDebugBackendUrlOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(URL_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** The updates API base this browser should use, or null to leave the configured one alone. This is
 *  what api-domains consults, and therefore what every updates request follows. */
export function getDebugUpdatesBaseUrl(): string | null {
  const mode = getDebugBackendOverride();
  if (!mode) return null;
  return getDebugBackendUrlOverride() ?? DEFAULT_BACKEND_URLS[mode];
}

/** Sets or clears the override. Callers should reload afterwards — this only writes storage.
 *
 *  Clearing also strips ?debugBackend= from the address bar, because the getter reads the URL first
 *  and re-persists what it finds: without this, "clear" on a URL still carrying the param puts the
 *  override straight back on the next read. */
export function setDebugBackend(mode: DebugBackend | null, url?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (mode) {
      window.localStorage.setItem(MODE_KEY, mode);
      // Only an edited URL is stored, so a later change to the default is picked up rather than
      // pinned to whatever it was the day the switch was first used.
      if (url && url.trim() && url.trim() !== DEFAULT_BACKEND_URLS[mode]) {
        window.localStorage.setItem(URL_KEY, url.trim());
      } else {
        window.localStorage.removeItem(URL_KEY);
      }
    } else {
      window.localStorage.removeItem(MODE_KEY);
      window.localStorage.removeItem(URL_KEY);
      const current = new URL(window.location.href);
      if (current.searchParams.has('debugBackend')) {
        current.searchParams.delete('debugBackend');
        window.history.replaceState(null, '', current.toString());
      }
    }
  } catch {
    // Best-effort: a debug knob that fails to persist just means the next reload asks again.
  }
}

declare global {
  interface Window {
    otaDebug?: {
      setBackend: (mode: DebugBackend | null, url?: string | null) => void;
      getBackend: () => DebugBackend | null;
      getUrl: () => string | null;
    };
  }
}

/** Exposes window.otaDebug so the override can be flipped from devtools. Call once from the app
 *  root; safe to call more than once. */
export function installDebugBackendConsoleHelper(): void {
  if (typeof window === 'undefined') return;
  window.otaDebug = {
    setBackend: setDebugBackend,
    getBackend: getDebugBackendOverride,
    getUrl: getDebugUpdatesBaseUrl,
  };
}
