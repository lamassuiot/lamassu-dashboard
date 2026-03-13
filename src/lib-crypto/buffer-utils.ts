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
