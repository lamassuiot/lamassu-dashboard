
import { formatCertificateUsageLabel } from '@/lib/utils';
import { extendedKeyUsageOptions, keyUsageOptions } from '@/lib/certificate-usage-options';

// --- Key Specs ---
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
  { value: 'P-224', label: 'P-224 (NIST P-224, secp224r1)' },
  { value: 'P-256', label: 'P-256 (NIST P-256, secp256r1)' },
  { value: 'P-384', label: 'P-384 (NIST P-384, secp384r1)' },
  { value: 'P-521', label: 'P-521 (NIST P-521, secp521r1)' },
];

export const MLDSA_SECURITY_LEVEL_OPTIONS = [
  { value: 'ML-DSA-44', label: 'ML-DSA-44 (Security Level 1 - ~AES-128)' },
  { value: 'ML-DSA-65', label: 'ML-DSA-65 (Security Level 3 - ~AES-192)' },
  { value: 'ML-DSA-87', label: 'ML-DSA-87 (Security Level 5 - ~AES-256)' },
];

/**
 * SLH-DSA (FIPS 205) parameter set metadata.
 * Keys are the numeric IDs (1–12) returned by the KMS API as the key size.
 */
export const SLHDSA_PARAM_SET_INFO: Record<string, { name: string; hash: string; security: string; speed: string }> = {
  '1':  { name: 'SHA2_128s',  hash: 'SHA-2',  security: '128-bit', speed: 'small sig' },
  '2':  { name: 'SHAKE_128s', hash: 'SHAKE',  security: '128-bit', speed: 'small sig' },
  '3':  { name: 'SHA2_128f',  hash: 'SHA-2',  security: '128-bit', speed: 'fast sig'  },
  '4':  { name: 'SHAKE_128f', hash: 'SHAKE',  security: '128-bit', speed: 'fast sig'  },
  '5':  { name: 'SHA2_192s',  hash: 'SHA-2',  security: '192-bit', speed: 'small sig' },
  '6':  { name: 'SHAKE_192s', hash: 'SHAKE',  security: '192-bit', speed: 'small sig' },
  '7':  { name: 'SHA2_192f',  hash: 'SHA-2',  security: '192-bit', speed: 'fast sig'  },
  '8':  { name: 'SHAKE_192f', hash: 'SHAKE',  security: '192-bit', speed: 'fast sig'  },
  '9':  { name: 'SHA2_256s',  hash: 'SHA-2',  security: '256-bit', speed: 'small sig' },
  '10': { name: 'SHAKE_256s', hash: 'SHAKE',  security: '256-bit', speed: 'small sig' },
  '11': { name: 'SHA2_256f',  hash: 'SHA-2',  security: '256-bit', speed: 'fast sig'  },
  '12': { name: 'SHAKE_256f', hash: 'SHAKE',  security: '256-bit', speed: 'fast sig'  },
};

export const SLHDSA_PARAM_SET_OPTIONS = Object.entries(SLHDSA_PARAM_SET_INFO).map(([id, info]) => ({
  value: id,
  label: `${id} — ${info.name} (${info.hash}, ${info.security}, ${info.speed})`,
}));

/**
 * Composite-ML-DSA-RSA (IETF composite-sigs draft) parameter set metadata.
 * Keys are the numeric IDs (1–8) returned by the KMS API as the key size.
 */
export const COMPOSITE_MLDSA_RSA_PARAM_SET_INFO: Record<string, { name: string }> = {
  '1': { name: 'MLDSA44-RSA2048-PSS-SHA256'   },
  '2': { name: 'MLDSA44-RSA2048-PKCS15-SHA256' },
  '3': { name: 'MLDSA65-RSA3072-PSS-SHA512'   },
  '4': { name: 'MLDSA65-RSA3072-PKCS15-SHA512' },
  '5': { name: 'MLDSA65-RSA4096-PSS-SHA512'   },
  '6': { name: 'MLDSA65-RSA4096-PKCS15-SHA512' },
  '7': { name: 'MLDSA87-RSA3072-PSS-SHA512'   },
  '8': { name: 'MLDSA87-RSA4096-PSS-SHA512'   },
};

export const COMPOSITE_MLDSA_RSA_PARAM_SET_OPTIONS = Object.entries(COMPOSITE_MLDSA_RSA_PARAM_SET_INFO).map(([id, info]) => ({
  value: id,
  label: `${id} — ${info.name}`,
}));


// --- Key Usages ---
export const KEY_USAGE_OPTIONS = keyUsageOptions.map((id) => ({
  id,
  label: formatCertificateUsageLabel(id),
})) as readonly { id: typeof keyUsageOptions[number]; label: string }[];

export const EKU_OPTIONS = extendedKeyUsageOptions.map((id) => ({
  id,
  label: formatCertificateUsageLabel(id),
})) as readonly { id: typeof extendedKeyUsageOptions[number]; label: string }[];
