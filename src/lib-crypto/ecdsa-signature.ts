import * as asn1js from "asn1js";
import { KNOWN_ECDSA_RAW_SIG_LENGTHS } from "./constants";

export interface EcdsaDerConversionResult {
  /** The DER-encoded ECDSA signature as an ArrayBuffer. */
  der: ArrayBuffer;
  /** Whether the input was already in DER format or was raw r||s. */
  format: "der" | "raw";
}

/**
 * Converts a raw ECDSA signature (r||s concatenation) to DER/ASN.1 SEQUENCE.
 *
 * If the input already looks like a valid DER SEQUENCE it is returned
 * unchanged with `format: 'der'`. Otherwise the raw r||s bytes are decoded
 * and re-encoded into DER, returning `format: 'raw'`.
 *
 * @param rawSig           - Raw signature bytes (may already be DER).
 * @param expectedRawLength - Optional expected byte length of a raw signature
 *                            for this algorithm (e.g. 64 for ECDSA_SHA_256).
 */
export function rawEcdsaSigToDer(
  rawSig: Uint8Array,
  expectedRawLength?: number,
): EcdsaDerConversionResult {
  const DER_SEQUENCE_TAG = 0x30;

  // Detect whether the input is already DER-encoded
  if (rawSig.length >= 2 && rawSig[0] === DER_SEQUENCE_TAG) {
    const lengthByte = rawSig[1];
    let sequenceLength = 0;
    let headerLength = 2;

    if ((lengthByte & 0x80) === 0) {
      sequenceLength = lengthByte;
    } else {
      const lengthBytesCount = lengthByte & 0x7f;
      if (rawSig.length < headerLength + lengthBytesCount) {
        throw new Error("Invalid DER-encoded ECDSA signature length.");
      }
      sequenceLength = 0;
      for (let i = 0; i < lengthBytesCount; i++) {
        sequenceLength = (sequenceLength << 8) | rawSig[headerLength + i];
      }
      headerLength += lengthBytesCount;
    }

    if (headerLength + sequenceLength <= rawSig.length) {
      const derView = rawSig.slice(0, headerLength + sequenceLength);
      return { der: derView.buffer, format: "der" };
    }
  }

  // Treat the input as raw r||s bytes
  const expectedLength =
    expectedRawLength ??
    (KNOWN_ECDSA_RAW_SIG_LENGTHS.has(rawSig.length) ? rawSig.length : undefined);

  if (!expectedLength || rawSig.length !== expectedLength) {
    throw new Error(
      `Unexpected ECDSA signature length: ${rawSig.length} bytes`,
    );
  }

  const half = rawSig.length / 2;
  let r = rawSig.slice(0, half);
  let s = rawSig.slice(half);

  // Strip leading zeros
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

  const rAsn1 = new asn1js.Integer({ valueHex: r.buffer });
  const sAsn1 = new asn1js.Integer({ valueHex: s.buffer });
  const sequence = new asn1js.Sequence({ value: [rAsn1, sAsn1] });

  return { der: sequence.toBER(false), format: "raw" };
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
