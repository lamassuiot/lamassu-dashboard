
import type { CmpRevocationReason } from '@/lib/dms-api';

export interface RevocationReason {
  value: string;
  label: string;
  description: string;
  // X.509 CRLReason code (RFC 5280 §5.3.1). This is the number openssl takes
  // as `cmp -revreason`, so the CMP try-it commands read it straight off here.
  code: number;
  // Matching name in the DMS's CmpRevocationReason enum, where one exists.
  // CertificateHold and RemoveFromCRL have none — hold and revival are
  // governed by the RA's rr.allow_revival setting rather than being selectable
  // reasons — so they are offered for direct revocation but not over CMP.
  cmpName?: CmpRevocationReason;
}

export const revocationReasons: RevocationReason[] = [
  {
    value: "Unspecified",
    label: "Unspecified",
    description: "Revocation occurred for a reason that has no more specific value.",
    code: 0,
    cmpName: 'unspecified',
  },
  {
    value: "KeyCompromise",
    label: "KeyCompromise",
    description: "The private key, or another validated portion of an end-entity certificate, is suspected to have been compromised.",
    code: 1,
    cmpName: 'key_compromise',
  },
  {
    value: "CACompromise",
    label: "CACompromise",
    description: "The private key, or another validated portion of a Certificate Authority (CA) certificate, is suspected to have been compromised.",
    code: 2,
    cmpName: 'ca_compromise',
  },
  {
    value: "AffiliationChanged",
    label: "AffiliationChanged",
    description: "The subject's name, or other validated information in the certificate, has changed without anything being compromised.",
    code: 3,
    cmpName: 'affiliation_changed',
  },
  {
    value: "Superseded",
    label: "Superseded",
    description: "The certificate has been superseded, but without anything being compromised.",
    code: 4,
    cmpName: 'superseded',
  },
  {
    value: "CessationOfOperation",
    label: "CessationOfOperation",
    description: "The certificate is no longer needed, but nothing is suspected to be compromised.",
    code: 5,
    cmpName: 'cessation_of_operation',
  },
  {
    value: "CertificateHold",
    label: "CertificateHold",
    description: "The certificate is temporarily suspended, and may either return to service or become permanently revoked in the future.",
    code: 6,
  },
  {
    value: "RemoveFromCRL",
    label: "RemoveFromCRL",
    description: "The certificate was revoked with CertificateHold on a base Certificate Revocation List (CRL) and is being returned to service on a delta CRL.",
    code: 8,
  },
  {
    value: "PrivilegeWithdrawn",
    label: "PrivilegeWithdrawn",
    description: "A privilege contained within the certificate has been withdrawn.",
    code: 9,
    cmpName: 'privilege_withdrawn',
  },
  {
    value: "AACompromise",
    label: "AACompromise",
    description: "It is known, or suspected, that aspects of the Attribute Authority (AA) validated in the attribute certificate have been compromised.",
    code: 10,
    cmpName: 'aa_compromise',
  },
];

// Reasons that can be carried by a CMP revocation request, in CRLReason order.
export const cmpRevocationReasons = revocationReasons.filter(
  (reason): reason is RevocationReason & { cmpName: CmpRevocationReason } => reason.cmpName !== undefined,
);

export function findCmpRevocationReason(name: CmpRevocationReason): RevocationReason | undefined {
  return cmpRevocationReasons.find((reason) => reason.cmpName === name);
}
