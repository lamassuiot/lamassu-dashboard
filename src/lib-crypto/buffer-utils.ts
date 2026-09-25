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

/**
 * Encodes an ArrayBuffer as a base64 string.
 * Uses the browser's btoa — must only be called in a browser context.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCodePoint(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Wraps a base64-encoded DER blob in PEM header/footer lines.
 */
export function formatAsPem(
  base64String: string,
  type: "PUBLIC KEY" | "CERTIFICATE REQUEST" | "PRIVATE KEY" | "CERTIFICATE",
): string {
  const header = `-----BEGIN ${type}-----`;
  const footer = `-----END ${type}-----`;
  const body = base64String.match(/.{1,64}/g)?.join("\n") ?? "";
  return `${header}\n${body}\n${footer}`;
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
