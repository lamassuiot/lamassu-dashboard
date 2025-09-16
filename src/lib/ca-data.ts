

// Define the CA data structure
import * as asn1js from "asn1js";
import { Certificate, CRLDistributionPoints, BasicConstraints, ExtKeyUsage, RelativeDistinguishedNames, PublicKeyInfo, AuthorityKeyIdentifier } from "pkijs";
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { get_CA_API_BASE_URL, get_DEV_MANAGER_API_BASE_URL, handleApiError } from "./api-domains";

// API Response Structures
interface ApiKeyMetadata {
  type: string; // e.g., "ECDSA", "RSA"
  bits?: number; // e.g., 256, 2048
  curve_name?: string; // e.g., "P-256" for ECDSA
  strength?: string; // e.g., "HIGH"
}

interface ApiDistinguishedName {
  common_name: string;
  organization?: string;
  organization_unit?: string;
  country?: string;
  state?: string;
  locality?: string;
}

interface ApiIssuerMetadata {
  serial_number: string;
  id: string; // Issuer CA's ID
  level: number;
}

interface ApiCertificateData {
  serial_number: string;
  subject_key_id: string;
  authority_key_id: string;
  metadata: Record<string, any>;
  status: string; // "ACTIVE", "REVOKED", "EXPIRED" (assuming API might provide EXPIRED)
  certificate: string; // Base64 encoded PEM
  key_metadata: ApiKeyMetadata;
  subject: ApiDistinguishedName;
  issuer: ApiDistinguishedName; // Issuer DN from cert, issuer_metadata.id is the CA ID
  valid_from: string; // ISO Date string
  issuer_metadata: ApiIssuerMetadata;
  valid_to: string; // ISO date string
  revocation_timestamp?: string;
  revocation_reason?: string;
  type?: string; // "MANAGED"
  engine_id?: string; // To be used as kmsKeyId
  is_ca: boolean;
}

export interface ApiCaItem {
  id: string; // This is the CA's own ID
  certificate: ApiCertificateData;
  serial_number: string; // Duplicated from certificate.serial_number
  metadata: Record<string, any>;
  validity?: {
    type: string;
    duration: string;
    time: string;
  };
  creation_ts: string;
  level: number; // Hierarchy level, 0 for root
}

export interface ApiResponseList {
  next: string | null;
  list: ApiCaItem[];
}

// Local CA interface
export interface CA {
  id: string;
  name: string;
  issuer: string; // ID of the parent CA or "Self-signed"
  expires: string; // ISO date string from valid_to
  serialNumber: string;
  status: 'active' | 'expired' | 'revoked' | 'unknown'; // Added 'unknown' for safety
  keyAlgorithm: string;
  kmsKeyId?: string;
  pemData?: string;
  children?: CA[];
  subjectKeyId?: string;
  authorityKeyId?: string;
  subjectDN?: ApiDistinguishedName;
  issuerDN?: ApiDistinguishedName;
  isCa?: boolean;
  level?: number; // Store the original level from API
  rawApiData?: ApiCaItem; // Optional: store raw for debugging or more details
  caType?: string;
  defaultIssuanceLifetime?: string;
  // Optional fields that will be parsed on demand
  signatureAlgorithm?: string;
  crlDistributionPoints?: string[];
  ocspUrls?: string[];
  caIssuersUrls?: string[];
  pathLenConstraint?: number | 'None';
  sans?: string[];
  keyUsage?: string[];
  extendedKeyUsage?: string[];
}

// OID Map for signature algorithms
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
    "2.5.29.37.0": "AnyExtendedKeyUsage",
};

const KEY_USAGE_NAMES = [
    "digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment",
    "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly", "decipherOnly"
];

const OID_MAP: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU",
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.10045.2.1": "EC",
  "1.2.840.10045.3.1.7": "P-256", "1.3.132.0.34": "P-384", "1.3.132.0.35": "P-521",
};

