import * as asn1js from "asn1js";
import {
  Certificate,
  OCSPRequest,
  OCSPResponse,
  BasicOCSPResponse,
  Extension,
  SingleResponse,
  getCrypto,
  setEngine,
  getRandomValues,
} from "pkijs";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of an OCSP status check. */
export interface OcspResponseDetails {
  status: "good" | "revoked" | "unknown" | "error";
  statusText: string;
  producedAt?: string;
  thisUpdate?: string;
  nextUpdate?: string;
  revocationReason?: string;
  revocationTime?: string;
  errorDetails?: string;
  responderId?: string;
  requestDer?: ArrayBuffer | null;
  responseDer?: ArrayBuffer | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST",
  "2.5.4.10": "O", "2.5.4.11": "OU",
};

const CERT_STATUS_TAG: Record<number, OcspResponseDetails["status"]> = {
  0: "good",
  1: "revoked",
};

const REVOCATION_REASONS = [
  "unspecified", "keyCompromise", "cACompromise", "affiliationChanged",
  "superseded", "cessationOfOperation", "certificateHold",
  "removeFromCRL", "privilegeWithdrawn", "aACompromise",
];

function getRevocationReason(code?: number): string {
  if (code === undefined) return "N/A";
  return REVOCATION_REASONS[code] ?? `Unknown (${code})`;
}

function formatResponderId(responderID: any): string {
  if (responderID.typesAndValues) {
    return responderID.typesAndValues
      .map((tv: any) => `${OID_MAP[tv.type] ?? tv.type}=${tv.value.valueBlock.value}`)
      .join(", ");
  }
  if (responderID.valueBlock?.valueHex) {
    const hash = Array.from(new Uint8Array(responderID.valueBlock.valueHex))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    return `byKey: ${hash}`;
  }
  return "Unknown format";
}

function parsePem(pem: string): ArrayBuffer {
  const pemString = pem.replaceAll(/-----(BEGIN|END) CERTIFICATE-----/g, "").replaceAll(/\s+/g, "");
  const binary = window.atob(pemString);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Performs an OCSP check for a given certificate against its issuer.
 *
 * @param targetCertPem  PEM string of the certificate to check.
 * @param issuerCertPem  PEM string of the issuer's certificate.
 * @param ocspUrl        URL of the OCSP responder.
 * @returns Details of the OCSP response, including status and timing.
 */
export async function checkOcspStatus(
  targetCertPem: string,
  issuerCertPem: string,
  ocspUrl: string,
): Promise<OcspResponseDetails> {
  try {
    if (typeof window !== "undefined") {
      const engine = getCrypto();
      if (engine) setEngine("webcrypto", engine);
    }

    const targetAsn1 = asn1js.fromBER(parsePem(targetCertPem));
    const issuerAsn1 = asn1js.fromBER(parsePem(issuerCertPem));
    const targetCert = new Certificate({ schema: targetAsn1.result });
    const issuerCert = new Certificate({ schema: issuerAsn1.result });

    const ocspReq = new OCSPRequest();
    await ocspReq.createForCertificate(targetCert, {
      hashAlgorithm: "SHA-256",
      issuerCertificate: issuerCert,
    });

    const nonce = getRandomValues(new Uint8Array(10));
    ocspReq.tbsRequest.requestExtensions = [
      new Extension({
        extnID: "1.3.6.1.5.5.7.48.1.2",
        extnValue: new asn1js.OctetString({ valueHex: nonce.buffer as ArrayBuffer }).toBER(false),
      }),
    ];

    const requestBody = ocspReq.toSchema(true).toBER(false);

    const response = await fetch(ocspUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/ocsp-request",
        "Accept": "application/ocsp-response",
      },
      body: requestBody,
    });

    if (!response.ok) {
      throw new Error(`OCSP server responded with HTTP ${response.status}`);
    }

    const responseBody = await response.arrayBuffer();

    const asn1Resp = asn1js.fromBER(responseBody);
    if (asn1Resp.offset === -1) throw new Error("Failed to parse OCSP response from server.");
    const ocspResponse = new OCSPResponse({ schema: asn1Resp.result });

    if (!ocspResponse.responseBytes?.response.valueBlock.valueHex) {
      throw new Error("OCSP response is missing the 'responseBytes' block.");
    }

    const basicResponseDer = ocspResponse.responseBytes.response.valueBlock.valueHex;
    const asn1BasicResp = asn1js.fromBER(basicResponseDer);
    if (asn1BasicResp.offset === -1) throw new Error("Failed to parse the BasicOCSPResponse.");

    const basicResponse = new BasicOCSPResponse({ schema: asn1BasicResp.result });
    const singleResponse = new SingleResponse(basicResponse.tbsResponseData.responses[0]);
    const certStatus = CERT_STATUS_TAG[singleResponse.certStatus.idBlock.tagNumber] ?? "unknown";

    let revokedInfo: Partial<OcspResponseDetails> = {};
    if (certStatus === "revoked" && singleResponse.certStatus.value?.revocationTime) {
      revokedInfo = {
        revocationTime: format(singleResponse.certStatus.value.revocationTime, "PPpp"),
        revocationReason: getRevocationReason(singleResponse.certStatus.value.revocationReason),
      };
    }

    return {
      status: certStatus,
      statusText: certStatus.charAt(0).toUpperCase() + certStatus.slice(1),
      producedAt: format(basicResponse.tbsResponseData.producedAt, "PPpp"),
      thisUpdate: format(singleResponse.thisUpdate, "PPpp"),
      nextUpdate: singleResponse.nextUpdate
        ? format(singleResponse.nextUpdate, "PPpp")
        : "Not specified",
      responderId: formatResponderId(basicResponse.tbsResponseData.responderID),
      requestDer: requestBody,
      responseDer: responseBody,
      ...revokedInfo,
    };
  } catch (e: any) {
    console.error("OCSP Check Failed:", e);
    let errorDetails = e.message || "An unknown error occurred.";
    if (e instanceof TypeError && e.message.includes("fetch")) {
      errorDetails += " This may be due to a CORS policy on the OCSP server.";
    }
    return { status: "error", statusText: "Request Failed", errorDetails };
  }
}
