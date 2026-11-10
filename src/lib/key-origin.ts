/**
 * How a key came to exist in the KMS, as reported by the backend (`origin` on KMS keys,
 * `key_origin` on certificates and CAs). It is set by the KMS only and does not change when
 * the private part is lost.
 */
export type KeyOrigin = 'LOCAL' | 'IMPORTED' | 'UNKNOWN';

export const KEY_ORIGINS: readonly KeyOrigin[] = ['LOCAL', 'IMPORTED', 'UNKNOWN'];

export const KEY_ORIGIN_LABELS: Record<KeyOrigin, string> = {
  LOCAL: 'Generated',
  IMPORTED: 'Imported',
  UNKNOWN: 'Unknown origin',
};

export const KEY_ORIGIN_DESCRIPTIONS: Record<KeyOrigin, string> = {
  LOCAL: 'Generated in its crypto engine: the private key never existed outside it.',
  IMPORTED: 'Key material provided from outside the KMS.',
  UNKNOWN: 'The KMS cannot prove whether this key was generated or imported (registered after it already existed in its engine, or stored before origins were recorded).',
};

export const KEY_ORIGIN_OPTIONS: { value: KeyOrigin; label: string }[] = KEY_ORIGINS.map((value) => ({
  value,
  label: KEY_ORIGIN_LABELS[value],
}));

/** Certificates and CAs report an empty `key_origin` when the KMS holds no key for them. */
export const NO_KMS_KEY = 'NONE';
export type CertificateKeyOrigin = KeyOrigin | typeof NO_KMS_KEY;

export const NO_KMS_KEY_LABEL = 'No key in KMS';
export const NO_KMS_KEY_DESCRIPTION = 'The KMS holds no key for this certificate.';

export const CERTIFICATE_KEY_ORIGIN_OPTIONS: { value: CertificateKeyOrigin; label: string }[] = [
  ...KEY_ORIGIN_OPTIONS,
  { value: NO_KMS_KEY, label: NO_KMS_KEY_LABEL },
];

/** The origin the API sent (case-insensitive), or undefined when it is missing, empty or not recognised. */
export function parseKeyOrigin(value: unknown): KeyOrigin | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return (KEY_ORIGINS as readonly string[]).includes(normalized) ? (normalized as KeyOrigin) : undefined;
}