export function ab2hex(ab: ArrayBuffer, separator: string = '') {
  let arr = new Uint8Array(ab);
  // Trim leading 0x00 if present and length > 16
  if (arr.length > 16 && arr[0] === 0x00) {
    arr = arr.slice(1);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(separator);
}

const formatPkijsSubject = (subject: RelativeDistinguishedNames): string => {
  return subject.typesAndValues.map(tv => `${OID_MAP[tv.type] || tv.type}=${(tv.value as any).valueBlock.value}`).join(', ');
};

const formatPkijsPublicKeyInfo = (publicKeyInfo: PublicKeyInfo): string => {
  const algoOid = publicKeyInfo.algorithm.algorithmId;
  const algoName = OID_MAP[algoOid] || algoOid;
  let details = "";
  if (algoName === "EC" && publicKeyInfo.algorithm.parameters && (publicKeyInfo.algorithm.parameters as any).valueBlock) {
      const curveOid = (publicKeyInfo.algorithm.parameters as any).valueBlock.value as string;
      details = `(Curve: ${OID_MAP[curveOid] || curveOid})`;
  } else if (algoName === "RSA" && publicKeyInfo.parsedKey && (publicKeyInfo.parsedKey as any).modulus) {
      const modulusBytes = (publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex.byteLength;
      details = `(${(modulusBytes - (new Uint8Array((publicKeyInfo.parsedKey as any).modulus.valueBlock.valueHex)[0] === 0 ? 1:0)) * 8} bits)`;
  }
  return `${algoName} ${details}`;
};


export interface ParsedPemDetails {
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
    pathLenConstraint?: number | 'None';
    sans?: string[];
    keyUsage?: string[];
    extendedKeyUsage?: string[];
    subjectKeyId?: string;
    authorityKeyId?: string;
    fingerprintSha256?: string;
}

export async function parseCertificatePemDetails(pem: string): Promise<ParsedPemDetails> {
    const defaultResult: ParsedPemDetails = {
        subject: 'N/A',
        issuer: 'N/A',
        serialNumber: 'N/A',
        validFrom: new Date(0).toISOString(),
        validTo: new Date(0).toISOString(),
        publicKeyAlgorithm: 'N/A',
        signatureAlgorithm: 'N/A',
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
    };

    if (typeof window === 'undefined' || !pem) return defaultResult;

    try {
        const pemString = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
        const binaryString = window.atob(pemString);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const asn1 = asn1js.fromBER(bytes.buffer);
        if (asn1.offset === -1) {
            console.error("Failed to parse PEM: Invalid ASN.1 structure.");
            return defaultResult;
        }

        const certificate = new Certificate({ schema: asn1.result });
        
        // Calculate SHA-256 fingerprint of the raw DER buffer
        if (typeof window !== 'undefined' && window.crypto?.subtle) {
            try {
                const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer);
                defaultResult.fingerprintSha256 = ab2hex(hashBuffer, ':');
            } catch(e) { console.error("Could not calculate fingerprint", e); }
        }

        defaultResult.subject = formatPkijsSubject(certificate.subject);
        defaultResult.issuer = formatPkijsSubject(certificate.issuer);
        defaultResult.serialNumber = ab2hex(certificate.serialNumber.valueBlock.valueHex, ':');
        defaultResult.validFrom = certificate.notBefore.value.toISOString();
        defaultResult.validTo = certificate.notAfter.value.toISOString();
        defaultResult.publicKeyAlgorithm = formatPkijsPublicKeyInfo(certificate.subjectPublicKeyInfo);
        
        try {
            const signatureAlgorithmOid = certificate.signatureAlgorithm.algorithmId;
            defaultResult.signatureAlgorithm = SIG_OID_MAP[signatureAlgorithmOid] || signatureAlgorithmOid;
        } catch(e) { console.error("Failed to parse Signature Algorithm:", e); }

        try {
            const cdpExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.31");
            if (cdpExtension?.parsedValue) {
                const crls = cdpExtension.parsedValue as CRLDistributionPoints;
                crls.distributionPoints?.forEach((point: any) => {
                    if (point.distributionPoint && point.distributionPoint[0]) {
                        defaultResult.crlDistributionPoints.push(point.distributionPoint[0].value);
                    }
                });
            }
        } catch(e) { console.error("Failed to parse CRL Distribution Points:", e); }
        
        try {
            const aiaExtension = certificate.extensions?.find(ext => ext.extnID === "1.3.6.1.5.5.7.1.1");
            if (aiaExtension?.parsedValue) {
                const aia = aiaExtension.parsedValue;
                aia.accessDescriptions.forEach((desc: any) => {
                    if (desc.accessMethod === "1.3.6.1.5.5.7.48.1" && desc.accessLocation.type === 6) { // id-ad-ocsp
                        defaultResult.ocspUrls.push(desc.accessLocation.value);
                    } else if (desc.accessMethod === "1.3.6.1.5.5.7.48.2" && desc.accessLocation.type === 6) { // id-ad-caIssuers
                        defaultResult.caIssuersUrls.push(desc.accessLocation.value);
                    }
                });
            }
        } catch(e) { console.error("Failed to parse Authority Information Access:", e); }
        
        try {
            const bcExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.19");
            if (bcExtension?.parsedValue) {
                const basicConstraints = bcExtension.parsedValue as BasicConstraints;
                defaultResult.isCa = basicConstraints.cA;
                if (basicConstraints.pathLenConstraint !== undefined) {
                    defaultResult.pathLenConstraint = basicConstraints.pathLenConstraint;
                }
            }
        } catch(e) { console.error("Failed to parse Basic Constraints:", e); }
        
        try {
            const sanExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.17");
            if (sanExtension?.parsedValue) {
                const sanValue = sanExtension.parsedValue;
                if (sanValue.altNames && Array.isArray(sanValue.altNames)) {
                    sanValue.altNames.forEach(name => {
                        if (name.type === 1) defaultResult.sans.push(`Email: ${name.value}`);
                        else if (name.type === 2) defaultResult.sans.push(`DNS: ${name.value}`);
                        else if (name.type === 6) defaultResult.sans.push(`URI: ${name.value}`);
                        else if (name.type === 7) {
                            const ipBytes = Array.from(new Uint8Array(name.value.valueBlock.valueHex));
                            defaultResult.sans.push(`IP: ${ipBytes.join('.')}`);
                        }
                    });
                }
            }
        } catch(e) { console.error("Failed to parse Subject Alternative Names:", e); }
        
        try {
            const keyUsageExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.15");

            if (keyUsageExtension?.parsedValue) {
              const bitString = keyUsageExtension.parsedValue;
              const keyUsage = bitString.valueBlock.valueHex ? new Uint8Array(bitString.valueBlock.valueHex) : [];

              for (let i = 0; i < KEY_USAGE_NAMES.length; i++) {
                if (keyUsage.length && (keyUsage[Math.floor(i / 8)] & (1 << (7 - (i % 8))))) {
                  defaultResult.keyUsage.push(KEY_USAGE_NAMES[i]);
                }
              }
             }
        } catch(e) { console.error("Failed to parse Key Usage:", e); }
        
        try {
            const ekuExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.37");
            if (ekuExtension?.parsedValue) {
                const ekuValue = ekuExtension.parsedValue as ExtKeyUsage;
                ekuValue.keyPurposes.forEach((oid: string) => {
                    defaultResult.extendedKeyUsage.push(EKU_OID_MAP[oid] || oid);
                });
            }
        } catch(e) { console.error("Failed to parse Extended Key Usage:", e); }
        
        try {
            const skiExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.14");
            if (skiExtension?.parsedValue) {
                const ski = skiExtension.parsedValue;
                if (ski.valueBlock?.valueHex) {
                    defaultResult.subjectKeyId = ab2hex(ski.valueBlock.valueHex, ':');
                }
            }
        } catch(e) { console.error("Failed to parse Subject Key Identifier:", e); }

        try {
            const akiExtension = certificate.extensions?.find(ext => ext.extnID === "2.5.29.35");
            if (akiExtension?.parsedValue) {
                const aki = akiExtension.parsedValue as AuthorityKeyIdentifier;
                if (aki.keyIdentifier) {
                    if (aki.keyIdentifier.valueBlock?.valueHex) {
                        defaultResult.authorityKeyId = ab2hex(aki.keyIdentifier.valueBlock.valueHex, ':');
                    }
                }
            }
        } catch(e) { console.error("Failed to parse Authority Key Identifier:", e); }


        return defaultResult;

    } catch (e) {
        console.error("Fatal error during certificate parsing:", e);
        return defaultResult;
    }
}


// Helper to transform API CA item to local CA structure (without children)
function transformApiCaToLocalCa(apiCa: ApiCaItem): Omit<CA, 'children'> {
  let status: CA['status'] = 'unknown';
  const apiStatus = apiCa.certificate.status?.toUpperCase();
  if (apiStatus === 'ACTIVE') {
    status = new Date(apiCa.certificate.valid_to) < new Date() ? 'expired' : 'active';
  } else if (apiStatus === 'REVOKED') {
    status = 'revoked';
  } else if (apiStatus === 'EXPIRED') { // Assuming API might send EXPIRED
    status = 'expired';
  }

  let keyAlgorithm = apiCa.certificate.key_metadata.type;
  if (apiCa.certificate.key_metadata.bits) {
    keyAlgorithm += ` (${apiCa.certificate.key_metadata.bits} bit)`;
  } else if (apiCa.certificate.key_metadata.curve_name) {
    keyAlgorithm += ` (${apiCa.certificate.key_metadata.curve_name})`;
  }

  const pemData = typeof window !== 'undefined' ? window.atob(apiCa.certificate.certificate) : ''; // Decode base64 PEM

  let defaultIssuanceLifetime = 'Not Specified';
  if (apiCa.validity) {
      if (apiCa.validity.type === 'Duration' && apiCa.validity.duration) {
          defaultIssuanceLifetime = apiCa.validity.duration;
      } else if (apiCa.validity.type === 'Date' && apiCa.validity.time) {
          if (apiCa.validity.time.startsWith('9999-12-31')) {
              defaultIssuanceLifetime = 'Indefinite';
          } else {
              defaultIssuanceLifetime = apiCa.validity.time; // Pass ISO string to be formatted by component
          }
      } else if (apiCa.validity.type === "Indefinite") {
          defaultIssuanceLifetime = "Indefinite";
      }
  }


  return {
    id: apiCa.id,
    name: apiCa.certificate.subject.common_name || apiCa.id,
    issuer: apiCa.certificate.issuer_metadata.id === apiCa.id || apiCa.level === 0 ? 'Self-signed' : apiCa.certificate.issuer_metadata.id,
    expires: apiCa.certificate.valid_to,
    serialNumber: apiCa.certificate.serial_number,
    status,
    keyAlgorithm: keyAlgorithm,
    kmsKeyId: apiCa.certificate.engine_id,
    pemData: pemData,
    subjectKeyId: apiCa.certificate.subject_key_id,
    authorityKeyId: apiCa.certificate.authority_key_id,
    subjectDN: apiCa.certificate.subject,
    issuerDN: apiCa.certificate.issuer,
    isCa: apiCa.certificate.is_ca,
    level: apiCa.level,
    rawApiData: apiCa,
    caType: apiCa.certificate.type,
    defaultIssuanceLifetime: defaultIssuanceLifetime,
    // Parsed fields are intentionally left undefined for lazy parsing
  };
}

// Helper to build hierarchy from a flat list of CAs
function buildCaHierarchy(flatCaList: Omit<CA, 'children'>[]): CA[] {
  const caMap: Record<string, CA> = {};
  const roots: CA[] = [];

  // First pass: create a map and transform items to include children array
  flatCaList.forEach(apiCa => {
    caMap[apiCa.id] = { ...apiCa, children: [] };
  });

  // Second pass: build the hierarchy
  Object.values(caMap).forEach(ca => {
    if (ca.issuer && ca.issuer !== 'Self-signed' && caMap[ca.issuer]) {
      caMap[ca.issuer].children?.push(ca);
    } else if (ca.issuer === 'Self-signed' || !caMap[ca.issuer]) { // Root or orphan (orphans become roots)
      roots.push(ca);
    }
  });

  // Sort children by name for consistent display
  const sortChildrenRecursive = (nodes: CA[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(node => {
      if (node.children) {
        sortChildrenRecursive(node.children);
      }
    });
  };
  sortChildrenRecursive(roots);

  return roots;
}


// Function to fetch, transform, and build hierarchy
export async function fetchAndProcessCAs(accessToken: string, apiQueryString?: string): Promise<CA[]> {
    let allCAs: ApiCaItem[] = [];
    let nextBookmark: string | null = null;
    let hasNextPage = true;
    
    // Base URL setup
    const baseUrl = `${get_CA_API_BASE_URL()}/cas`;
    const initialParams = new URLSearchParams(apiQueryString);
    initialParams.set('page_size', '25');

    while (hasNextPage) {
        const url = new URL(baseUrl);
        initialParams.forEach((value, key) => {
            if(key !== 'bookmark') url.searchParams.append(key, value);
        });

        if (nextBookmark) {
            url.searchParams.set('bookmark', nextBookmark);
        }

        const response = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            let errorJson;
            let errorMessage = `Failed to fetch CAs page. HTTP error ${response.status}`;
            try {
                errorJson = await response.json();
                errorMessage += `: ${errorJson.err || errorJson.message || 'Unknown error'}`;
            } catch (e) {
                console.error("Failed to parse error response as JSON for CAs fetch:", e);
            }
            throw new Error(errorMessage);
        }

        const apiResponse: ApiResponseList = await response.json();
        
        if (apiResponse.list) {
            allCAs = allCAs.concat(apiResponse.list);
        }
        
        nextBookmark = apiResponse.next;
        hasNextPage = !!nextBookmark;
    }
    
    const transformedFlatList = allCAs.map(transformApiCaToLocalCa);
    return buildCaHierarchy(transformedFlatList);
}


// Helper function to get CA display name for issuer
export function getCaDisplayName(caId: string, allCAs: CA[]): string {
  if (caId === 'Self-signed') return 'Self-signed';

  const ca = findCaById(caId, allCAs);
  return ca ? ca.name : caId; // Fallback to ID if not found
}

// Helper function to find a CA by its ID in the tree
export function findCaById(id: string | undefined | null, cas: CA[]): CA | null {
  if (!id) return null;
  for (const ca of cas) {
    if (ca.id === id) return ca;
    if (ca.children) {
      const found = findCaById(id, ca.children);
      if (found) return found;
    }
  }
  return null;
}

// Helper function to find a CA by its common name in the tree (recursively)
export function findCaByCommonName(commonName: string | undefined | null, cas: CA[]): CA | null {
  if (!commonName) return null;
  for (const ca of cas) {
    // Ensure ca.name is used as it's the transformed common_name
    if (ca.name && ca.name.toLowerCase() === commonName.toLowerCase()) return ca;
    if (ca.children) {
      const found = findCaByCommonName(commonName, ca.children);
      if (found) return found;
    }
  }
  return null;
}

export async function fetchCryptoEngines(accessToken: string): Promise<ApiCryptoEngine[]> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/engines`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch crypto engines. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            if (errorJson && errorJson.err) {
                errorMessage = `Failed to fetch crypto engines: ${errorJson.err}`;
            } else if (errorJson && errorJson.message) {
                errorMessage = `Failed to fetch crypto engines: ${errorJson.message}`;
            }
        } catch (e) {
            console.error("Failed to parse error response as JSON for crypto engines:", e);
        }
        throw new Error(errorMessage);
    }
    const enginesData: ApiCryptoEngine[] = await response.json();
    return enginesData;
}

// Function to create a CA
export interface CreateCaPayload {
  parent_id: string | null;
  id: string;
  engine_id: string;
  subject: {
    country?: string;
    state_province?: string;
    locality?: string;
    organization?: string;
    organization_unit?: string;
    common_name: string;
  };
  key_metadata: {
    type: string;
    bits: number;
  };
  ca_expiration: { type: string; duration?: string; time?: string };
  issuance_expiration: { type: string; duration?: string; time?: string };
  ca_type: "MANAGED";
}

export async function createCa(payload: CreateCaPayload, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to create CA. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Failed to create CA: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      console.error("Failed to parse error response as JSON for CA creation:", e);
    }
    throw new Error(errorMessage);
  }
}

// Function and type for creating a CA Request
export interface CreateCaRequestPayload {
  parent_id: string;
  id: string;
  engine_id: string;
  subject: {
    country?: string;
    state_province?: string;
    locality?: string;
    organization?: string;
    organization_unit?: string;
    common_name: string;
  };
  key_metadata: {
    type: string;
    bits: number;
  };
  metadata: Record<string, any>;
}

export async function createCaRequest(payload: CreateCaRequestPayload, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to create CA request. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Failed to create CA request: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      console.error("Failed to parse error response as JSON for CA request creation:", e);
    }
    throw new Error(errorMessage);
  }
}

export interface CACertificateRequest {
    id: string;
    key_id: string;
    metadata: Record<string, any>;
    subject: { common_name: string };
    creation_ts: string;
    engine_id: string;
    key_metadata: { type: string; bits: number };
    status: 'PENDING' | 'ISSUED';
    fingerprint: string;
    csr: string; // Base64 encoded PEM
}

export async function fetchCaRequests(params: URLSearchParams, accessToken: string): Promise<{ list: CACertificateRequest[]; next: string | null }> {
    const url = `${get_CA_API_BASE_URL()}/cas/requests?${params.toString()}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch CA requests. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Failed to fetch requests: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch(e) { /* ignore */ }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function deleteCaRequest(requestId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/requests/${requestId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to delete CA request. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Deletion failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore json parse error */ }
        throw new Error(errorMessage);
    }
}


