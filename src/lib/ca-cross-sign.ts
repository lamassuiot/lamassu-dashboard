import { add, type Duration } from 'date-fns';
import type { CA, CreateCaPayload } from './ca-data';
import { getEffectiveCaStatus, toApiCaExpiration, type CaStatusFilter } from './ca-utils';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';
import { parseCertificateSubjectRdns, publicKeySha256Hex, type NameAttribute } from '@/lib-crypto';

/**
 * Cross-signing issues the target CA a second certificate for its existing key pair, signed by the
 * signer CA. The backend has no dedicated endpoint: creating a CA that reuses the target's KMS key
 * (`key_metadata.key_id`) under `parent_id` = signer does exactly that. Both CAs therefore need their
 * private key in the KMS.
 */

export type CrossSignRole = 'signer' | 'target';

const KEY_HOLDING_CA_TYPES: ReadonlySet<string> = new Set(['MANAGED', 'IMPORTED_WITH_KEY']);

const INELIGIBLE_STATUS_LABELS: Record<Exclude<CaStatusFilter, 'active'>, string> = {
  expired: 'Expired CAs',
  revoked: 'Revoked CAs',
  unknown: 'CAs with unknown status',
};

const otherRole = (role: CrossSignRole): CrossSignRole => (role === 'signer' ? 'target' : 'signer');

/** Whether the KMS holds this CA's private key, so Lamassu can sign with it. */
export function caHasPrivateKey(ca: Pick<CA, 'caType'>): boolean {
  return !!ca.caType && KEY_HOLDING_CA_TYPES.has(ca.caType);
}

/**
 * Why `ca` cannot take `role` in a cross-sign, or null when it can. `counterpart` is the CA already
 * chosen for the other role, if any.
 */
export function getCrossSignBlocker(ca: CA, role: CrossSignRole, counterpart?: CA | null, now: number = Date.now()): string | null {
  if (!caHasPrivateKey(ca)) return 'Private key not in the KMS';
  if (!ca.subjectKeyId) return 'Certificate has no Subject Key Identifier';
  const status = getEffectiveCaStatus(ca, now);
  if (status !== 'active') {
    return role === 'signer' ? `${INELIGIBLE_STATUS_LABELS[status]} cannot sign` : `${INELIGIBLE_STATUS_LABELS[status]} cannot be cross-signed`;
  }
  if (counterpart) {
    if (counterpart.id === ca.id) return `Already selected as the ${otherRole(role)}`;
    if (counterpart.subjectKeyId === ca.subjectKeyId) return `Shares its key with the selected ${otherRole(role)}`;
  }
  return null;
}

/**
 * The KMS key ID of the CA's key pair: the hex SHA-256 of its DER SubjectPublicKeyInfo. CAs created by
 * Lamassu use this value as their SKI, but imported CAs keep the SKI they came with (usually a SHA-1),
 * so it is derived from the certificate instead. Null when the certificate cannot be parsed.
 */
export async function getKmsKeyId(ca: Pick<CA, 'pemData'>): Promise<string | null> {
  return ca.pemData ? publicKeySha256Hex(ca.pemData) : null;
}

type CrossSignSubject = CreateCaPayload['subject'];

/** The subject attributes the backend writes (Go's `pkix.Name`), in the order it writes them. */
const BACKEND_SUBJECT_ATTRIBUTES: readonly { field: keyof CrossSignSubject; type: string; label: string }[] = [
  { field: 'country', type: '2.5.4.6', label: 'C' },
  { field: 'state', type: '2.5.4.8', label: 'ST' },
  { field: 'locality', type: '2.5.4.7', label: 'L' },
  { field: 'organization', type: '2.5.4.10', label: 'O' },
  { field: 'organization_unit', type: '2.5.4.11', label: 'OU' },
  { field: 'common_name', type: '2.5.4.3', label: 'CN' },
];

const OTHER_ATTRIBUTE_LABELS: Record<string, string> = {
  '0.9.2342.19200300.100.1.25': 'DC',
  '0.9.2342.19200300.100.1.1': 'UID',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '2.5.4.5': 'serialNumber',
  '2.5.4.9': 'street',
  '2.5.4.17': 'postalCode',
};

