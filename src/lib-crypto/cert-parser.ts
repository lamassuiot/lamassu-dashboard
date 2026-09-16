import * as asn1js from "asn1js";
import {
  Certificate,
  CRLDistributionPoints,
  BasicConstraints,
  ExtKeyUsage,
  AuthorityKeyIdentifier,
} from "pkijs";
import { formatDistinguishedName, formatPublicKeyInfo, resolveSignatureAlgorithmLabel } from "./oid-labels";

export { formatDistinguishedName as formatSubject, formatPublicKeyInfo } from "./oid-labels";

// ---------------------------------------------------------------------------
// OID lookup tables
// ---------------------------------------------------------------------------

const EKU_OID_MAP: Record<string, string> = {
  "1.3.6.1.5.5.7.3.1": "ServerAuth",
  "1.3.6.1.5.5.7.3.2": "ClientAuth",
  "1.3.6.1.5.5.7.3.3": "CodeSigning",
  "1.3.6.1.5.5.7.3.4": "EmailProtection",
  "1.3.6.1.5.5.7.3.8": "TimeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  "2.5.29.37.0": "Any",
};

const KEY_USAGE_NAMES = [
  "digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment",
  "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly", "decipherOnly",
];

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Converts an ArrayBuffer to a hex string, optionally with a separator.
 *
 * By default, leading zero bytes are stripped for buffers longer than 16 bytes
 * to preserve the legacy `ab2hex` behaviour used for INTEGER-like ASN.1 fields.
 *
 * For fixed-width values such as SHA-256 fingerprints, pass `false` for
 * `trimLeadingZeroForIntegers` so the full byte width is preserved.
 */