// Function and type for importing a CA
export interface ImportCaPayload {
  request_id?: string;
  id?: string;
  engine_id?: string;
  private_key?: string; // base64 encoded
  ca: string; // base64 encoded
  ca_chain?: string[]; // array of base64 encoded certs
  ca_type: "MANAGED" | "IMPORTED" | "EXTERNAL_PUBLIC";
  issuance_expiration?: { type: string; duration?: string; time?: string };
  parent_id?: string;
}

export async function importCa(payload: ImportCaPayload, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to import CA. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Failed to import CA: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      // Ignore if response is not JSON
    }
    throw new Error(errorMessage);
  }
}

export interface PatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: any;
}

export async function updateCaMetadata(caId: string, patchOperations: PatchOperation[], accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/metadata`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ patches: patchOperations }),
  });

  if (!response.ok) {
    let errorBody = 'Request failed.';
    try {
      const errJson = await response.json();
      errorBody = errJson.err || errJson.message || errorBody;
    } catch (e) { /* Ignore */ }
    throw new Error(`Failed to update CA metadata: ${errorBody} (Status: ${response.status})`);
  }
}

interface CaStats {
  ACTIVE: number;
  EXPIRED: number;
  REVOKED: number;
}
export async function fetchCaStats(caId: string, accessToken: string): Promise<CaStats> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/stats/${caId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorBody = 'Request failed.';
        try {
            const errJson = await response.json();
            errorBody = errJson.err || errJson.message || errorBody;
        } catch(e) { /* Ignore parsing error */ }
        throw new Error(`Failed to fetch CA statistics: ${errorBody} (Status: ${response.status})`);
    }
    return response.json();
}

export async function updateCaStatus(caId: string, status: 'ACTIVE' | 'REVOKED', reason?: string, accessToken?: string): Promise<void> {
    const body: { status: string; revocation_reason?: string } = { status };
    if (status === 'REVOKED' && reason) {
        body.revocation_reason = reason;
    }
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/status`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update CA status. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Status update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore json parse error */ }
        throw new Error(errorMessage);
    }
}

