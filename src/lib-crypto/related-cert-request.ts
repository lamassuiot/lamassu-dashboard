/**
 * RFC 9763 `relatedCertRequest` CSR attribute (id-aa-relatedCertRequest).
 *
 * Mirrors the Go fork's `crypto/x509` implementation (x509_related_csr.go):
 *
 *   Attribute { type 1.2.840.113549.1.9.16.2.60, values SET { RequesterCertificate } }
 *
 *   RequesterCertificate ::= SEQUENCE {
 *     certID       SEQUENCE { issuer Name, serialNumber INTEGER },
 *     requestTime  INTEGER,                 -- unix seconds
 *     locationInfo SEQUENCE OF IA5String,
 *     signature    BIT STRING }
 *
 * The signature is made by the related certificate's private key over
 * `DER(certID) || DER(requestTime)`. The server compares the issuer
 * byte-for-byte with the related certificate's issuer, so the issuer is
 * embedded as raw DER and never re-encoded.
 */

import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { concatBytes, pemToArrayBuffer } from "./buffer-utils";
import { rawEcdsaSigToDer } from "./ecdsa-signature";
import { HASH_ALGORITHM_OID_MAP } from "./oid-labels";

/** id-aa-relatedCertRequest (RFC 9763). */
export const RELATED_CERT_REQUEST_OID = "1.2.840.113549.1.9.16.2.60";

const OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1";

const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_OID = 0x06;
const TAG_UTF8_STRING = 0x0c;
const TAG_PRINTABLE_STRING = 0x13;
const TAG_IA5_STRING = 0x16;
const TAG_SEQUENCE = 0x30;
const TAG_SET = 0x31;

/** The inputs that make up a relatedCertRequest attribute. */
export interface RelatedCertRequestParams {
  issuerDer: Uint8Array;
  serialHex: string;
  requestTime: number;
  locationInfo: string[];
  signature: Uint8Array;
}

// ---------------------------------------------------------------------------
// Minimal DER encoding / reading
// ---------------------------------------------------------------------------

function derLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes: number[] = [];
  for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function derTlv(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(tag), derLength(content.length), content);
}

/** Minimal two's complement encoding of a non-negative integer given as big-endian bytes. */
function derPositiveInteger(magnitude: Uint8Array): Uint8Array {
  let start = 0;
  while (start < magnitude.length - 1 && magnitude[start] === 0) start++;
  let content: Uint8Array = magnitude.slice(start);
  if (content.length === 0) content = Uint8Array.of(0);
  if (content[0] & 0x80) content = concatBytes(Uint8Array.of(0), content);
  return derTlv(TAG_INTEGER, content);
}

interface Tlv {
  tag: number;
  /** The complete element (tag, length and content). */
  full: Uint8Array;
  content: Uint8Array;
  end: number;
}

function readTlv(bytes: Uint8Array, offset: number): Tlv {
  if (offset + 2 > bytes.length) throw new Error("Truncated DER structure.");
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let header = 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || offset + 2 + count > bytes.length) {
      throw new Error("Unsupported DER length encoding.");
    }
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset + 2 + i];
    header += count;
  }
  const end = offset + header + length;
  if (end > bytes.length) throw new Error("Truncated DER structure.");
  return { tag, full: bytes.slice(offset, end), content: bytes.slice(offset + header, end), end };
}

function decodeOid(content: Uint8Array): string {
  const parts: number[] = [];
  let value = 0;
  for (const byte of content) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      if (parts.length === 0) {
        const first = value < 80 ? Math.floor(value / 40) : 2;
        parts.push(first, value - first * 40);
      } else {
        parts.push(value);
      }
      value = 0;
    }
  }
  return parts.join(".");
}