const UTF8_STRING_TAG = 12;
const PRINTABLE_STRING_TAG = 19;
/** Characters Go encodes as a PrintableString; anything else makes it a UTF8String. */
const GO_PRINTABLE = /^[A-Za-z0-9 '()+,\-./:=?]*$/;

const attributeLabel = (type: string) =>
  BACKEND_SUBJECT_ATTRIBUTES.find(a => a.type === type)?.label ?? OTHER_ATTRIBUTE_LABELS[type] ?? type;

/** The subject sent for the cross certificate: the target's, as far as the API can express it. */
export function crossSignSubject(target: CA): CrossSignSubject {
  const dn = target.subjectDN;
  return {
    common_name: dn?.common_name || target.name,
    organization: dn?.organization || undefined,
    organization_unit: dn?.organization_unit || undefined,
    country: dn?.country || undefined,
    state: dn?.state || undefined,
    locality: dn?.locality || undefined,
  };
}

/** The RDNs the backend encodes for `subject`: one attribute per RDN, empty fields skipped. */
export function backendSubjectRdns(subject: CrossSignSubject): NameAttribute[][] {
  return BACKEND_SUBJECT_ATTRIBUTES.flatMap(({ field, type }) => {
    const value = subject[field];
    if (!value) return [];
    return [[{ type, value, tag: GO_PRINTABLE.test(value) ? PRINTABLE_STRING_TAG : UTF8_STRING_TAG }]];
  });
}

export type SubjectReproduction =
  | { status: 'identical' }
  /** Same attributes and values, but some use another string type, so the encoded names differ. */
  | { status: 'encoding-differs' }
  | { status: 'differs'; reason: string };

/**
 * Whether the backend's encoding of a subject matches the original certificate's. Chains are built by
 * matching a certificate's issuer name to its CA's subject name, so a cross certificate is only useful
 * when its subject reproduces the target's.
 */
export function compareSubjectRdns(original: NameAttribute[][], reproduced: NameAttribute[][]): SubjectReproduction {
  if (original.some(rdn => rdn.length > 1)) {
    return { status: 'differs', reason: 'its subject has a multi-valued RDN' };
  }
  const originalAttributes = original.flat();
  const reproducedAttributes = reproduced.flat();
  const sameAttributes = originalAttributes.length === reproducedAttributes.length
    && originalAttributes.every((a, i) => a.type === reproducedAttributes[i].type && a.value === reproducedAttributes[i].value);
  if (sameAttributes) {
    return originalAttributes.every((a, i) => a.tag === reproducedAttributes[i].tag) ? { status: 'identical' } : { status: 'encoding-differs' };
  }

  const unsupported = [...new Set(originalAttributes
    .filter(a => !BACKEND_SUBJECT_ATTRIBUTES.some(b => b.type === a.type))
    .map(a => attributeLabel(a.type)))];
  if (unsupported.length > 0) {
    return { status: 'differs', reason: `its subject has attributes Lamassu cannot reproduce (${unsupported.join(', ')})` };
  }
  const repeated = [...new Set(originalAttributes
    .filter((a, i) => originalAttributes.findIndex(b => b.type === a.type) !== i)
    .map(a => attributeLabel(a.type)))];
  if (repeated.length > 0) {
    return { status: 'differs', reason: `its subject has more than one ${repeated.join(', ')} attribute` };
  }
  return { status: 'differs', reason: 'its subject attributes are not in the C, ST, L, O, OU, CN order Lamassu writes' };
}

export interface CrossSignTargetCheck {
  /** KMS key ID of the target's key pair; null when its certificate cannot be read. */
  keyId: string | null;
  /** Null when its certificate cannot be read. */
  subject: SubjectReproduction | null;
}

/** Reads the target's certificate to check that a cross certificate can reproduce it. */
export async function checkCrossSignTarget(target: CA): Promise<CrossSignTargetCheck> {
  const rdns = target.pemData ? parseCertificateSubjectRdns(target.pemData) : null;
  return {
    keyId: await getKmsKeyId(target),
    subject: rdns ? compareSubjectRdns(rdns, backendSubjectRdns(crossSignSubject(target))) : null,
  };
}

/** Active certificates for the target's key that the signer's key has already issued. */
export function findExistingCrossSigns(signer: CA, target: CA, allCas: readonly CA[], now: number = Date.now()): CA[] {
  return allCas.filter(ca =>
    ca.subjectKeyId === target.subjectKeyId
    && ca.authorityKeyId === signer.subjectKeyId
    && getEffectiveCaStatus(ca, now) === 'active');
}

/** Starts at the target's own expiry, capped so the cross certificate never outlives the signer. */
export function defaultCrossSignExpiration(signer: CA, target: CA): ExpirationConfig {
  const expires = Math.min(new Date(signer.expires).getTime(), new Date(target.expires).getTime());
  return { type: 'Date', dateValue: new Date(expires) };
}

const DURATION_UNITS: Record<string, keyof Duration> = { y: 'years', w: 'weeks', d: 'days', h: 'hours', m: 'minutes', s: 'seconds' };

/** The instant an expiration resolves to when issued at `now`; null for indefinite or incomplete input. */
export function resolveExpirationDate(config: ExpirationConfig, now: Date = new Date()): Date | null {
  if (config.type === 'Date') return config.dateValue ?? null;
  if (config.type !== 'Duration' || !config.durationValue) return null;
  const duration: Duration = {};
  for (const [, value, unit] of config.durationValue.matchAll(/(\d+)([ywdhms])/g)) {
    duration[DURATION_UNITS[unit]] = Number.parseInt(value, 10);
  }
  return add(now, duration);
}

/** True when the cross certificate would stay valid after the signer expires (or never expire). */
export function outlivesSigner(expiration: ExpirationConfig, signer: CA, now: Date = new Date()): boolean {
  if (expiration.type === 'Indefinite') return true;
  const expires = resolveExpirationDate(expiration, now);
  return !!expires && expires.getTime() > new Date(signer.expires).getTime();
}

interface CrossSignPayloadInput {
  signer: CA;
  target: CA;
  /** ID of the CA entry that will hold the cross certificate. */
  id: string;
  /** Default issuance profile for certificates issued by the new CA entry. */
  profileId: string;
  /** KMS key ID of the target's key pair, from {@link getKmsKeyId}. */
  keyId: string;
  expiration: ExpirationConfig;
}

/** Create-CA request for the target's key, subject unchanged, issued by the signer. */
export function buildCrossSignPayload({ signer, target, id, profileId, keyId, expiration }: CrossSignPayloadInput): CreateCaPayload {
  return {
    id,
    parent_id: signer.id,
    engine_id: target.kmsKeyId ?? '',
    profile_id: profileId,
    // The subject must match the target's so chains can be built through either certificate.
    subject: crossSignSubject(target),
    key_metadata: { key_id: keyId },
    ca_expiration: toApiCaExpiration(expiration),
    ca_type: 'MANAGED',
  };
}
