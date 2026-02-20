import type { X509AuthConfig, X509CaTrustIdentityType, X509MatchMode } from '@/types/authz';

const normalizeIdentityType = (value: unknown): X509CaTrustIdentityType => {
  if (value === 'authority_key_id') return 'authority_key_id';
  return 'fingerprint';
};

const normalizeMatchMode = (value: unknown): X509MatchMode => {
  if (value === 'serial_and_ca') return 'serial_and_ca';
  if (value === 'cn_and_ca' || value === 'cn') return 'cn_and_ca';
  return 'any_from_ca';
};

const trimString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

export const normalizeX509AuthConfig = (value: unknown): X509AuthConfig => {
  const config = (value || {}) as any;

  const identityType = normalizeIdentityType(
    config?.ca_trust?.identity_type ?? config?.caTrust?.identityType
  );

  const caValue = trimString(
    config?.ca_trust?.value ?? config?.caTrust?.value ?? config?.caFingerprint
  );
  const caPem = trimString(config?.ca_trust?.pem ?? config?.caTrust?.pem);

  const matchMode = normalizeMatchMode(config?.match_mode ?? config?.matchMode);
  const serialNumber = trimString(config?.serial_number ?? config?.serialNumber);
  const subjectCn = trimString(config?.subject_cn ?? config?.subjectCn);

  return {
    ca_trust: {
      identity_type: identityType,
      value: caValue,
      ...(caPem ? { pem: caPem } : {}),
    },
    match_mode: matchMode,
    ...(serialNumber ? { serial_number: serialNumber } : {}),
    ...(subjectCn ? { subject_cn: subjectCn } : {}),
  };
};
