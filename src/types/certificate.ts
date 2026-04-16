
export interface CertificateData {
  id: string; // Using serial number as ID from API
  fileName: string; // Synthesized
  subject: string; // Common Name or fallback
  issuer: string; // Issuer Common Name or fallback
  serialNumber: string;
  hasPrivateKey?: boolean;
  validFrom: string; // ISO date string
  validTo: string; // ISO date string
  pemData: string;
  publicKeyAlgorithm?: string;
  fingerprintSha256?: string;
  issuerCaId?: string; // ID of the CA that issued this certificate
  apiStatus?: string; // To store the raw status from the API
  revocationReason?: string;
  revocationTimestamp?: string;
  rawApiData?: any; // To store the original API response for this certificate
  // Optional fields that will be parsed on demand
  sans?: string[]; 
  signatureAlgorithm?: string;
  ocspUrls?: string[]; 
  crlDistributionPoints?: string[];
  caIssuersUrls?: string[];
  keyUsage?: string[];
  extendedKeyUsage?: string[];
}
