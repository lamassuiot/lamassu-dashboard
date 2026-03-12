/**
 * CSR parsing utilities.
 *
 * Implementation delegated to @/lib-crypto — this module is kept for
 * backwards-compatible imports from other parts of the application.
 */

export type { DecodedCsrInfo } from "@/lib-crypto";
export { parseCsr } from "@/lib-crypto";
