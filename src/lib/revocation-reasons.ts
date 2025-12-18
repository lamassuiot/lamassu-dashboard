
export interface RevocationReason {
  value: string;
  label: string;
  description: string;
}

export const revocationReasons: RevocationReason[] = [
  {
    value: "Unspecified",
    label: "Unspecified",
    description: "Revocation occurred for a reason that has no more specific value.",
  },
  {
    value: "KeyCompromise",
    label: "KeyCompromise",
    description: "The private key, or another validated portion of an end-entity certificate, is suspected to have been compromised.",
  },
  {
    value: "CACompromise",
    label: "CACompromise",
    description: "The private key, or another validated portion of a Certificate Authority (CA) certificate, is suspected to have been compromised.",
  },
  {
    value: "AffiliationChanged",
    label: "AffiliationChanged",
    description: "The subject's name, or other validated information in the certificate, has changed without anything being compromised.",
  },
  {
    value: "Superseded",
    label: "Superseded",
    description: "The certificate has been superseded, but without anything being compromised.",
  },
  {
    value: "CessationOfOperation",
    label: "CessationOfOperation",
    description: "The certificate is no longer needed, but nothing is suspected to be compromised.",
  },
  {
    value: "CertificateHold",
    label: "CertificateHold",
    description: "The certificate is temporarily suspended, and may either return to service or become permanently revoked in the future.",
  },
  {
    value: "RemoveFromCRL",
    label: "RemoveFromCRL",
    description: "The certificate was revoked with CertificateHold on a base Certificate Revocation List (CRL) and is being returned to service on a delta CRL.",
  },
  {
    value: "PrivilegeWithdrawn",
    label: "PrivilegeWithdrawn",
    description: "A privilege contained within the certificate has been withdrawn.",
  },
  {
    value: "AACompromise",
    label: "AACompromise",
    description: "It is known, or suspected, that aspects of the Attribute Authority (AA) validated in the attribute certificate have been compromised.",
  },
];
