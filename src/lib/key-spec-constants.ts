export const KEY_TYPE_OPTIONS = [
  { value: 'RSA', label: 'RSA' },
  { value: 'ECDSA', label: 'ECDSA' },
  { value: 'Ed25519', label: 'Ed25519' },
];

export const KEY_TYPE_OPTIONS_POST_QUANTUM = [
  ...KEY_TYPE_OPTIONS,
  { value: 'ML-DSA', label: 'ML-DSA (Post-Quantum)' },
];

export const RSA_KEY_SIZE_OPTIONS = [
  { value: '2048', label: '2048 bit' },
  { value: '3072', label: '3072 bit' },
  { value: '4096', label: '4096 bit' },
];

export const ECDSA_CURVE_OPTIONS = [
  { value: 'P-256', label: 'P-256 (NIST P-256, secp256r1)' },
  { value: 'P-384', label: 'P-384 (NIST P-384, secp384r1)' },
  { value: 'P-521', label: 'P-521 (NIST P-521, secp521r1)' },
];

export const SYM_KEY_ALGORITHMS: Record<string, string> = {
  'AES-256-CBC': 'AES-256 CBC',
  'AES-256-CTR': 'AES-256 CTR',
  'AES-256-GCM': 'AES-256 GCM',
  'AES-192-CBC': 'AES-192 CBC',
  'AES-192-CTR': 'AES-192 CTR',
  'AES-192-GCM': 'AES-192 GCM',
  'AES-128-CBC': 'AES-128 CBC',
  'AES-128-CTR': 'AES-128 CTR',
  'AES-128-GCM': 'AES-128 GCM',
  'Ascon128': 'Ascon-128',
  'Ascon128a': 'Ascon-128a',
  'Ascon80pq': 'Ascon-80pq',
};


export const MLDSA_SECURITY_LEVEL_OPTIONS = [
  { value: 'ML-DSA-44', label: 'ML-DSA-44 (Security Level 1 - ~AES-128)' },
  { value: 'ML-DSA-65', label: 'ML-DSA-65 (Security Level 3 - ~AES-192)' },
  { value: 'ML-DSA-87', label: 'ML-DSA-87 (Security Level 5 - ~AES-256)' },
];