export async function revokeCa(caId: string, reason: string, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status: 'REVOKED', revocation_reason: reason }),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to revoke CA. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Revocation failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) { /* ignore json parse error */ }
    throw new Error(errorMessage);
  }
}


export async function deleteCa(caId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to delete CA. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Deletion failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore json parse error */ }
        throw new Error(errorMessage);
    }
}

export async function signCertificate(caId: string, payload: any, accessToken: string): Promise<any> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/certificates/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.err || `Failed to issue certificate. Status: ${response.status}`);
    }
    return result;
}

export async function fetchCaRequestById(requestId: string, accessToken: string): Promise<any> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/requests?filter=id[equal]${requestId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Failed to fetch CA request details.");
    const data = await response.json();
    const foundRequest = data.list?.[0];
    if (foundRequest) {
        return foundRequest;
    }
    throw new Error(`CA Request with ID "${requestId}" not found or is not pending.`);
}

export interface ApiKmsKey {
  id: string;
  algorithm: string;
  size: string;
  public_key: string;
  status: string;
  creation_ts: string;
}

export interface ApiKmsKeyListResponse {
  next: string | null;
  list: ApiKmsKey[];
}


export async function fetchKmsKeys(accessToken: string, apiQueryString?: string): Promise<ApiKmsKeyListResponse> {
    const url = `${get_CA_API_BASE_URL()}/kms/keys?${apiQueryString || ''}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch KMS keys. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Failed to fetch keys: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) { /* ignore */}
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function signWithKmsKey(keyId: string, payload: any, accessToken: string): Promise<any> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/kms/keys/${encodeURIComponent(keyId)}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.err || result.message || `Signing failed with status ${response.status}`);
    }
    return result;
}

export async function verifyWithKmsKey(keyId: string, payload: any, accessToken: string): Promise<{ valid: boolean }> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/kms/keys/${encodeURIComponent(keyId)}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Verification failed with status ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Verification failed: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) { /* ignore json parse error */ }
        throw new Error(errorMessage);
    }

    return response.json();
}


export async function createKmsKey(payload: { engine_id: string; algorithm: string; size: number; name: string }, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/kms/keys`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to create key. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Key creation failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore json parse error */ }
        throw new Error(errorMessage);
    }
}

