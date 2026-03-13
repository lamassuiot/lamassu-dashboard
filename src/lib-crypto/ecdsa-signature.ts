import * as asn1js from "asn1js";
import { KNOWN_ECDSA_RAW_SIG_LENGTHS } from "./constants";

export interface EcdsaDerConversionResult {
  /** The DER-encoded ECDSA signature as an ArrayBuffer. */
  der: ArrayBuffer;
  /** Whether the input was already in DER format or was raw r||s. */
  format: "der" | "raw";
}

/**
 * Returns true only if `data` is a structurally valid DER SEQUENCE containing
 * exactly two INTEGER values that together consume the entire buffer.
 *
 * This is a strict check — it intentionally rejects inputs where the first
 * byte is 0x30 but the structure is not a well-formed ECDSA signature, which
 * avoids misclassifying raw r||s signatures whose first byte happens to be
 * 0x30.
 */
function isValidEcdsaDer(data: Uint8Array): boolean {
  // Work on a clean copy to avoid byteOffset aliasing issues
  const buf = new Uint8Array(data).buffer;
  const asn1 = asn1js.fromBER(buf);
  // offset must equal data.length — the whole buffer must be consumed
  if (asn1.offset === -1 || asn1.offset !== data.length) return false;
  if (!(asn1.result instanceof asn1js.Sequence)) return false;
  const values = (asn1.result as asn1js.Sequence).valueBlock.value;
  return (
    Array.isArray(values) &&
    values.length === 2 &&
    values[0] instanceof asn1js.Integer &&
    values[1] instanceof asn1js.Integer
  );
}

/** Encodes a raw r||s byte array into a DER SEQUENCE of two INTEGERs. */
function encodeRawToDer(rawSig: Uint8Array): EcdsaDerConversionResult {
  const half = rawSig.length / 2;
  let r = rawSig.slice(0, half);
  let s = rawSig.slice(half);

  // Strip leading zeros but keep at least one byte
  while (r.length > 1 && r[0] === 0) r = r.slice(1);
  while (s.length > 1 && s[0] === 0) s = s.slice(1);

  // Prepend 0x00 if the high bit is set (positive INTEGER encoding)
  if (r[0] & 0x80) {
    const prefixed = new Uint8Array(r.length + 1);
    prefixed.set(r, 1);
    r = prefixed;
  }
  if (s[0] & 0x80) {
    const prefixed = new Uint8Array(s.length + 1);
    prefixed.set(s, 1);
    s = prefixed;
  }

  const rAsn1 = new asn1js.Integer({ valueHex: new Uint8Array(r).buffer });
  const sAsn1 = new asn1js.Integer({ valueHex: new Uint8Array(s).buffer });
  const sequence = new asn1js.Sequence({ value: [rAsn1, sAsn1] });

  return { der: sequence.toBER(false), format: "raw" };
}

/**
 * Converts a raw ECDSA signature (r||s concatenation) to DER/ASN.1 SEQUENCE.
 *
 * Detection strategy (in order):
 * 1. If `expectedRawLength` is provided and `rawSig.length` matches it
 *    exactly, the input is unambiguously raw — no DER sniffing is performed.
 *    This eliminates the ≈1/256 false-positive where the first byte of `r`
 *    happens to be 0x30 and the following length bytes look plausible.
 * 2. Otherwise, validate as DER structurally via asn1js (must be a SEQUENCE
 *    of exactly two INTEGERs that consumes the entire buffer).  Only if that
 *    passes is the input treated as DER.
 * 3. Fall back to treating as raw r||s.
 *
 * @param rawSig            - Signature bytes (raw r||s or DER).
 * @param expectedRawLength - Expected byte length of a raw signature for this
 *                            algorithm (e.g. 64 for ECDSA_SHA_256).  When
 *                            provided, an exact length match bypasses all
 *                            heuristic DER detection.
 */
export function rawEcdsaSigToDer(
  rawSig: Uint8Array,
  expectedRawLength?: number,
): EcdsaDerConversionResult {
  // Fast path: length unambiguously identifies raw r||s
  if (expectedRawLength !== undefined && rawSig.length === expectedRawLength) {
    return encodeRawToDer(rawSig);
  }

  // Structural DER validation — not a header-byte heuristic
  if (isValidEcdsaDer(rawSig)) {
    return { der: new Uint8Array(rawSig).buffer, format: "der" };
  }

  // Must be raw — validate length before encoding
  const expectedLength =
    expectedRawLength ??
    (KNOWN_ECDSA_RAW_SIG_LENGTHS.has(rawSig.length) ? rawSig.length : undefined);

  if (!expectedLength || rawSig.length !== expectedLength) {
    throw new Error(`Unexpected ECDSA signature length: ${rawSig.length} bytes`);
  }

  return encodeRawToDer(rawSig);
}

/**
 * Converts a DER-encoded ECDSA signature back to raw r||s bytes.
 *
 * Returns null if the DER data cannot be parsed as a valid ECDSA SEQUENCE.
 *
 * @param derSig           - DER-encoded ECDSA signature bytes.
 * @param expectedRawLength - Expected total byte length of the raw output
 *                            (e.g. 64 for P-256).  Each component will be
 *                            padded / trimmed to half this value.
 */
export function derEcdsaSigToRaw(
  derSig: Uint8Array,
  expectedRawLength?: number,
): Uint8Array | null {
  const asn1 = asn1js.fromBER(derSig);
  if (asn1.offset === -1 || !(asn1.result instanceof asn1js.Sequence)) {
    return null;
  }

  const sequence = asn1.result as asn1js.Sequence;
  const values = sequence.valueBlock.value;

  if (!Array.isArray(values) || values.length !== 2) {
    return null;
  }

  const rBlock = values[0] as asn1js.Integer;
  const sBlock = values[1] as asn1js.Integer;

  const rBytes = new Uint8Array(rBlock.valueBlock.valueHexView);
  const sBytes = new Uint8Array(sBlock.valueBlock.valueHexView);

  const componentLength = expectedRawLength
    ? expectedRawLength / 2
    : Math.max(rBytes.length, sBytes.length);

  const normalize = (component: Uint8Array): Uint8Array => {
    let view = component;
    while (view.length > 1 && view[0] === 0) view = view.slice(1);
    if (view.length > componentLength) {
      view = view.slice(view.length - componentLength);
    }
    if (view.length < componentLength) {
      const padded = new Uint8Array(componentLength);
      padded.set(view, componentLength - view.length);
      return padded;
    }
    return view;
  };

  const normalizedR = normalize(rBytes);
  const normalizedS = normalize(sBytes);

  const raw = new Uint8Array(normalizedR.length + normalizedS.length);
  raw.set(normalizedR, 0);
  raw.set(normalizedS, normalizedR.length);

  return raw;
}
