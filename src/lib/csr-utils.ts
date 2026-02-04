
'use client'; 

import {
  CertificationRequest,
  Extensions,
  Extension as PkijsExtension,
  GeneralNames as PkijsGeneralNames,
  BasicConstraints as PkijsBasicConstraints,
  getCrypto,
  setEngine,
  PublicKeyInfo as PkijsPublicKeyInfo,
  RelativeDistinguishedNames as PkijsRelativeDistinguishedNames
} from "pkijs";
import * as asn1js from "asn1js";

// --- Type Definition ---
export interface DecodedCsrInfo {
  subject?: string;
  publicKeyInfo?: string;
  sans?: string[];
  basicConstraints?: string | null;
  error?: string;
}

// --- Helper Functions ---
const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.10045.2.1": "EC",
  "1.2.840.10045.3.1.7": "P-256", "1.3.132.0.34": "P-384", "1.3.132.0.35": "P-521",
};

function formatPkijsSubject(subject: PkijsRelativeDistinguishedNames): string {
  return subject.typesAndValues.map(tv => `${OID_MAP[tv.type] || tv.type}=${(tv.value as any).valueBlock.value}`).join(', ');
}

function formatPkijsPublicKeyInfo(publicKeyInfo: PkijsPublicKeyInfo): string {
  const algoOid = publicKeyInfo.algorithm.algorithmId;
  const algoName = OID_MAP[algoOid] || algoOid;
  let details = "";
  
  const algorithm = publicKeyInfo.algorithm as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (algoName === "EC" && algorithm.parameters) {
      const curveOid = algorithm.parameters.valueBlock.value as string;
      details = `(Curve: ${OID_MAP[curveOid] || curveOid})`;
  } else if (algoName === "RSA" && publicKeyInfo.parsedKey) {
      const modulusBytes = (publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex.byteLength;
      details = `(${(modulusBytes - (new Uint8Array((publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex)[0] === 0 ? 1:0)) * 8} bits)`;
  }
  return `${algoName} ${details}`;
}

function formatPkijsSans(extensions: PkijsExtension[]): string[] {
  const sans: string[] = [];
  const sanExtension = extensions.find(ext => ext.extnID === "2.5.29.17");
  if (sanExtension && sanExtension.parsedValue) {
      (sanExtension.parsedValue as PkijsGeneralNames).names.forEach(name => {
          if (name.type === 1) sans.push(`Email: ${name.value}`);
          else if (name.type === 2) sans.push(`DNS: ${name.value}`);
          else if (name.type === 6) sans.push(`URI: ${name.value}`);
          else if (name.type === 7) {
              const ipBytes = Array.from(new Uint8Array(name.value.valueBlock.valueHex));
              sans.push(`IP: ${ipBytes.join('.')}`);
          }
      });
  }
  return sans;
}

function formatPkijsBasicConstraints(extensions: PkijsExtension[]): string | null {
  const bcExtension = extensions.find(ext => ext.extnID === "2.5.29.19");
  if (bcExtension && bcExtension.parsedValue) {
      const bc = bcExtension.parsedValue as PkijsBasicConstraints;
      return `CA: ${bc.cA ? 'TRUE' : 'FALSE'}${bc.pathLenConstraint !== undefined ? `, Path Length: ${bc.pathLenConstraint}` : ''}`;
  }
  return null;
}

// --- Main Parsing Function ---
export async function parseCsr(pem: string): Promise<DecodedCsrInfo> {
  try {
    if (typeof window !== 'undefined') {
      setEngine("webcrypto", getCrypto() ?? undefined);
    }
    const pemContent = pem.replace(/-----(BEGIN|END) (NEW )?CERTIFICATE REQUEST-----/g, "").replace(/\s+/g, "");
    const derBuffer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0)).buffer;
    const asn1 = asn1js.fromBER(derBuffer);
    if (asn1.offset === -1) {
      throw new Error("Cannot parse CSR. Invalid ASN.1 structure.");
    }
    const pkcs10 = new CertificationRequest({ schema: asn1.result });
    const subject = formatPkijsSubject(pkcs10.subject);
    const publicKeyInfo = formatPkijsPublicKeyInfo(pkcs10.subjectPublicKeyInfo);
    let sans: string[] = [];
    let basicConstraints: string | null = null;
    const extensionRequestAttribute = pkcs10.attributes?.find(attr => attr.type === "1.2.840.113549.1.9.14");
    if (extensionRequestAttribute) {
        const extensions = new Extensions({ schema: extensionRequestAttribute.values[0] });
        sans = formatPkijsSans(extensions.extensions);
        basicConstraints = formatPkijsBasicConstraints(extensions.extensions);
    }
    return { subject, publicKeyInfo, sans, basicConstraints };
  } catch (e: any) {
    return { error: `Failed to parse CSR: ${e.message}` };
  }
}
