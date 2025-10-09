
export interface RevocationReason {
  value: int;
  label: string;
  description: string;
}

export const revocationReasons: RevocationReason[] = [
  {
    value: 0,
    label: "Unspecified",
    description: "Revocation occurred for a reason that has no more specific value.",
  },
  {
    value: 1,
    label: "KeyCompromise",
    description: "The private key, or another validated portion of an end-entity certificate, is suspected to have been compromised.",
  },
  {
    value: 2,
    label: "CACompromise",
    description: "The private key, or another validated portion of a Certificate Authority (CA) certificate, is suspected to have been compromised.",
  },
  {
    value: 3,
    label: "AffiliationChanged",
    description: "The subject's name, or other validated information in the certificate, has changed without anything being compromised.",
  },
  {
    value: 4,
    label: "Superseded",
    description: "The certificate has been superseded, but without anything being compromised.",
  },
  {
    value: 5,
    label: "CessationOfOperation",
    description: "The certificate is no longer needed, but nothing is suspected to be compromised.",
  },
  {
    value: 6,
    label: "CertificateHold",
    description: "The certificate is temporarily suspended, and may either return to service or become permanently revoked in the future.",
  },
  {
    value: 7,
    label: "Unexpected value",
    description: "(7) is reserved and not used by RFC.",
  },
  {
    value: 8,
    label: "RemoveFromCRL",
    description: "The certificate was revoked with CertificateHold on a base Certificate Revocation List (CRL) and is being returned to service on a delta CRL.",
  },
  {
    value: 9,
    label: "PrivilegeWithdrawn",
    description: "A privilege contained within the certificate has been withdrawn.",
  },
  {
    value: 10,
    label: "AACompromise",
    description: "It is known, or suspected, that aspects of the Attribute Authority (AA) validated in the attribute certificate have been compromised.",
  },
  {
    value: 11,
    label: "WeakAlgorithmOrKey",
    description: "The certificate key uses a weak cryptographic algorithm, or the key is too short, or the key was generated in an unsafe manner.",
  },
];
