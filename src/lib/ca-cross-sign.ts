import { add, type Duration } from 'date-fns';
import type { CA, CreateCaPayload } from './ca-data';
import { getEffectiveCaStatus, toApiCaExpiration, type CaStatusFilter } from './ca-utils';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';

/**
 * Cross-signing issues the target CA a second certificate for its existing key pair, signed by the
 * signer CA. The backend has no dedicated endpoint: creating a CA that reuses the target's KMS key
 * (`key_metadata.key_id` = its SKI, which is the KMS key ID) under `parent_id` = signer does exactly
 * that. Both CAs therefore need their private key in the KMS.
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
  expiration: ExpirationConfig;
}

/** Create-CA request for the target's key, subject unchanged, issued by the signer. */
export function buildCrossSignPayload({ signer, target, id, profileId, expiration }: CrossSignPayloadInput): CreateCaPayload {
  const dn = target.subjectDN;
  return {
    id,
    parent_id: signer.id,
    engine_id: target.kmsKeyId ?? '',
    profile_id: profileId,
    // The subject must match the target's so chains can be built through either certificate.
    subject: {
      common_name: dn?.common_name || target.name,
      organization: dn?.organization || undefined,
      organization_unit: dn?.organization_unit || undefined,
      country: dn?.country || undefined,
      state: dn?.state || undefined,
      locality: dn?.locality || undefined,
    },
    key_metadata: { key_id: target.subjectKeyId ?? '' },
    ca_expiration: toApiCaExpiration(expiration),
    ca_type: 'MANAGED',
  };
}
