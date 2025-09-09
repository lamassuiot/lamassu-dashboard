

// src/lib/va-api.ts
import { get_VA_API_BASE_URL, get_VA_CORE_API_BASE_URL, handleApiError } from './api-domains';
import * as asn1js from "asn1js";
import {
    Certificate,
    OCSPRequest,
    OCSPResponse,
    getCrypto,
    setEngine,
    BasicOCSPResponse,
    Extension,
    getRandomValues,
    SingleResponse
} from "pkijs";
import { format } from 'date-fns';

export interface VAConfig {
  caId: string;
  refreshInterval: string;
  validity: string;
  subjectKeyIDSigner: string | null;
  regenerateOnRevoke: boolean;
}

export interface LatestCrlInfo {
  version: number;
  valid_from: string;
  valid_until: string;
}

export interface VaApiResponse {
    crl_options: {
        refresh_interval: string;
        validity: string;
        subject_key_id_signer: string | null;
        regenerate_on_revoke: boolean;
    },
    latest_crl: LatestCrlInfo | null;
}

export interface VaUpdatePayload {
    refresh_interval: string;
    validity: string;
    subject_key_id_signer: string | null;
    regenerate_on_revoke: boolean;
}

export interface OcspResponseDetails {
    status: 'good' | 'revoked' | 'unknown' | 'error';
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


const getCertStatusFromTag = (tag: number): OcspResponseDetails['status'] => {
    if (tag === 0) return 'good';
    if (tag === 1) return 'revoked';
    return 'unknown';
};

const getRevocationReasonFromCode = (code?: number): string => {
    if (code === undefined) return 'N/A';
    const reasons = [
        "unspecified", "keyCompromise", "cACompromise", "affiliationChanged",
        "superseded", "cessationOfOperation", "certificateHold",
        "removeFromCRL", "privilegeWithdrawn", "aACompromise"
    ];
    return reasons[code] || `Unknown (${code})`;
};

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
};

const formatResponderId = (responderID: any): string => {
    if (responderID.typesAndValues) { // It's a byName responder
        return responderID.typesAndValues.map((tv: any) => `${OID_MAP[tv.type] || tv.type}=${tv.value.valueBlock.value}`).join(', ');
    }
    if (responderID.valueBlock?.valueHex) { // It's a byKey responder
        const hash = Array.from(new Uint8Array(responderID.valueBlock.valueHex)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `byKey: ${hash}`;
    }
    return 'Unknown format';
};


/**
 * Fetches the VA configuration for a given CA Subject Key ID (SKI).
 * Returns null if the configuration is not found (404).
 * Throws an error for other failures.
 */
export async function fetchVaConfig(ski: string, accessToken: string): Promise<VaApiResponse | null> {
    const response = await fetch(`${get_VA_API_BASE_URL()}/roles/${ski}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (response.status === 404) {
        return null; // Not found, which is a valid state (means not configured yet)
    }

    return handleApiError(response, 'Failed to fetch VA config');
}


/**
 * Creates or updates the VA configuration for a given CA Subject Key ID (SKI).
 */
export async function updateVaConfig(ski: string, payload: VaUpdatePayload, accessToken: string): Promise<void> {
    const response = await fetch(`${get_VA_API_BASE_URL()}/roles/${ski}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        // Use handleApiError to throw a formatted error
        await handleApiError(response, 'Failed to update VA config');
    }
}


/**
 * Downloads the latest CRL for a given CA Subject Key ID (SKI).
 * Returns the CRL data as an ArrayBuffer.
 */
export async function downloadCrl(ski: string, accessToken: string): Promise<ArrayBuffer> {
    const response = await fetch(`${get_VA_CORE_API_BASE_URL()}/crl/${ski}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/pkix-crl',
        },
    });

    if (!response.ok) {
        // Can't use handleApiError because it expects JSON.
        let errorJson;
        let errorMessage = `Failed to download CRL. Server responded with status ${response.status}`;
         try {
            errorJson = await response.json();
            errorMessage = `CRL download failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage);
    }
    
    return response.arrayBuffer();
}

