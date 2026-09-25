/**
 * Converts an IPv4 or IPv6 address string to an ArrayBuffer suitable for use
 * in an ASN.1 OctetString (e.g., inside a Subject Alternative Name extension).
 *
 * Returns null if the address cannot be parsed.
 */
export function ipToBuffer(ip: string): ArrayBuffer | null {
  const parts = ip.split(".");
  if (
    parts.length === 4 &&
    parts.every(
      (p) =>
        !Number.isNaN(Number.parseInt(p, 10)) &&
        Number.parseInt(p, 10) >= 0 &&
        Number.parseInt(p, 10) <= 255,
    )
  ) {
    return new Uint8Array(parts.map((p) => Number.parseInt(p, 10))).buffer;
  }

  if (ip.includes(":")) {
    // Basic IPv6 — requires exactly 8 groups (no :: shorthand)
    const hexGroups = ip.split(":").map((group) => group.padStart(4, "0"));
    if (hexGroups.length === 8) {
      const buffer = new Uint8Array(16);
      let offset = 0;
      for (const group of hexGroups) {
        const value = Number.parseInt(group, 16);
        buffer[offset++] = (value >> 8) & 0xff;
        buffer[offset++] = value & 0xff;
      }
      return buffer.buffer;
    }
  }

  return null;
}

/** Encodes an ArrayBuffer as a base64 string. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Chunked so large buffers (PKCS#7 bundles, OCSP responses) stay fast.
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Decodes a base64 string (whitespace allowed) into bytes. Throws on invalid base64. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64.replaceAll(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Wraps a base64-encoded DER blob in PEM header/footer lines.
 */
export function formatAsPem(
  base64String: string,
  type: "PUBLIC KEY" | "CERTIFICATE REQUEST" | "PRIVATE KEY" | "CERTIFICATE" | "OCSP REQUEST" | "OCSP RESPONSE",
): string {
  const header = `-----BEGIN ${type}-----`;
  const footer = `-----END ${type}-----`;
  const body = base64String.match(/.{1,64}/g)?.join("\n") ?? "";
  return `${header}\n${body}\n${footer}`;
}

/** Decodes the body of a PEM block of any type into its DER bytes; the inverse of formatAsPem. */
export function pemToDer(pem: string): ArrayBuffer {
  return base64ToArrayBuffer(pem.replaceAll(/-----(BEGIN|END) [^-]+-----/g, ""));
}

/**
 * Encodes PEM text as base64, the way the Lamassu API carries certificates,
 * CSRs and keys. Unicode-safe, unlike a bare btoa.
 */
export function pemToBase64(pem: string): string {
  const bytes = new TextEncoder().encode(pem);
  return arrayBufferToBase64(bytes.buffer as ArrayBuffer);
}

/** Decodes base64-encoded PEM as returned by the Lamassu API. Throws on invalid base64. */
export function base64ToPem(base64: string): string {
  return new TextDecoder().decode(base64ToArrayBuffer(base64));
}

/** Whether a string is PEM text, i.e. starts with a "-----BEGIN ...-----" line. */
export function isPem(value: string): boolean {
  return value.trim().startsWith("-----BEGIN ");
}

/**
 * Reads PEM content that may arrive base64-encoded or as plain PEM text.
 * Returns null when it is neither.
 */
export function decodePemContent(value: string): string | null {
  if (isPem(value)) return value;
  try {
    const decoded = base64ToPem(value);
    return isPem(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Strips a PEM header/footer for `type` and decodes the remaining base64
 * body to raw DER bytes. The inverse of `formatAsPem`.
 */
export function pemToArrayBuffer(
  pem: string,
  type: "PUBLIC KEY" | "CERTIFICATE REQUEST" | "PRIVATE KEY" | "CERTIFICATE",
): ArrayBuffer {
  const base64 = pem
    .replaceAll(new RegExp(`-----(BEGIN|END) ${type}-----`, "g"), "")
    .replaceAll(/\s+/g, "");
  return Uint8Array.from(window.atob(base64), (c) => c.codePointAt(0) ?? 0)
    .buffer;
}

/** Concatenates any number of byte arrays into a single fresh `Uint8Array`. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Encodes bytes as unpadded base64url (RFC 4648 §5), as used by JWK fields. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCodePoint(bytes[i]);
  }
  return window
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll(/=+$/g, "");
}

/** Decodes unpadded base64url (RFC 4648 §5), as used by JWK fields. */
export function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = window.atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.codePointAt(0) ?? 0);
}

/** Left-pads (or right-truncates from the left) `bytes` to exactly `size` bytes. */
export function padLeft(bytes: Uint8Array, size: number): Uint8Array {
  if (bytes.length === size) return bytes;
  if (bytes.length > size) return bytes.slice(bytes.length - size);
  const out = new Uint8Array(size);
  out.set(bytes, size - bytes.length);
  return out;
}

/**
 * Narrows `bytes` to a WebCrypto `BufferSource`. Bytes backed by a plain
 * ArrayBuffer are returned as-is; anything else (e.g. a SharedArrayBuffer view)
 * is copied.
 */
export function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
}
