import * as asn1js from "asn1js";
import {
  CertificationRequest,
  Extensions,
  Extension as PkijsExtension,
  GeneralNames as PkijsGeneralNames,
  BasicConstraints as PkijsBasicConstraints,
  PublicKeyInfo as PkijsPublicKeyInfo,
  RelativeDistinguishedNames as PkijsRelativeDistinguishedNames,
} from "pkijs";

// ---------------------------------------------------------------------------
// OID lookup
// ---------------------------------------------------------------------------

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST",
  "2.5.4.10": "O", "2.5.4.11": "OU",
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.10045.2.1": "EC",
  "1.2.840.10045.3.1.7": "P-256", "1.3.132.0.34": "P-384", "1.3.132.0.35": "P-521",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function decodeSubject(subject: PkijsRelativeDistinguishedNames): string {
  return subject.typesAndValues
    .map(tv => `${OID_MAP[tv.type] ?? tv.type}=${(tv.value as any).valueBlock.value}`)
    .join(", ");
}

function decodePublicKeyInfo(publicKeyInfo: PkijsPublicKeyInfo): string {
  const algoOid = publicKeyInfo.algorithm.algorithmId;
  const algoName = OID_MAP[algoOid] ?? algoOid;
  let details = "";
  if (algoName === "EC" && (publicKeyInfo.algorithm as any).parameters) {
    const curveOid = (publicKeyInfo.algorithm as any).parameters.valueBlock.value as string;
    details = `(Curve: ${OID_MAP[curveOid] ?? curveOid})`;
  } else if (algoName === "RSA" && publicKeyInfo.parsedKey) {
    const modulusBytes = (publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex.byteLength;
    const leadingZero = new Uint8Array((publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex)[0] === 0 ? 1 : 0;
    details = `(${(modulusBytes - leadingZero) * 8} bits)`;
  }
  return `${algoName} ${details}`;
}

function decodeSans(extensions: PkijsExtension[]): string[] {
  const sans: string[] = [];
  const sanExt = extensions.find(e => e.extnID === "2.5.29.17");
  const names = (sanExt?.parsedValue as PkijsGeneralNames | undefined)?.names;
  if (!Array.isArray(names)) return sans;

  names.forEach(name => {
    if (name.type === 1) sans.push(`Email: ${name.value}`);
    else if (name.type === 2) sans.push(`DNS: ${name.value}`);
    else if (name.type === 6) sans.push(`URI: ${name.value}`);
    else if (name.type === 7) {
      const ipBytes = Array.from(new Uint8Array(name.value.valueBlock.valueHex));
      sans.push(`IP: ${ipBytes.join(".")}`);
    }
  });

  return sans;
}

function decodeBasicConstraints(extensions: PkijsExtension[]): string | null {
  const bcExt = extensions.find(e => e.extnID === "2.5.29.19");
  if (bcExt?.parsedValue) {
    const bc = bcExt.parsedValue as PkijsBasicConstraints;
    return `CA: ${bc.cA ? "TRUE" : "FALSE"}${bc.pathLenConstraint !== undefined ? `, Path Length: ${bc.pathLenConstraint}` : ""}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Structured information decoded from a PKCS#10 CSR. */
export interface DecodedCsrInfo {
  subject?: string;
  publicKeyInfo?: string;
  sans?: string[];
  basicConstraints?: string | null;
  error?: string;
}

/**
 * Parses a PEM-encoded PKCS#10 Certificate Signing Request and returns a
 * structured `DecodedCsrInfo`.  On error the returned object contains an
 * `error` field with a human-readable message.
 */
export async function parseCsr(pem: string): Promise<DecodedCsrInfo> {
  try {
    const pemContent = pem
      .replaceAll(/-----(BEGIN|END) (NEW )?CERTIFICATE REQUEST-----/g, "")
      .replaceAll(/\s+/g, "");
    const derBuffer = Uint8Array.from(atob(pemContent), c => c.codePointAt(0) ?? 0).buffer;
    const asn1 = asn1js.fromBER(derBuffer);
    if (asn1.offset === -1) throw new Error("Cannot parse CSR. Invalid ASN.1 structure.");

    const pkcs10 = new CertificationRequest({ schema: asn1.result });
    const subject = decodeSubject(pkcs10.subject);
    const publicKeyInfo = decodePublicKeyInfo(pkcs10.subjectPublicKeyInfo);

    let sans: string[] = [];
    let basicConstraints: string | null = null;
    const extAttr = pkcs10.attributes?.find(a => a.type === "1.2.840.113549.1.9.14");
    if (extAttr) {
      const extensions = new Extensions({ schema: extAttr.values[0] });
      const extensionList = extensions.extensions ?? [];
      sans = decodeSans(extensionList);
      basicConstraints = decodeBasicConstraints(extensionList);
    }

    return { subject, publicKeyInfo, sans, basicConstraints };
  } catch (e: any) {
    return { error: `Failed to parse CSR: ${e.message}` };
  }
}
