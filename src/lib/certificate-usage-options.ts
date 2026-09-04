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

// Extended key usage purposes that have no dedicated ExtendedKeyUsageOption
// constant (no Go x509.ExtKeyUsage equivalent), offered as one-click presets
// for the "extra extended key usage OIDs" field. Users may also add any other
// dotted OID manually.
export const EXTRA_EKU_OID_PRESETS: readonly { label: string; oid: string }[] = [
  { label: "CMC Certification Authority (cmc-ca)", oid: "1.3.6.1.5.5.7.3.27" },
  { label: "CMC Registration Authority (cmc-ra)", oid: "1.3.6.1.5.5.7.3.28" },
  { label: "CMP Central Key Generation Authority (cmKGA)", oid: "1.3.6.1.5.5.7.3.32" },
];
