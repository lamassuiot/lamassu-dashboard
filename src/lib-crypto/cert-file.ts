import * as asn1js from "asn1js";
import { Certificate } from "pkijs";
import { arrayBufferToBase64, formatAsPem } from "./buffer-utils";

export interface CertificateFileContent {
  /** PEM text, either as read from the file or converted from DER. */
  pem: string;
  /** True when the file held a binary DER certificate that was converted to PEM. */
  convertedFromDer: boolean;
}

const ASN1_SEQUENCE_TAG = 0x30;

/**
 * Converts a DER-encoded X.509 certificate into PEM.
 *
 * Throws when the bytes are not a well-formed DER certificate.
 */
export function derCertificateToPem(der: ArrayBuffer): string {
  const asn1 = asn1js.fromBER(der);
  if (asn1.offset === -1) {
    throw new Error("Invalid ASN.1 structure.");
  }
  // Throws if the ASN.1 structure does not match the X.509 Certificate schema.
  new Certificate({ schema: asn1.result });
  return formatAsPem(arrayBufferToBase64(der.slice(0, asn1.offset)), "CERTIFICATE");
}

/**
 * Normalises the raw contents of a certificate file to PEM.
 *
 * - Files containing PEM armor are returned as-is.
 * - Binary files starting with an ASN.1 SEQUENCE are treated as DER and
 *   converted to a PEM `CERTIFICATE` block.
 * - Anything else is returned as text so the caller's own validation can
 *   report on it.
 */
export function certificateBytesToPem(buffer: ArrayBuffer): CertificateFileContent {
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder().decode(bytes);

  if (text.includes("-----BEGIN")) {
    return { pem: text, convertedFromDer: false };
  }

  if (bytes[0] === ASN1_SEQUENCE_TAG) {
    try {
      return { pem: derCertificateToPem(buffer), convertedFromDer: true };
    } catch {
      throw new Error("The file is binary but does not contain a DER-encoded X.509 certificate.");
    }
  }

  return { pem: text, convertedFromDer: false };
}

/**
 * Reads a certificate file (PEM or DER) and returns its content as PEM.
 */
export async function readCertificateFile(file: Blob): Promise<CertificateFileContent> {
  return certificateBytesToPem(await file.arrayBuffer());
}
