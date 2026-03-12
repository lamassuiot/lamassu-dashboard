import { getCrypto, setEngine } from "pkijs";

/**
 * Initialises the PKI.js global WebCrypto engine.
 *
 * Safe to call multiple times (idempotent) and safe in SSR contexts
 * (no-ops when `window` is not available).
 */
export function initPkijsEngine(): void {
  if (typeof window === "undefined") return;
  const engine = getCrypto();
  if (engine) setEngine("webcrypto", engine);
}