function encodeOid(oid: string): Uint8Array {
  const arcs = oid.split(".").map(Number);
  const bytes: number[] = [arcs[0] * 40 + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const chunk = [arc & 0x7f];
    for (let n = Math.floor(arc / 128); n > 0; n = Math.floor(n / 128)) chunk.unshift((n & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return derTlv(TAG_OID, Uint8Array.from(bytes));
}

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

/** Lower-case hex of `bytes`. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** Decodes hex (whitespace, `:` and an optional `0x` prefix are ignored). Throws on invalid input. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replaceAll(/[\s:]/g, "").replace(/^0x/i, "");
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("Invalid hexadecimal value.");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * Decodes binary input written as hex or base64 (PEM armor and whitespace are ignored).
 * A string made only of hex digits of even length is read as hex.
 */
export function decodeHexOrBase64(value: string): Uint8Array {
  const stripped = value.replaceAll(/-----(BEGIN|END)[^-]*-----/g, "").replaceAll(/\s+/g, "");
  if (stripped.length === 0) throw new Error("Value is empty.");
  if (/^(0x)?[0-9a-fA-F:]+$/.test(stripped) && stripped.replace(/^0x/i, "").replaceAll(":", "").length % 2 === 0) {
    return hexToBytes(stripped);
  }
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(stripped)) throw new Error("Value is neither hex nor base64.");
  const standard = stripped.replaceAll("-", "+").replaceAll("_", "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  try {
    return Uint8Array.from(globalThis.atob(padded), c => c.codePointAt(0) ?? 0);
  } catch {
    throw new Error("Value is neither hex nor base64.");
  }
}

// ---------------------------------------------------------------------------
// certID, signed data and attribute
// ---------------------------------------------------------------------------

/** DER of `IssuerAndSerialNumber ::= SEQUENCE { issuer Name, serialNumber INTEGER }`. */
export function encodeCertId(issuerDer: Uint8Array, serialHex: string): Uint8Array {
  const clean = serialHex.replaceAll(/[\s:]/g, "").replace(/^0x/i, "");
  const serial = derPositiveInteger(hexToBytes(clean.length % 2 ? `0${clean}` : clean));
  return derTlv(TAG_SEQUENCE, concatBytes(issuerDer, serial));
}

function encodeRequestTime(requestTime: number): Uint8Array {
  if (!Number.isSafeInteger(requestTime) || requestTime < 0) {
    throw new Error("Request time must be a non-negative integer (unix seconds).");
  }
  const hex = BigInt(requestTime).toString(16);
  return derPositiveInteger(hexToBytes(hex.length % 2 ? `0${hex}` : hex));
}

/** The bytes the related certificate's key must sign: `DER(certID) || DER(requestTime)`. */
export function buildRelatedCertTbs(params: Pick<RelatedCertRequestParams, "issuerDer" | "serialHex" | "requestTime">): Uint8Array {
  return concatBytes(encodeCertId(params.issuerDer, params.serialHex), encodeRequestTime(params.requestTime));
}

/** DER of the `RequesterCertificate` value (the single element of the attribute's SET). */
export function encodeRequesterCertificate(params: RelatedCertRequestParams): Uint8Array {
  if (params.locationInfo.length === 0) throw new Error("locationInfo must contain at least one URI.");
  if (params.signature.length === 0) throw new Error("The signature is empty.");

  const uris = params.locationInfo.map(uri => {
    if (!/^[\x20-\x7e]+$/.test(uri)) throw new Error(`Location URI "${uri}" must be printable ASCII (IA5String).`);
    return derTlv(TAG_IA5_STRING, new TextEncoder().encode(uri));
  });

  return derTlv(TAG_SEQUENCE, concatBytes(
    buildRelatedCertTbs(params),
    derTlv(TAG_SEQUENCE, concatBytes(...uris)),
    derTlv(TAG_BIT_STRING, concatBytes(Uint8Array.of(0), params.signature)),
  ));
}

/** DER of the full attribute: `SEQUENCE { OID, SET { RequesterCertificate } }`. */
export function encodeRelatedCertRequestAttribute(params: RelatedCertRequestParams): Uint8Array {
  return derTlv(TAG_SEQUENCE, concatBytes(
    encodeOid(RELATED_CERT_REQUEST_OID),
    derTlv(TAG_SET, encodeRequesterCertificate(params)),
  ));
}

/** The attribute as a PKI.js object, ready for `CertificationRequest.attributes`. */
export function buildRelatedCertRequestAttribute(params: RelatedCertRequestParams): pkijs.Attribute {
  const der = encodeRequesterCertificate(params);
  const parsed = asn1js.fromBER(der.slice().buffer);
  if (parsed.offset === -1) throw new Error("Could not encode the relatedCertRequest attribute.");
  return new pkijs.Attribute({ type: RELATED_CERT_REQUEST_OID, values: [parsed.result] });
}

// ---------------------------------------------------------------------------
// Issuer Name encoding (typed fields)
// ---------------------------------------------------------------------------

/** Structured issuer fields; each is a single value. */
export interface IssuerNameFields {
  country?: string;
  stateProvince?: string;
  locality?: string;
  organization?: string;
  organizationalUnit?: string;
  commonName?: string;
}

// RDN order used by Go's pkix.Name.ToRDNSequence, i.e. by certificates issued by the Lamassu backend.
const ISSUER_FIELD_ORDER: Array<[keyof IssuerNameFields, string]> = [
  ["country", "2.5.4.6"],
  ["stateProvince", "2.5.4.8"],
  ["locality", "2.5.4.7"],
  ["organization", "2.5.4.10"],
  ["organizationalUnit", "2.5.4.11"],
  ["commonName", "2.5.4.3"],
];

// encoding/asn1 emits PrintableString when every character is in this set, UTF8String otherwise.
const PRINTABLE_STRING = /^[A-Za-z0-9 '()+,\-./:=?]*$/;

/**
 * Encodes the issuer like Go's `asn1.Marshal(pkix.Name.ToRDNSequence())`, so a Name typed
 * here is byte-identical to the issuer of a certificate produced by the backend.
 * Certificates from other CAs may use other orders or string types; paste the certificate
 * (see {@link parseRelatedCertificate}) or the raw issuer DER for those.
 */
export function encodeIssuerName(fields: IssuerNameFields): Uint8Array {
  const rdns: Uint8Array[] = [];
  for (const [key, oid] of ISSUER_FIELD_ORDER) {
    const value = fields[key]?.trim();
    if (!value) continue;
    const tag = PRINTABLE_STRING.test(value) ? TAG_PRINTABLE_STRING : TAG_UTF8_STRING;
    const attribute = derTlv(TAG_SEQUENCE, concatBytes(encodeOid(oid), derTlv(tag, new TextEncoder().encode(value))));
    rdns.push(derTlv(TAG_SET, attribute));
  }
  if (rdns.length === 0) throw new Error("The issuer needs at least one name attribute.");
  return derTlv(TAG_SEQUENCE, concatBytes(...rdns));
}

// ---------------------------------------------------------------------------
// Related certificate parsing
// ---------------------------------------------------------------------------

/** What the attribute needs from a related certificate, taken verbatim from its DER. */
export interface ParsedRelatedCertificate {
  /** The issuer Name exactly as encoded in the certificate. */
  issuerDer: Uint8Array;
  /** Serial number as minimal hex. */
  serialHex: string;
  /** SubjectPublicKeyInfo algorithm OID (e.g. 1.2.840.10045.2.1 for ECDSA). */
  publicKeyAlgorithm: string;
}

/**
 * Extracts issuer and serial from a PEM or DER certificate without re-encoding anything.
 * Walks `Certificate -> tbsCertificate -> [version] serial signature issuer validity subject spki`.
 */
export function parseRelatedCertificate(input: string | Uint8Array): ParsedRelatedCertificate {
  const der = typeof input === "string" ? new Uint8Array(pemToArrayBuffer(input, "CERTIFICATE")) : input;

  const certificate = readTlv(der, 0);
  if (certificate.tag !== TAG_SEQUENCE) throw new Error("Not an X.509 certificate.");
  const tbs = readTlv(certificate.content, 0);
  if (tbs.tag !== TAG_SEQUENCE) throw new Error("Not an X.509 certificate.");

  let next = readTlv(tbs.content, 0);
  if (next.tag === 0xa0) next = readTlv(tbs.content, next.end); // explicit [0] version
  if (next.tag !== TAG_INTEGER) throw new Error("Certificate serial number not found.");
  const serial = next;
  const signatureAlgorithm = readTlv(tbs.content, serial.end);
  const issuer = readTlv(tbs.content, signatureAlgorithm.end);
  const validity = readTlv(tbs.content, issuer.end);
  const subject = readTlv(tbs.content, validity.end);
  const spki = readTlv(tbs.content, subject.end);
  if (issuer.tag !== TAG_SEQUENCE || spki.tag !== TAG_SEQUENCE) throw new Error("Malformed certificate.");

  const algorithm = readTlv(spki.content, 0);
  const algorithmOid = readTlv(algorithm.content, 0);

  const magnitude = serial.content[0] === 0 && serial.content.length > 1 ? serial.content.slice(1) : serial.content;
  return {
    issuerDer: issuer.full,
    serialHex: bytesToHex(magnitude).replace(/^0+(?=.)/, ""),
    publicKeyAlgorithm: decodeOid(algorithmOid.content),
  };
}

const DN_LABELS: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.5": "serialNumber",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "0.9.2342.19200300.100.1.25": "DC",
  "1.2.840.113549.1.9.1": "emailAddress",
};

/** Readable form of an issuer Name (most specific first, like `openssl x509 -issuer`), for display only. */
export function formatIssuerName(issuerDer: Uint8Array): string {
  const parsed = asn1js.fromBER(issuerDer.slice().buffer);
  if (parsed.offset === -1) throw new Error("The issuer is not valid DER.");
  const name = new pkijs.RelativeDistinguishedNames({ schema: parsed.result });
  return name.typesAndValues
    .map(tv => `${DN_LABELS[tv.type] ?? tv.type}=${String((tv.value as asn1js.BaseStringBlock).valueBlock.value)}`)
    .reverse()
    .join(", ");
}

/**
 * Normalises a user supplied signature for the related certificate's key type.
 * ECDSA signatures given as raw `r||s` are converted to the DER form the server verifies;
 * everything else is passed through unchanged.
 */
export function normalizeRelatedCertSignature(signature: Uint8Array, publicKeyAlgorithm?: string): Uint8Array {
  if (publicKeyAlgorithm === OID_EC_PUBLIC_KEY) {
    return new Uint8Array(rawEcdsaSigToDer(signature).der);
  }
  return signature;
}

// ---------------------------------------------------------------------------
// RelatedCertificate extension (id-pe-relatedCert, RFC 9763): read side
// ---------------------------------------------------------------------------

export const RELATED_CERT_EXTENSION_OID = "1.3.6.1.5.5.7.1.36";

export interface RelatedCertificateExtension {
  /** Hash name. The raw OID is kept when it is not one of the supported hashes. */
  hashAlgorithm: string;
  hashValue: string;
}

/**
 * Decodes the extnValue of a RelatedCertificate extension:
 * `SEQUENCE { hashAlgorithm AlgorithmIdentifier, hashValue OCTET STRING }`.
 * Returns null when the value is malformed, so a bad extension never breaks parsing.
 */
export function parseRelatedCertificateExtension(extnValue: Uint8Array): RelatedCertificateExtension | null {
  try {
    const parsed = asn1js.fromBER(extnValue.slice().buffer);
    if (parsed.offset === -1 || !(parsed.result instanceof asn1js.Sequence)) return null;
    const [algorithm, digest] = parsed.result.valueBlock.value as asn1js.BaseBlock[];
    if (!(algorithm instanceof asn1js.Sequence) || !(digest instanceof asn1js.OctetString)) return null;
    const oidBlock = algorithm.valueBlock.value[0] as asn1js.ObjectIdentifier | undefined;
    const oid = oidBlock?.valueBlock.toString() ?? '';
    if (!oid) return null;
    return {
      hashAlgorithm: HASH_ALGORITHM_OID_MAP[oid] ?? oid,
      hashValue: bytesToHex(new Uint8Array(digest.valueBlock.valueHexView)),
    };
  } catch {
    return null;
  }
}
