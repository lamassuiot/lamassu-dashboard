import * as asn1js from "asn1js";
import { CertificateRevocationList } from "pkijs";
import { abToHex, formatSubject } from "./cert-parser";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single entry in a Certificate Revocation List. */
export interface RevokedCertEntry {
  /** Serial number as lowercase hex without separators. */
  serialNumber: string;
  /** ISO 8601 timestamp. */
  revocationDate: string;
  /** Reason code name (e.g. `KeyCompromise`), or `N/A` when the entry has none. */
  reason?: string;
}

/** Parsed representation of a Certificate Revocation List. */
export interface ParsedCrl {
  /** Issuer DN, e.g. `CN=Root CA, O=ACME`. */
  issuer: string;
  /** ISO 8601 timestamp. */
  thisUpdate: string;
  /** ISO 8601 timestamp, absent when the CRL does not set one. */
  nextUpdate?: string;
  /** CRL number extension in decimal, absent when the CRL does not carry one. */
  crlNumber?: string;
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

const OID_CRL_REASON = "2.5.29.21";
const OID_CRL_NUMBER = "2.5.29.20";

function getReasonLabel(cert: any): string {
  const ext = cert.crlEntryExtensions?.extensions?.find(
    (e: any) => e.extnID === OID_CRL_REASON,
  );
  if (ext) {
    const code = ext.parsedValue.valueBlock.valueDec as number;
    return CRL_REASON_CODES[code] ?? `Unknown (${code})`;
  }
  return "N/A";
}

/** The CRL number in decimal. It can exceed 2^53, so it is read from its bytes. */
function getCrlNumber(crl: CertificateRevocationList): string | undefined {
  const ext = crl.crlExtensions?.extensions.find(e => e.extnID === OID_CRL_NUMBER);
  const valueHex: ArrayBuffer | undefined = (ext?.parsedValue as any)?.valueBlock?.valueHex;
  if (!valueHex || valueHex.byteLength === 0) return undefined;
  return BigInt(`0x${abToHex(valueHex, "", false)}`).toString();
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Parses a DER-encoded Certificate Revocation List and returns structured
 * information including issuer, validity dates, CRL number and the list of
 * revoked certificates. Dates are ISO 8601 strings so callers can format them
 * with the user's display preferences.
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

    const revokedCertificates: RevokedCertEntry[] = (crl.revokedCertificates ?? []).map(
      (cert: any) => ({
        serialNumber: abToHex(cert.userCertificate.valueBlock.valueHex),
        revocationDate: cert.revocationDate.value.toISOString(),
        reason: getReasonLabel(cert),
      }),
    );

    return {
      issuer: formatSubject(crl.issuer),
      thisUpdate: crl.thisUpdate.value.toISOString(),
      nextUpdate: crl.nextUpdate?.value.toISOString(),
      crlNumber: getCrlNumber(crl),
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