export async function updateCaDefaultProfileId(caId: string, profileId: string | null, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/cas/${caId}/issuance-profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update issuance expiration. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore json parse error */ }
        throw new Error(errorMessage);
    }
}

export interface CaStatsSummaryResponse {
  cas: { total: number };
  certificates: { total: number };
}

export async function fetchCaStatsSummary(accessToken: string): Promise<CaStatsSummaryResponse> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/stats`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return handleApiError(response, 'Failed to fetch CA stats');
}

export async function fetchDevManagerStats(accessToken: string): Promise<{ total: number }> {
    const response = await fetch(`${get_DEV_MANAGER_API_BASE_URL()}/stats`, { 
        headers: { 'Authorization': `Bearer ${accessToken}` } 
    });
    return handleApiError(response, 'Failed to fetch Device stats');
}

// --- Signing Profiles ---

export interface ApiSigningProfile {
    id: string;
	name: string;
	description: string;
	validity: {
		type: string;
		duration: string;
		validity_from?: string;
	};
	sign_as_ca: boolean;
	honor_key_usage: boolean;
	key_usage: string[];
	honor_extended_key_usage: boolean;
	extended_key_usage: string[];
	honor_subject: boolean;
	subject: {
		organization?: string;
		organizational_unit?: string;
		country?: string;
		locality?: string;
		state?: string;
	};
	honor_extensions: boolean;
    crypto_enforcement: {
        enabled: boolean;
        allow_rsa_keys: boolean;
        allow_ecdsa_keys: boolean;
        allowed_rsa_key_sizes?: number[];
        allowed_ecdsa_key_sizes?: number[];
    };
}

export interface ApiSigningProfileListResponse {
  next: string | null;
  list: ApiSigningProfile[];
}

export async function fetchSigningProfiles(accessToken: string, params?: URLSearchParams): Promise<ApiSigningProfileListResponse> {
    const url = new URL(`${get_CA_API_BASE_URL()}/profiles`);
    if (params) {
        params.forEach((value, key) => url.searchParams.append(key, value));
    }
    
    const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch signing profiles. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Failed to fetch profiles: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) { /* ignore */}
        throw new Error(errorMessage);
    }
    const data = await response.json();
    return data.list || [];
}

export interface CreateSigningProfilePayload {
    name: string;
    description?: string;
    validity: {
        type: "Duration" | "Date";
        duration?: string;
        time?: string;
    };
    sign_as_ca: boolean;
    honor_key_usage: boolean;
    key_usage: string[];
    honor_extended_key_usage: boolean;
    extended_key_usage: string[];
    honor_subject: boolean;
    subject?: {
        organization?: string;
        organizational_unit?: string;
        country?: string;
        state?: string;
    };
    honor_extensions: boolean;
    crypto_enforcement: {
        enabled: boolean;
        allow_rsa_keys: boolean;
        allow_ecdsa_keys: boolean;
        allowed_rsa_key_sizes?: number[];
        allowed_ecdsa_key_sizes?: number[];
    };
}

export async function createSigningProfile(payload: CreateSigningProfilePayload, accessToken: string): Promise<ApiSigningProfile> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to create signing profile. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Profile creation failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage);
    }
}

export async function fetchSigningProfileById(profileId: string, accessToken: string): Promise<ApiSigningProfile> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles/${profileId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to fetch signing profile. HTTP error ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Failed to fetch profile: ${errorJson.err || errorJson.message || 'Unknown API error'}`;
        } catch(e) { /* ignore */}
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function updateSigningProfile(profileId: string, payload: CreateSigningProfilePayload, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles/${profileId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to update signing profile. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Profile update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage);
    }
}

export async function deleteSigningProfile(profileId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${get_CA_API_BASE_URL()}/profiles/${profileId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
    });
    if (!response.ok) {
        let errorJson;
        let errorMessage = `Failed to delete signing profile. Status: ${response.status}`;
        try {
            errorJson = await response.json();
            errorMessage = `Profile deletion failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
        } catch (e) { /* ignore */ }
        throw new Error(errorMessage);
    }
}
