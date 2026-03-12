import * as asn1js from "asn1js";
import {
  Certificate,
  CRLDistributionPoints,
  BasicConstraints,
  ExtKeyUsage,
  RelativeDistinguishedNames,
  PublicKeyInfo,
  AuthorityKeyIdentifier,
} from "pkijs";

// ---------------------------------------------------------------------------
// OID lookup tables
// ---------------------------------------------------------------------------

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST",
  "2.5.4.10": "O", "2.5.4.11": "OU",
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.10045.2.1": "EC",
  "1.2.840.10045.3.1.7": "P-256", "1.3.132.0.34": "P-384", "1.3.132.0.35": "P-521",
};

const SIG_OID_MAP: Record<string, string> = {
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.113549.1.1.14": "sha224WithRSAEncryption",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
};

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

/**
 * Formats a pkijs `RelativeDistinguishedNames` object into a human-readable
 * DN string, e.g. `CN=example.com, O=ACME, C=US`.
 */
export function formatSubject(subject: RelativeDistinguishedNames): string {
  return subject.typesAndValues
    .map(tv => `${OID_MAP[tv.type] ?? tv.type}=${(tv.value as any).valueBlock.value}`)
    .join(", ");
}

/**
 * Formats a pkijs `PublicKeyInfo` into a readable algorithm description,
 * e.g. `EC (Curve: P-256)` or `RSA (2048 bits)`.
 */
export function formatPublicKeyInfo(publicKeyInfo: PublicKeyInfo): string {
  const algoOid = publicKeyInfo.algorithm.algorithmId;
  const algoName = OID_MAP[algoOid] ?? algoOid;
  let details = "";
  if (algoName === "EC" && (publicKeyInfo.algorithm as any).parameters && (publicKeyInfo.algorithm as any).parameters.valueBlock) {
    const curveOid = (publicKeyInfo.algorithm as any).parameters.valueBlock.value as string;
    details = `(Curve: ${OID_MAP[curveOid] ?? curveOid})`;
  } else if (algoName === "RSA" && publicKeyInfo.parsedKey && (publicKeyInfo.parsedKey as any).modulus) {
    const modulusBytes = (publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex.byteLength;
    const leadingZero = new Uint8Array((publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex)[0] === 0 ? 1 : 0;
    details = `(${(modulusBytes - leadingZero) * 8} bits)`;
  }
  return `${algoName} ${details}`;
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
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
      .replace(/\s+/g, "");
    const binaryString = window.atob(pemString);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

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

    result.subject = formatSubject(cert.subject);
    result.issuer = formatSubject(cert.issuer);
    result.serialNumber = abToHex(cert.serialNumber.valueBlock.valueHex, ":");
    result.validFrom = cert.notBefore.value.toISOString();
    result.validTo = cert.notAfter.value.toISOString();
    result.publicKeyAlgorithm = formatPublicKeyInfo(cert.subjectPublicKeyInfo);

    try {
      result.signatureAlgorithm =
        SIG_OID_MAP[cert.signatureAlgorithm.algorithmId] ?? cert.signatureAlgorithm.algorithmId;
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