export function abToHex(
  ab: ArrayBuffer,
  separator = "",
  trimLeadingZeroForIntegers = true,
): string {
  let arr = new Uint8Array(ab);
  if (trimLeadingZeroForIntegers && arr.length > 16 && arr[0] === 0x00) {
    arr = arr.slice(1);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join(separator);
}

// ---------------------------------------------------------------------------
// Parsed certificate type
// ---------------------------------------------------------------------------

/** Full set of details parsed from a PEM-encoded X.509 certificate. */
export interface ParsedCertificate {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  publicKeyAlgorithm: string;
  signatureAlgorithm: string;
  crlDistributionPoints: string[];
  ocspUrls: string[];
  caIssuersUrls: string[];
  isCa?: boolean;
  pathLenConstraint?: number | "None";
  sans?: string[];
  keyUsage?: string[];
  extendedKeyUsage?: string[];
  subjectKeyId?: string;
  authorityKeyId?: string;
  fingerprintSha256?: string;
}

/**
 * Type alias kept for backwards-compatibility with code that imported
 * `ParsedPemDetails` from `@/lib/ca-data`.
 */
export type ParsedPemDetails = ParsedCertificate;

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

const emptyParsed = (): ParsedCertificate => ({
  subject: "N/A",
  issuer: "N/A",
  serialNumber: "N/A",
  validFrom: new Date(0).toISOString(),
  validTo: new Date(0).toISOString(),
  publicKeyAlgorithm: "N/A",
  signatureAlgorithm: "N/A",
  crlDistributionPoints: [],
  ocspUrls: [],
  caIssuersUrls: [],
  isCa: undefined,
  pathLenConstraint: undefined,
  sans: [],
  keyUsage: [],
  extendedKeyUsage: [],
  subjectKeyId: undefined,
  authorityKeyId: undefined,
  fingerprintSha256: undefined,
});

/**
 * Parses a PEM-encoded X.509 certificate and returns a structured object
 * containing all commonly-needed fields and extensions.
 *
 * Returns a safe default object (all fields set to "N/A" / empty arrays) when
 * called in an SSR context, or when the PEM cannot be parsed.
 */
export async function parseCertificatePemDetails(pem: string): Promise<ParsedCertificate> {
  const result = emptyParsed();
  if (typeof window === "undefined" || !pem) return result;

  try {
    const pemString = pem
      .replaceAll(/-----(BEGIN|END) CERTIFICATE-----/g, "")
      .replaceAll(/\s+/g, "");
    const binaryString = window.atob(pemString);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.codePointAt(i) ?? 0;

    const asn1 = asn1js.fromBER(bytes.buffer);
    if (asn1.offset === -1) {
      console.error("parseCertificatePemDetails: Invalid ASN.1 structure.");
      return result;
    }

    const cert = new Certificate({ schema: asn1.result });

    // SHA-256 fingerprint
    if (window.crypto?.subtle) {
      try {
        const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer);
        result.fingerprintSha256 = abToHex(hashBuffer, ":", false);
      } catch (e) {
        console.error("parseCertificatePemDetails: Could not calculate fingerprint", e);
      }
    }

    result.subject = formatDistinguishedName(cert.subject);
    result.issuer = formatDistinguishedName(cert.issuer);
    result.serialNumber = abToHex(cert.serialNumber.valueBlock.valueHex, ":");
    result.validFrom = cert.notBefore.value.toISOString();
    result.validTo = cert.notAfter.value.toISOString();
    result.publicKeyAlgorithm = formatPublicKeyInfo(cert.subjectPublicKeyInfo);

    try {
      result.signatureAlgorithm = resolveSignatureAlgorithmLabel(cert.signatureAlgorithm.algorithmId);
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse Signature Algorithm:", e); }

    try {
      const cdpExt = cert.extensions?.find(e => e.extnID === "2.5.29.31");
      if (cdpExt?.parsedValue) {
        (cdpExt.parsedValue as CRLDistributionPoints).distributionPoints?.forEach((point: any) => {
          if (point.distributionPoint?.[0]) result.crlDistributionPoints.push(point.distributionPoint[0].value);
        });
      }
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse CRL Distribution Points:", e); }

    try {
      const aiaExt = cert.extensions?.find(e => e.extnID === "1.3.6.1.5.5.7.1.1");
      if (aiaExt?.parsedValue) {
        aiaExt.parsedValue.accessDescriptions.forEach((desc: any) => {
          if (desc.accessMethod === "1.3.6.1.5.5.7.48.1" && desc.accessLocation.type === 6)
            result.ocspUrls.push(desc.accessLocation.value);
          else if (desc.accessMethod === "1.3.6.1.5.5.7.48.2" && desc.accessLocation.type === 6)
            result.caIssuersUrls.push(desc.accessLocation.value);
        });
      }
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse AIA:", e); }

    try {
      const bcExt = cert.extensions?.find(e => e.extnID === "2.5.29.19");
      if (bcExt?.parsedValue) {
        const bc = bcExt.parsedValue as BasicConstraints;
        result.isCa = bc.cA;
        if (bc.pathLenConstraint !== undefined) result.pathLenConstraint = bc.pathLenConstraint as number;
      }
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse Basic Constraints:", e); }

    try {
      const sanExt = cert.extensions?.find(e => e.extnID === "2.5.29.17");
      if (sanExt?.parsedValue?.altNames) {
        sanExt.parsedValue.altNames.forEach((name: any) => {
          if (name.type === 1) result.sans!.push(`Email: ${name.value}`);
          else if (name.type === 2) result.sans!.push(`DNS: ${name.value}`);
          else if (name.type === 6) result.sans!.push(`URI: ${name.value}`);
          else if (name.type === 7) {
            const ipBytes = Array.from(new Uint8Array(name.value.valueBlock.valueHex));
            result.sans!.push(`IP: ${ipBytes.join(".")}`);
          }
        });
      }
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse SANs:", e); }

    try {
      const kuExt = cert.extensions?.find(e => e.extnID === "2.5.29.15");
      if (kuExt?.parsedValue?.valueBlock?.valueHex) {
        const keyUsage = new Uint8Array(kuExt.parsedValue.valueBlock.valueHex);
        for (let i = 0; i < KEY_USAGE_NAMES.length; i++) {
          if (keyUsage.length && (keyUsage[Math.floor(i / 8)] & (1 << (7 - (i % 8))))) {
            result.keyUsage!.push(KEY_USAGE_NAMES[i]);
          }
        }
      }
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse Key Usage:", e); }

    try {
      const ekuExt = cert.extensions?.find(e => e.extnID === "2.5.29.37");
      if (ekuExt?.parsedValue) {
        (ekuExt.parsedValue as ExtKeyUsage).keyPurposes.forEach((oid: string) => {
          result.extendedKeyUsage!.push(EKU_OID_MAP[oid] ?? oid);
        });
      }
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse Extended Key Usage:", e); }

    try {
      const skiExt = cert.extensions?.find(e => e.extnID === "2.5.29.14");
      if (skiExt?.parsedValue?.valueBlock?.valueHex)
        result.subjectKeyId = abToHex(skiExt.parsedValue.valueBlock.valueHex);
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse SKI:", e); }

    try {
      const akiExt = cert.extensions?.find(e => e.extnID === "2.5.29.35");
      if (akiExt?.parsedValue) {
        const aki = akiExt.parsedValue as AuthorityKeyIdentifier;
        if (aki.keyIdentifier?.valueBlock?.valueHex)
          result.authorityKeyId = abToHex(aki.keyIdentifier.valueBlock.valueHex, ":");
      }
    } catch (e) { console.error("parseCertificatePemDetails: Failed to parse AKI:", e); }

    return result;
  } catch (e) {
    console.error("parseCertificatePemDetails: Fatal error:", e);
    return result;
  }
}
