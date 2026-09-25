export async function getSubtleCrypto(): Promise<SubtleCrypto> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("composite: WebCrypto SubtleCrypto is not available in this environment");
  }
  return subtle;
}
