

// --- Key Specs ---
export const KEY_TYPE_OPTIONS = [
  { value: 'RSA', label: 'RSA' },
  { value: 'ECDSA', label: 'ECDSA' },
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


// --- Key Usages ---
export const KEY_USAGE_OPTIONS = [
    { id: "DigitalSignature", label: "Digital Signature" },
    { id: "ContentCommitment", label: "Content Commitment" },
    { id: "KeyEncipherment", label: "Key Encipherment" },
    { id: "DataEncipherment", label: "Data Encipherment" },
    { id: "KeyAgreement", label: "Key Agreement" },
    { id: "CertSign", label: "Certificate Signing" },
    { id: "CRLSign", label: "CRL Signing" },
    { id: "EncipherOnly", label: "Encipher Only" },
    { id: "DecipherOnly", label: "Decipher Only" },
] as const;

export const EKU_OPTIONS = [
    { id: "ServerAuth", label: "Server Authentication" },
    { id: "ClientAuth", label: "Client Authentication" },
    { id: "CodeSigning", label: "Code Signing" },
    { id: "EmailProtection", label: "Email Protection" },
    { id: "TimeStamping", label: "Time Stamping" },
    { id: "OcspSigning", label: "OCSP Signing" },
] as const;
