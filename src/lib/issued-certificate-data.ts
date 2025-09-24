
import type { CertificateData } from '@/types/certificate';
import { get_CA_API_BASE_URL } from './api-domains';
import { parseCertificatePemDetails } from './ca-data';


// API Response Structures for Issued Certificates
interface ApiKeyMetadata {
  type: string;
  bits?: number;
  curve_name?: string;
  strength?: string;
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

export interface ApiIssuedCertificateItem {
  serial_number: string;
  subject_key_id: string;
  authority_key_id: string;
  metadata: Record<string, any>;
  status: string;                
  certificate: string;           
  key_metadata: ApiKeyMetadata;  
  subject: ApiDistinguishedName; 
  issuer: ApiDistinguishedName;  
  valid_from: string;            
  issuer_metadata: ApiIssuerMetadata; 
  valid_to: string;              
  revocation_timestamp?: string; 
  revocation_reason?: string;   
  type?: string;                  
  engine_id?: string;             
  is_ca: boolean;                
}

export interface ApiIssuedCertificateListResponse {
  next: string | null;
  list: ApiIssuedCertificateItem[];
}

async function transformApiIssuedCertificateToLocal(apiCert: ApiIssuedCertificateItem): Promise<CertificateData> {
  let publicKeyAlgorithm = apiCert.key_metadata.type;
  if (apiCert.key_metadata.bits) {
    publicKeyAlgorithm += ` (${apiCert.key_metadata.bits} bit)`;
  } else if (apiCert.key_metadata.curve_name) {
    publicKeyAlgorithm += ` (${apiCert.key_metadata.curve_name})`;
  }

  const subjectDisplay = apiCert.subject.common_name || `SN:${apiCert.serial_number}`;
  const issuerDisplay = apiCert.issuer.common_name || `CA_ID:${apiCert.issuer_metadata.id}`;

  let pemData = '';
  if (typeof window !== 'undefined' && apiCert.certificate) {
    try {
      pemData = window.atob(apiCert.certificate);
    } catch (e) {
      console.error("Failed to decode base64 PEM data for SN:", apiCert.serial_number, e);
      pemData = "Error: Could not decode PEM data.";
    }
  }
  
  const subjectDNParts: string[] = [];
  if (apiCert.subject.common_name) subjectDNParts.push(`CN=${apiCert.subject.common_name}`);
  if (apiCert.subject.organization) subjectDNParts.push(`O=${apiCert.subject.organization}`);
  if (apiCert.subject.organization_unit) subjectDNParts.push(`OU=${apiCert.subject.organization_unit}`);
  if (apiCert.subject.locality) subjectDNParts.push(`L=${apiCert.subject.locality}`);
  if (apiCert.subject.state) subjectDNParts.push(`ST=${apiCert.subject.state}`);
  if (apiCert.subject.country) subjectDNParts.push(`C=${apiCert.subject.country}`);
  const fullSubject = subjectDNParts.join(', ');

  const issuerDNParts: string[] = [];
  if (apiCert.issuer.common_name) issuerDNParts.push(`CN=${apiCert.issuer.common_name}`);
  if (apiCert.issuer.organization) issuerDNParts.push(`O=${apiCert.issuer.organization}`);
  if (apiCert.issuer.organization_unit) issuerDNParts.push(`OU=${apiCert.issuer.organization_unit}`);
  const fullIssuer = issuerDNParts.join(', ');
  
  // Parse the PEM to extract additional details like OCSP URLs
  const parsedDetails = await parseCertificatePemDetails(pemData);

  return {
    id: apiCert.serial_number, 
    fileName: `${subjectDisplay.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'certificate'}.pem`,
    subject: fullSubject || subjectDisplay, 
    issuer: fullIssuer || issuerDisplay,
    serialNumber: apiCert.serial_number,
    validFrom: apiCert.valid_from,
    validTo: apiCert.valid_to,
    pemData: pemData,
    apiStatus: apiCert.status,
    revocationReason: apiCert.revocation_reason,
    revocationTimestamp: apiCert.revocation_timestamp,
    publicKeyAlgorithm,
    fingerprintSha256: parsedDetails.fingerprintSha256,
    issuerCaId: apiCert.issuer_metadata.id,
    rawApiData: apiCert,
    // Populate fields from parsed details
    sans: parsedDetails.sans,
    signatureAlgorithm: parsedDetails.signatureAlgorithm,
    ocspUrls: parsedDetails.ocspUrls,
    crlDistributionPoints: parsedDetails.crlDistributionPoints,
    caIssuersUrls: parsedDetails.caIssuersUrls,
    keyUsage: parsedDetails.keyUsage,
    extendedKeyUsage: parsedDetails.extendedKeyUsage,
  };
}

interface FetchIssuedCertificatesParams {
  accessToken: string;
  apiQueryString?: string;
  forCaId?: string; 
}

export async function fetchIssuedCertificates(
  params: FetchIssuedCertificatesParams
): Promise<{ certificates: CertificateData[]; nextToken: string | null }> {
  const { accessToken, apiQueryString, forCaId } = params;
  
  const baseUrl = forCaId
    ? `${get_CA_API_BASE_URL()}/cas/${forCaId}/certificates`
    : `${get_CA_API_BASE_URL()}/certificates`;
  
  const finalQueryString = apiQueryString || 'sort_by=valid_from&sort_mode=desc&page_size=10';

  const response = await fetch(`${baseUrl}?${finalQueryString}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to fetch issued certificates. HTTP error ${response.status}`;
    try {
      errorJson = await response.json();
      if (errorJson && errorJson.err) {
        errorMessage = `Failed to fetch issued certificates: ${errorJson.err}`;
      } else if (errorJson && errorJson.message) {
        errorMessage = `Failed to fetch issued certificates: ${errorJson.message}`;
      }
    } catch (e) {
      console.error("Failed to parse error response as JSON for fetchIssuedCertificates:", e);
    }
    throw new Error(errorMessage);
  }

  const apiResponse: ApiIssuedCertificateListResponse = await response.json();
  if (!apiResponse.list) {
    console.warn("API response for issued certificates is missing 'list' property:", apiResponse);
    return { certificates: [], nextToken: null };
  }

  const certificates = await Promise.all(
    apiResponse.list.map(transformApiIssuedCertificateToLocal)
  );
  return { certificates, nextToken: apiResponse.next };
}

// Helper to find a certificate by serial number from a list
export function findCertificateBySerialNumber(serialNumber: string, certificates: CertificateData[]): CertificateData | null {
  return certificates.find(cert => cert.serialNumber === serialNumber) || null;
}

// Shared function to update certificate status (revoke or re-activate)
interface UpdateStatusParams {
  serialNumber: string;
  status: 'ACTIVE' | 'REVOKED';
  reason?: string;
  accessToken: string;
}

export async function updateCertificateStatus({
  serialNumber,
  status,
  reason,
  accessToken,
}: UpdateStatusParams): Promise<void> {
  const body: { status: 'ACTIVE' | 'REVOKED', revocation_reason?: string } = { status };
  if (status === 'REVOKED' && reason) {
    body.revocation_reason = reason;
  }
  
  // The API endpoint expects the serial number with hyphens instead of colons.
  const apiFormattedSerialNumber = serialNumber.replace(/:/g, '-');
  
  const response = await fetch(`${get_CA_API_BASE_URL()}/certificates/${apiFormattedSerialNumber}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorBody = 'Request failed.';
    try {
      const errJson = await response.json();
      errorBody = errJson.err || errJson.message || errorBody;
    } catch (e) { /* Ignore parsing error */ }
    
    const actionText = status === 'REVOKED' ? 'revoke' : 're-activate';
    throw new Error(`Failed to ${actionText} certificate: ${errorBody} (Status: ${response.status})`);
  }
}

export async function updateCertificateMetadata(serialNumber: string, metadata: object, accessToken: string): Promise<void> {
  const apiFormattedSerialNumber = serialNumber.replace(/:/g, '-');
  const response = await fetch(`${get_CA_API_BASE_URL()}/certificates/${apiFormattedSerialNumber}/metadata`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    let errorBody = 'Request failed.';
    try {
      const errJson = await response.json();
      errorBody = errJson.err || errJson.message || errorBody;
    } catch (e) { /* Ignore */ }
    throw new Error(`Failed to update certificate metadata: ${errorBody} (Status: ${response.status})`);
  }
}

// Import Certificate Types
export interface ImportCertificateBody {
  metadata: Record<string, any>;
  certificate: string; // Base64 encoded certificate
}

export async function importCertificate(payload: ImportCertificateBody, accessToken: string): Promise<void> {
  const response = await fetch(`${get_CA_API_BASE_URL()}/certificates/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorBody = 'Request failed.';
    try {
      const errJson = await response.json();
      errorBody = errJson.err || errJson.message || errorBody;
    } catch (e) { /* Ignore parsing error */ }
    throw new Error(`Failed to import certificate: ${errorBody} (Status: ${response.status})`);
  }
}

export async function deleteCertificate(serialNumber: string, accessToken: string): Promise<void> {
    const apiFormattedSerialNumber = serialNumber.replace(/:/g, '');
    const response = await fetch(`${get_CA_API_BASE_URL()}/certificates/${apiFormattedSerialNumber}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        let errorBody = 'Request failed.';
        try {
            const errJson = await response.json();
            errorBody = errJson.err || errJson.message || errorBody;
        } catch (e) { /* Ignore */ }
        throw new Error(`Failed to delete certificate: ${errorBody} (Status: ${response.status})`);
    }
}
