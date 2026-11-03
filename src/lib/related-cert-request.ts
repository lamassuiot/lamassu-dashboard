import {
  buildRelatedCertTbs,
  decodeHexOrBase64,
  encodeIssuerName,
  normalizeRelatedCertSignature,
  parseRelatedCertificate,
  type IssuerNameFields,
  type ParsedRelatedCertificate,
  type RelatedCertRequestParams,
} from '@/lib-crypto';
import type { ApiSigningProfile } from '@/lib/ca-data';
import { parseDurationToSeconds } from '@/lib/duration';

/** Matches the backend default when a profile does not set `related_certificate.max_age`. */
export const DEFAULT_RELATED_CERT_MAX_AGE_SECONDS = 5 * 60;

/** Raw, as-typed values of the related certificate request form. */
export interface RelatedCertRequestInput {
  /** Optional related certificate (PEM). Fills in the exact issuer and serial. */
  certPem: string;
  issuerMode: 'fields' | 'der';
  issuerFields: IssuerNameFields;
  /** Issuer Name as hex or base64 DER. */
  issuerDer: string;
  serialHex: string;
  /** Unix seconds; part of the signed data. */
  requestTime: number;
  /** One URI per line. */
  locationText: string;
  /** Hex or base64 signature over the data to sign. */
  signature: string;
}

export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createEmptyRelatedCertRequestInput(): RelatedCertRequestInput {
  return {
    certPem: '',
    issuerMode: 'fields',
    issuerFields: {},
    issuerDer: '',
    serialHex: '',
    requestTime: nowUnixSeconds(),
    locationText: '',
    signature: '',
  };
}

export interface ResolvedRelatedCertRequest {
  /** Ready for the CSR builder; present only when every input is valid. */
  params?: RelatedCertRequestParams;
  /** The bytes the related certificate's key must sign; present once issuer and serial are valid. */
  dataToSign?: Uint8Array;
  /** Fields still missing or invalid. They block issuing. */
  errors: string[];
  /** Problems that do not block, e.g. the typed issuer differs from the pasted certificate. */
  warnings: string[];
}

export function splitLocationInfo(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function normalizeSerialHex(value: string): string {
  return value.replaceAll(/[\s:]/g, '').replace(/^0x/i, '').toLowerCase();
}

/** The maximum accepted age of the attribute, from the profile (backend default: 5 minutes). */
export function getRelatedCertMaxAgeSeconds(profile?: Pick<ApiSigningProfile, 'related_certificate'> | null): number {
  const maxAge = profile?.related_certificate?.max_age;
  const seconds = maxAge ? parseDurationToSeconds(maxAge) : null;
  return seconds && seconds > 0 ? seconds : DEFAULT_RELATED_CERT_MAX_AGE_SECONDS;
}

/** The related certificate typed or pasted by the user, or null when empty or unparseable. */
export function tryParseRelatedCertificate(pem: string): ParsedRelatedCertificate | null {
  if (!pem.trim()) return null;
  try {
    return parseRelatedCertificate(pem);
  } catch {
    return null;
  }
}

/** Validates the form and, when complete, assembles the attribute parameters and the data to sign. */
export function resolveRelatedCertRequest(input: RelatedCertRequestInput): ResolvedRelatedCertRequest {
  const errors: string[] = [];
  const warnings: string[] = [];

  let certificate: ParsedRelatedCertificate | undefined;
  if (input.certPem.trim()) {
    try {
      certificate = parseRelatedCertificate(input.certPem);
    } catch (e: any) {
      errors.push(`Related certificate: ${e.message ?? 'could not be parsed.'}`);
    }
  }

  // A parsed certificate is authoritative: issuer and serial come from it and the typed values are ignored.
  let issuerDer: Uint8Array | undefined = certificate?.issuerDer;
  if (!certificate) {
    if (input.issuerMode === 'der') {
      if (input.issuerDer.trim()) {
        try {
          issuerDer = decodeHexOrBase64(input.issuerDer);
          if (issuerDer[0] !== 0x30) throw new Error('not a DER SEQUENCE');
        } catch (e: any) {
          issuerDer = undefined;
          errors.push(`Related certificate issuer: ${e.message === 'not a DER SEQUENCE' ? 'the DER must be a Name (SEQUENCE).' : e.message}`);
        }
      }
    } else if (Object.values(input.issuerFields).some(value => value?.trim())) {
      issuerDer = encodeIssuerName(input.issuerFields);
    }
    if (!issuerDer && !errors.some(e => e.startsWith('Related certificate issuer'))) {
      errors.push('Related certificate issuer is required.');
    }
  }

  let serialHex = certificate ? certificate.serialHex : normalizeSerialHex(input.serialHex);
  if (!serialHex) {
    errors.push('Related certificate serial number is required.');
  } else if (!/^[0-9a-f]+$/.test(serialHex)) {
    errors.push('Related certificate serial number must be hexadecimal.');
    serialHex = '';
  }

  if (!Number.isSafeInteger(input.requestTime) || input.requestTime <= 0) {
    errors.push('Request time must be a positive unix timestamp (seconds).');
  }

  const locationInfo = splitLocationInfo(input.locationText);
  if (locationInfo.length === 0) {
    errors.push('Add at least one location URI for the related certificate.');
  } else {
    for (const uri of locationInfo) {
      if (!/^[\x20-\x7e]+$/.test(uri)) {
        errors.push(`Location "${uri}" must contain printable ASCII characters only.`);
      } else if (!/^(data:|https?:\/\/)/i.test(uri)) {
        errors.push(`Location "${uri}" must be a data: or http(s) URI.`);
      }
    }
  }

  let dataToSign: Uint8Array | undefined;
  if (issuerDer && serialHex && Number.isSafeInteger(input.requestTime) && input.requestTime > 0) {
    dataToSign = buildRelatedCertTbs({ issuerDer, serialHex, requestTime: input.requestTime });
  }

  let signature: Uint8Array | undefined;
  if (!input.signature.trim()) {
    errors.push('Related certificate signature is required.');
  } else {
    try {
      signature = normalizeRelatedCertSignature(decodeHexOrBase64(input.signature), certificate?.publicKeyAlgorithm);
    } catch (e: any) {
      errors.push(`Related certificate signature: ${e.message}`);
    }
  }

  const params = errors.length === 0 && issuerDer && serialHex && signature
    ? { issuerDer, serialHex, requestTime: input.requestTime, locationInfo, signature }
    : undefined;
  return { params, dataToSign, errors, warnings };
}
