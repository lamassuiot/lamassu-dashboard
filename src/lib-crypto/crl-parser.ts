import * as asn1js from "asn1js";
import { CertificateRevocationList } from "pkijs";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single entry in a Certificate Revocation List. */
export interface RevokedCertEntry {
  serialNumber: string;
  revocationDate: string;
  reason?: string;
}

/** Parsed representation of a Certificate Revocation List. */
export interface ParsedCrl {
  issuer: string;
  thisUpdate: string;
  nextUpdate?: string;
  revokedCertificates: RevokedCertEntry[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Reason code map
// ---------------------------------------------------------------------------

const CRL_REASON_CODES: Record<number, string> = {
  0: "Unspecified",
  1: "KeyCompromise",
  2: "CACompromise",
  3: "AffiliationChanged",
  4: "Superseded",
  5: "CessationOfOperation",
  6: "CertificateHold",
  8: "RemoveFromCRL",
  9: "PrivilegeWithdrawn",
  10: "AACompromise",
};

function getReasonLabel(cert: any): string {
  const ext = cert.crlEntryExtensions?.extensions?.find(
    (e: any) => e.extnID === "2.5.29.21",
  );
  if (ext) {
    const code = ext.parsedValue.valueBlock.valueDec as number;
    return CRL_REASON_CODES[code] ?? `Unknown (${code})`;
  }
  return "N/A";
}

function certSerialToHex(cert: any): string {
  const hex = Array.from(new Uint8Array(cert.userCertificate.valueBlock.valueHex))
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Parses a DER-encoded Certificate Revocation List and returns structured
 * information including issuer, validity dates, and the list of revoked
 * certificates.
 *
 * On failure the returned object contains an `error` field with a
 * human-readable description.
 */
export async function parseCrl(der: ArrayBuffer): Promise<ParsedCrl> {
  try {
    const asn1 = asn1js.fromBER(der);
    if (asn1.offset === -1) {
      throw new Error("Failed to parse ASN.1 structure from CRL data.");
    }

    const crl = new CertificateRevocationList({ schema: asn1.result });

    const issuer = crl.issuer.typesAndValues
      .map((tv: any) => `${tv.type}=${tv.value.valueBlock.value}`)
      .join(", ");

    const revokedCertificates: RevokedCertEntry[] = (crl.revokedCertificates ?? []).map(
      (cert: any) => ({
        serialNumber: certSerialToHex(cert),
        revocationDate: format(cert.revocationDate.value, "PPpp"),
        reason: getReasonLabel(cert),
      }),
    );

    return {
      issuer,
      thisUpdate: format(crl.thisUpdate.value, "PPpp"),
      nextUpdate: crl.nextUpdate ? format(crl.nextUpdate.value, "PPpp") : "Not specified",
      revokedCertificates,
    };
  } catch (e: any) {
    console.error("parseCrl failed:", e);
    return {
      issuer: "",
      thisUpdate: "",
      revokedCertificates: [],
      error: e.message ?? "An unknown error occurred.",
    };
  }
}