/**
 * Performs an OCSP check for a given certificate.
 * @param targetCertPem The PEM string of the certificate to check.
 * @param issuerCertPem The PEM string of the issuer's certificate.
 * @param ocspUrl The URL of the OCSP responder.
 * @returns A promise that resolves with the details of the OCSP response.
 */
export async function checkOcspStatus(targetCertPem: string, issuerCertPem: string, ocspUrl: string): Promise<OcspResponseDetails> {
    try {
        if (typeof window !== 'undefined') {
            setEngine("webcrypto", getCrypto());
        }

        const parsePem = (pem: string) => {
            const pemString = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
            const binary = window.atob(pemString);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return asn1js.fromBER(bytes.buffer);
        };

        const targetCert = new Certificate({ schema: parsePem(targetCertPem).result });
        const issuerCert = new Certificate({ schema: parsePem(issuerCertPem).result });

        const ocspReq = new OCSPRequest();
        await ocspReq.createForCertificate(targetCert, { hashAlgorithm: "SHA-256", issuerCertificate: issuerCert });
        
        const nonce = getRandomValues(new Uint8Array(10));
        ocspReq.tbsRequest.requestExtensions = [
            new Extension({ extnID: "1.3.6.1.5.5.7.48.1.2", extnValue: new asn1js.OctetString({ valueHex: nonce.buffer }).toBER(false) })
        ];

        const requestBody = ocspReq.toSchema(true).toBER(false);

        const response = await fetch(ocspUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/ocsp-request', 
                'Accept': 'application/ocsp-response'
             },
            body: requestBody
        });

        if (!response.ok) {
            throw new Error(`OCSP server responded with HTTP ${response.status}`);
        }

        const responseBody = await response.arrayBuffer();

        const asn1Resp = asn1js.fromBER(responseBody);
        if (asn1Resp.offset === -1) throw new Error("Failed to parse OCSP response from server.");
        const ocspResponse = new OCSPResponse({ schema: asn1Resp.result });

        if (!ocspResponse.responseBytes?.response.valueBlock.valueHex) throw new Error("OCSP response is missing the 'responseBytes' block.");
        
        const basicResponseDer = ocspResponse.responseBytes.response.valueBlock.valueHex;
        const asn1BasicResp = asn1js.fromBER(basicResponseDer);
        if (asn1BasicResp.offset === -1) throw new Error("Failed to parse the BasicOCSPResponse.");
        
        const basicResponse = new BasicOCSPResponse({ schema: asn1BasicResp.result });
        const singleResponse = new SingleResponse(basicResponse.tbsResponseData.responses[0]);
        const certStatus = getCertStatusFromTag(singleResponse.certStatus.idBlock.tagNumber);
        
        let revokedInfo = {};
        if (certStatus === 'revoked' && singleResponse.certStatus.value?.revocationTime) {
            revokedInfo = {
                revocationTime: format(singleResponse.certStatus.value.revocationTime, 'PPpp'),
                revocationReason: getRevocationReasonFromCode(singleResponse.certStatus.value.revocationReason),
            };
        }
        
        return {
            status: certStatus,
            statusText: certStatus.charAt(0).toUpperCase() + certStatus.slice(1),
            producedAt: format(basicResponse.tbsResponseData.producedAt, 'PPpp'),
            thisUpdate: format(singleResponse.thisUpdate, 'PPpp'),
            nextUpdate: singleResponse.nextUpdate ? format(singleResponse.nextUpdate, 'PPpp') : 'Not specified',
            responderId: formatResponderId(basicResponse.tbsResponseData.responderID),
            requestDer: requestBody,
            responseDer: responseBody,
            ...revokedInfo,
        };

    } catch (e: any) {
        console.error("OCSP Check Failed:", e);
        let errorDetails = e.message || 'An unknown error occurred.';
        if (e instanceof TypeError && e.message.includes('fetch')) {
            errorDetails += ' This may be due to a CORS policy on the OCSP server.';
        }
        return { status: 'error', statusText: 'Request Failed', errorDetails };
    }
}
