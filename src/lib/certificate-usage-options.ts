export const keyUsageOptions = [
  "DigitalSignature", "ContentCommitment", "KeyEncipherment", "DataEncipherment",
  "KeyAgreement", "CertSign", "CRLSign", "EncipherOnly", "DecipherOnly"
] as const;

export type KeyUsageOption = typeof keyUsageOptions[number];

export const extendedKeyUsageOptions = [
  "ServerAuth", "ClientAuth", "CodeSigning", "EmailProtection",
  "TimeStamping", "OCSPSigning", "Any"
] as const;

export type ExtendedKeyUsageOption = typeof extendedKeyUsageOptions[number];

export const TLS_KEY_USAGES: readonly KeyUsageOption[] = [
  "DigitalSignature",
  "KeyEncipherment",
];

export const CODE_SIGNING_KEY_USAGES: readonly KeyUsageOption[] = [
  "DigitalSignature",
  "ContentCommitment",
];

export const CA_KEY_USAGES: readonly KeyUsageOption[] = [
  "CertSign",
  "CRLSign",
];

export const CLIENT_AUTH_KEY_USAGES: readonly KeyUsageOption[] = [
  "DigitalSignature",
];

export const DEVICE_AUTH_EXTENDED_KEY_USAGES: readonly ExtendedKeyUsageOption[] = [
  "ClientAuth",
  "ServerAuth",
];

export const CLIENT_AUTH_EXTENDED_KEY_USAGES: readonly ExtendedKeyUsageOption[] = [
  "ClientAuth",
];

export const SERVER_AUTH_EXTENDED_KEY_USAGES: readonly ExtendedKeyUsageOption[] = [
  "ServerAuth",
];

export const CODE_SIGNING_EXTENDED_KEY_USAGES: readonly ExtendedKeyUsageOption[] = [
  "CodeSigning",
];
