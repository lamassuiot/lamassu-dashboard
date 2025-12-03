
export const KEY_TYPE_OPTIONS = [
  { value: 'RSA', label: 'RSA' },
  { value: 'ECDSA', label: 'ECDSA' },
];

export const RSA_KEY_SIZE_OPTIONS = [
  { value: '2048', label: '2048 bit' },
  { value: '3072', label: '3072 bit' },
  { value: '4096', label: '4096 bit' },
];

export const ECDSA_CURVE_OPTIONS = [
  { value: 'P-224', label: 'P-224 (NIST P-224, secp224r1)' },
  { value: 'P-256', label: 'P-256 (NIST P-256, secp256r1)' },
  { value: 'P-384', label: 'P-384 (NIST P-384, secp384r1)' },
  { value: 'P-521', label: 'P-521 (NIST P-521, secp521r1)' },
];

export const SYM_KEY_ALGORITHMS: Record<string, string> = {
  'AES_256_CBC': 'AES-256 CBC',
  'AES_256_CTR': 'AES-256 CTR',
  'AES_256_GCM': 'AES-256 GCM',
  'AES_192_CBC': 'AES-192 CBC',
  'AES_192_CTR': 'AES-192 CTR',
  'AES_192_GCM': 'AES-192 GCM',
  'AES_128_CBC': 'AES-128 CBC',
  'AES_128_CTR': 'AES-128 CTR',
  'AES_128_GCM': 'AES-128 GCM',
  'Ascon128': 'Ascon-128',
  'Ascon128a': 'Ascon-128a',
  'Ascon80pq': 'Ascon-80pq',
};


