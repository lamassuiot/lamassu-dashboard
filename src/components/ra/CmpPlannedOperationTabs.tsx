'use client';

import React from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, X, AlertTriangle } from 'lucide-react';
import { DurationInput } from '@/components/shared/DurationInput';
import { Separator } from '@/components/ui/separator';
import { SettingsSection } from '@/components/shared/SettingsSection';
import { CmpOperationGate } from '@/components/ra/CmpOperationGate';
import { RfcLink } from '@/components/shared/RfcLink';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { RenewalLifespanBar, type CertificateValidity } from '@/components/ra/RenewalLifespanBar';
import { cn } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type {
  CmpIrSettings, CmpCrSettings, CmpP10crSettings, CmpRrSettings, CmpCcrSettings,
  CmpKeyPolicy, CmpIdentityChangePolicy, CmpGenmAccessPolicy, CmpGenmInformationTypes,
  CmpPopoMethod, CmpRevocationReason, CmpPolicyOverrides, CmpPreferredSymmetricAlgorithm,
} from '@/lib/dms-api';

// AES variants offered for the id-it-preferredSymmAlg response. CBC is the
// traditional CMS content-encryption cipher; GCM is the AEAD alternative.
const PREFERRED_SYMM_ALG_OPTIONS: { value: CmpPreferredSymmetricAlgorithm; label: string }[] = [
  { value: 'aes128_cbc', label: 'AES-128-CBC' },
  { value: 'aes192_cbc', label: 'AES-192-CBC' },
  { value: 'aes256_cbc', label: 'AES-256-CBC' },
  { value: 'aes128_gcm', label: 'AES-128-GCM' },
  { value: 'aes192_gcm', label: 'AES-192-GCM' },
  { value: 'aes256_gcm', label: 'AES-256-GCM' },
];

const POLICY_WORKFLOW_OPTIONS = [
  {
    value: 'inherit',
    label: 'Use General default',
    description: 'Use the default issuance workflow configured in General > Workflow & Confirmation.',
  },
  {
    value: 'direct',
    label: 'Direct (synchronous)',
    description: 'Fully automatic, with no human intervention: the certificate is issued and returned inline in response to the enrollment request.',
  },
  {
    value: 'phased',
    label: 'Phased (admin-approved)',
    description: 'An administrator must explicitly approve EVERY operation from the active transactions panel. The device receives a "waiting" response and polls until the certificate is issued.',
  },
] as const;

const POLICY_CONFIRMATION_OPTIONS = [
  {
    value: 'inherit',
    label: 'Use General default',
    description: 'Use the default confirmation mode configured in General > Workflow & Confirmation.',
  },
  {
    value: 'explicit',
    label: 'Explicit (default)',
    description: 'The client must send a final certConf message confirming receipt before the transaction is considered complete.',
  },
  {
    value: 'implicit',
    label: 'Implicit',
    description: 'The transaction closes as soon as the server issues the certificate, with no further confirmation round trip.',
  },
] as const;

// Phase 2 of the CMP settings redesign: the backend now has a nested
// per-operation schema (core/pkg/models/dms_cmp_operations.go) that persists
// and round-trips through the DMS API 1:1 with these controls — so every
// field here is bound to real state and actually saved.
//
// CORRECTION (post manual protocol-conformance audit, openssl cmp against a
// live server): the "Planned" badge below was originally meant to flag fields
// the backend saves but doesn't yet enforce. That premise turned out to be
// wrong for most of this file —
// proof_of_possession.allowed_methods/required, cr's require_existing_device/
// certificate_behavior/maximum_active_certificates, kur's key_policy/
// identity_change_policy, rr's authorization/allow_revival/allowed_reasons/
// trusted_ra.require_cmc_ra_eku, and nearly all of ccr are ALL
// live-enforced (see the backend model file's header for the current, accurate
// exception list). The "Planned" badges throughout this file are therefore
// stale and should be removed in a dedicated follow-up pass — deliberately not
// done here since it's a user-visible copy change across many fields, not a
// single bug fix. Only central_key_generation.enabled and the
// "Workflow & confirmation overrides" section (policy_overrides.*) were
// already un-badged, correctly.

function PlannedBadge() {
  return (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium text-amber-600 dark:text-amber-400">
      Planned
    </Badge>
  );
}

function SectionHeader({ title, badge = true, children }: { title: string; badge?: boolean; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{title}</p>
        {badge && <PlannedBadge />}
      </div>
      {children && <p className="text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}

// A labelled control row for a field that's saved but not yet enforced.
function PlannedRow({ label, description, children }: { label: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

function PlannedSwitchRow({ label, description, checked, onCheckedChange }: {
  label: string; description?: string; checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5 flex-1">
        <Label className="text-sm">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function CheckboxList<T extends string>({ options, selected, onToggle }: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((opt) => {
        const id = `planned-${opt.value}`;
        return (
          <label key={opt.value} htmlFor={id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <Checkbox id={id} checked={selected.includes(opt.value)} onCheckedChange={() => onToggle(opt.value)} />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

const POP_METHOD_OPTIONS: { value: CmpPopoMethod; label: string }[] = [
  { value: 'signature', label: 'CRMF signature' },
  { value: 'trusted_ra', label: 'Trusted RA verification' },
  { value: 'challenge_response', label: 'Challenge-response' },
  { value: 'encrypted_certificate', label: 'Encrypted certificate delivery' },
];

const REVOCATION_REASON_OPTIONS: { value: CmpRevocationReason; label: string }[] = [
  { value: 'unspecified', label: 'Unspecified' },
  { value: 'key_compromise', label: 'Key compromise' },
  { value: 'cessation_of_operation', label: 'Cessation of operation' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'affiliation_changed', label: 'Affiliation changed' },
  { value: 'ca_compromise', label: 'CA compromise' },
  { value: 'privilege_withdrawn', label: 'Privilege withdrawn' },
  { value: 'aa_compromise', label: 'AA compromise' },
];

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// The wire schema keeps regToken and authenticator as two independent controls,
// but a request can only carry one, so the UI presents them as a single choice.
type IrCredentialControl = 'none' | 'registration_token' | 'authenticator';

function irCredentialControlOf(ir: CmpIrSettings): IrCredentialControl {
  if (ir.registration_token.mode !== 'disabled') return 'registration_token';
  if (ir.authenticator_control.mode !== 'disabled') return 'authenticator';
  return 'none';
}

// RFC sections are plain text here rather than RfcLink: these render inside the
// select's trigger and options, where a nested anchor would be both invalid
// markup and unclickable. The field's own description carries the live link.
const IR_CREDENTIAL_CONTROL_OPTIONS: {
  value: IrCredentialControl; label: string; description: string; disabled?: boolean;
}[] = [
  {
    value: 'none',
    label: 'None (client certificate is checked)',
    description: "No CRMF registration control is required; the device's identity is instead verified via the Client Certificate authentication configured above.",
  },
  {
    value: 'registration_token',
    label: 'Registration token',
    description: "id-regCtrl-regToken (RFC 4211 §6.1) — a one-time-use value provisioned out-of-band per device (e.g. at manufacturing); the CA only checks it hasn't been used before. Not yet available.",
    disabled: true,
  },
  {
    value: 'authenticator',
    label: 'Authenticator control',
    description: 'id-regCtrl-authenticator (RFC 4211 §6.2) — validated against a single shared secret configured for the whole DMS; reusable and never expires. Not yet available.',
    disabled: true,
  },
];

// ── KUR & GENM planned sub-sections (embedded inside the page's otherwise-live
// KUR and GENM tabs) — controlled, so their values persist through the real
// nested schema alongside the already-live fields those tabs render. ──

export function CmpKurPlannedPolicy({
  keyPolicy, onKeyPolicyChange, identityChangePolicy, onIdentityChangePolicyChange,
}: {
  keyPolicy: CmpKeyPolicy;
  onKeyPolicyChange: (v: CmpKeyPolicy) => void;
  identityChangePolicy: CmpIdentityChangePolicy;
  onIdentityChangePolicyChange: (v: CmpIdentityChangePolicy) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <PlannedRow label="Key policy">
        <Select value={keyPolicy} onValueChange={(v: CmpKeyPolicy) => onKeyPolicyChange(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="require_new_key">Require a new key</SelectItem>
            <SelectItem value="permit_reuse">Permit key reuse</SelectItem>
          </SelectContent>
        </Select>
      </PlannedRow>
      <PlannedRow label="Identity-change policy">
        <Select value={identityChangePolicy} onValueChange={(v: CmpIdentityChangePolicy) => onIdentityChangePolicyChange(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="forbid">No subject or SAN changes</SelectItem>
            <SelectItem value="san_only">SAN changes allowed</SelectItem>
            <SelectItem value="subject_and_san">Subject and SAN changes allowed</SelectItem>
          </SelectContent>
        </Select>
      </PlannedRow>
    </div>
  );
}

// ── General messages (GENM/GENP) ──
// Every id-it information type the CA can answer is modelled as a
// sub-operation of genm, exactly like ir/cr/p10cr/kur are sub-operations of
// enrollment: an OID eyebrow, a human title and description, a master
// enable switch, and — where the type has a payload to shape — its own
// settings behind that switch.
interface GenmInfoType {
  key: keyof CmpGenmInformationTypes;
  // Shown as the section eyebrow. Kept in the OID's own casing (id-it-caCerts),
  // unlike the enrollment tab's message-pair eyebrows (IR / IP).
  oid: string;
  title: string;
  description: React.ReactNode;
  switchLabel: string;
  switchDescription: string;
  disabledNote: string;
  live: boolean;
}

const GENM_INFO_TYPES: GenmInfoType[] = [
  {
    key: 'ca_certificates',
    oid: 'id-it-caCerts',
    title: 'CA Certificates',
    description: <>Returns the CA certificates a client needs to build and validate a chain up to this DMS&apos;s issuers (<RfcLink rfc={9483} section="4.3.1" />).</>,
    switchLabel: 'Answer caCerts queries',
    switchDescription: 'Serve the CA certificates selected below in response to a caCerts general message.',
    disabledNote: 'CA certificate distribution is off — a caCerts query is answered with an error, so clients must be provisioned with the trust chain out of band.',
    live: true,
  },
  {
    key: 'root_ca_update',
    oid: 'id-it-rootCaCert',
    title: 'Root CA Update',
    description: <>Lets a client pick up a newer root CA certificate, with the old-with-new / new-with-old links, during a root key rollover (<RfcLink rfc={9483} section="4.3.2" />).</>,
    switchLabel: 'Answer rootCaCert queries',
    switchDescription: 'Serve the updated root CA certificate when the client sends the root it currently trusts.',
    disabledNote: 'Root CA update is off — clients cannot discover a rolled-over root over CMP and must be re-provisioned out of band.',
    live: true,
  },
  {
    key: 'certificate_request_template',
    oid: 'id-it-certReqTemplate',
    title: 'Certificate Request Template',
    description: <>Advertises the subject, extensions and key constraints this DMS expects, so a device can build a conforming request up front (<RfcLink rfc={9483} section="4.3.3" />).</>,
    switchLabel: 'Answer certReqTemplate queries',
    switchDescription: 'Derive the template from the effective issuance profile and return it to the client.',
    disabledNote: 'Certificate request templates are off — devices get no hint about the expected subject or extensions and must be configured with them.',
    live: true,
  },
  {
    key: 'current_crl',
    oid: 'id-it-currentCRL',
    title: 'Current CRL',
    description: <>Returns the latest CRL issued by the enrollment CA, unconditionally (<RfcLink rfc={4210} section="5.3.19.6" />).</>,
    switchLabel: 'Answer currentCRL queries',
    switchDescription: 'Serve the newest CRL on every request, regardless of what the client already holds.',
    disabledNote: 'Current CRL retrieval is off — clients must fetch the CRL from the Validation Authority instead.',
    live: true,
  },
  {
    key: 'crl_update',
    oid: 'id-it-crlStatusList',
    title: 'CRL Update',
    description: <>The conditional counterpart of currentCRL: a CRL is returned only when the client&apos;s copy is stale, based on the status list it sends (<RfcLink rfc={9483} section="4.3.4" />).</>,
    switchLabel: 'Answer crlStatusList queries',
    switchDescription: 'Compare the client’s CRL status list against the current CRL and answer only when it is out of date.',
    disabledNote: 'Conditional CRL update is off — clients cannot poll for a fresher CRL and must re-download it in full.',
    live: true,
  },
  {
    key: 'signing_key_types',
    oid: 'id-it-signKeyPairTypes',
    title: 'Signing Key Types',
    description: <>Advertises the key algorithms and sizes this DMS will sign certificates for (<RfcLink rfc={4210} section="5.3.19.2" />).</>,
    switchLabel: 'Answer signKeyPairTypes queries',
    switchDescription: 'Return the signing key types accepted by the enrollment CA and issuance profile.',
    disabledNote: 'Signing key type discovery is off — a device learns its key is unacceptable only when enrollment fails.',
    live: true,
  },
  {
    key: 'encryption_key_types',
    oid: 'id-it-encKeyPairTypes',
    title: 'Encryption Key Types',
    description: <>Advertises the key algorithms this DMS accepts for encryption certificates (<RfcLink rfc={4210} section="5.3.19.3" />).</>,
    switchLabel: 'Answer encKeyPairTypes queries',
    switchDescription: 'Return the encryption key types accepted by the enrollment CA and issuance profile.',
    disabledNote: 'Encryption key type discovery is off — clients cannot query which encryption keys are acceptable.',
    live: true,
  },
  {
    key: 'preferred_symmetric_algorithm',
    oid: 'id-it-preferredSymmAlg',
    title: 'Preferred Symmetric Algorithm',
    description: <>Tells the client which symmetric cipher to use for CMS content encryption — for example the key transport of a centrally generated private key (<RfcLink rfc={4210} section="5.3.19.4" />).</>,
    switchLabel: 'Answer preferredSymmAlg queries',
    switchDescription: 'Advertise the cipher configured below as this DMS’s preferred content-encryption algorithm.',
    disabledNote: 'Preferred algorithm discovery is off — clients fall back to their own default cipher for CMS content encryption.',
    live: true,
  },
  {
    key: 'supported_languages',
    oid: 'id-it-suppLangTags',
    title: 'Supported Languages',
    description: <>Negotiates the language used in human-readable free text of PKI messages (<RfcLink rfc={4210} section="5.3.19.15" />).</>,
    switchLabel: 'Answer suppLangTags queries',
    switchDescription: 'Return the language tags this DMS can use in status strings.',
    disabledNote: 'Language negotiation is off — free text is returned in the server default language.',
    live: true,
  },
  // Hard-disabled server-side for the time being (genmInfoTypeEnabled rejects
  // it): Lamassu does not provision a dedicated protocol-encryption certificate,
  // so the CA has nothing real to return. Kept hidden (live: false) — and the
  // save path forces its flag to false — until it is actually implemented.
  // (id-it-revPassphrase is likewise disabled server-side, but it has no config
  // flag or toggle, so there is nothing to represent here.)
  {
    key: 'protocol_encryption_certificate',
    oid: 'id-it-caProtEncCert',
    title: 'Protocol Encryption Certificate',
    description: <>The certificate a client encrypts to when a request has to be confidential (<RfcLink rfc={4210} section="5.3.19.1" />).</>,
    switchLabel: 'Answer caProtEncCert queries',
    switchDescription: 'Not implemented — Lamassu does not provision a dedicated protocol encryption certificate.',
    disabledNote: 'Protocol encryption certificate discovery is not available.',
    live: false,
  },
];

// `uppercase: false` keeps an eyebrow that is a real identifier (an id-it OID
// name) in its own casing instead of shouting it as ID-IT-CACERTS.
function operationTitle(eyebrow: string, title: string, { uppercase = true }: { uppercase?: boolean } = {}) {
  return (
    <>
      <span className={cn('block text-xs font-medium tracking-wide text-primary/80', uppercase && 'uppercase')}>{eyebrow}</span>
      {title}
    </>
  );
}

// Minimal shape the issuance-profile override picker needs. ApiSigningProfile
// (what the RA form loads) is structurally assignable to this.
interface ProfileOption {
  id: string;
  name: string;
}

function IssuanceProfileOverridePicker({
  value,
  availableProfiles,
  onChange,
}: {
  value: string | null;
  availableProfiles: ProfileOption[];
  onChange: (value: string | null) => void;
}) {
  const [mode, setMode] = React.useState<'default' | 'existing'>(value ? 'existing' : 'default');

  React.useEffect(() => {
    setMode(value ? 'existing' : 'default');
  }, [value]);

  return (
    <PlannedRow
      label="Issuance Profile"
      description="Override the issuance profile configured in Enrollment CA & Profile for this operation."
    >
      <div className="flex items-center gap-2">
        <Select
          value={mode}
          onValueChange={(nextMode: 'default' | 'existing') => {
            setMode(nextMode);
            if (nextMode === 'default') onChange(null);
          }}
        >
          <SelectTrigger className={mode === 'existing' ? 'w-1/2' : 'w-full'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Use Enrollment CA &amp; Profile</SelectItem>
            <SelectItem value="existing">Use Existing Profile</SelectItem>
          </SelectContent>
        </Select>
        {mode === 'existing' ? (
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger className="w-1/2"><SelectValue placeholder="Select an issuance profile..." /></SelectTrigger>
            <SelectContent>
              {availableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
    </PlannedRow>
  );
}

// Key Update (KUR/KUP) lives inside the Enrollment tab as a fourth section
// alongside IR/CR/P10CR — it still answers "how does a device get a
// certificate?", so it belongs with the others rather than as its own tab.
interface CmpKurTabProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  revokeOnReEnroll: boolean;
  onRevokeOnReEnrollChange: (v: boolean) => void;
  allowExpiredRenewal: boolean;
  onAllowExpiredRenewalChange: (v: boolean) => void;
  allowedRenewalDelta: string;
  onAllowedRenewalDeltaChange: (v: string) => void;
  preventiveRenewalDelta: string;
  onPreventiveRenewalDeltaChange: (v: string) => void;
  criticalRenewalDelta: string;
  onCriticalRenewalDeltaChange: (v: string) => void;
  effectiveIssuanceProfile: { name: string; validity: CertificateValidity } | null;
  additionalValidationCAs: CA[];
  onRemoveAdditionalValidationCa: (id: string) => void;
  onAddAdditionalValidationCa: () => void;
  allCryptoEngines: ApiCryptoEngine[];
  keyPolicy: CmpKeyPolicy;
  onKeyPolicyChange: (v: CmpKeyPolicy) => void;
  identityChangePolicy: CmpIdentityChangePolicy;
  onIdentityChangePolicyChange: (v: CmpIdentityChangePolicy) => void;
}

// General messages (genm/genp) — the operation gate, the id-it information
// types it answers, and the caCerts response payload (CA distribution), which
// is the caCerts information type's own settings rather than a section of its
// own.
interface CmpGenmTabProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  accessPolicy: CmpGenmAccessPolicy;
  onAccessPolicyChange: (v: CmpGenmAccessPolicy) => void;
  informationTypes: CmpGenmInformationTypes;
  onInformationTypesChange: (v: CmpGenmInformationTypes) => void;
  preferredSymmetricAlgorithm: CmpPreferredSymmetricAlgorithm;
  onPreferredSymmetricAlgorithmChange: (v: CmpPreferredSymmetricAlgorithm) => void;
  includeDownstreamCA: boolean;
  onIncludeDownstreamCAChange: (v: boolean) => void;
  includeEnrollmentCA: boolean;
  onIncludeEnrollmentCAChange: (v: boolean) => void;
  managedCAs: CA[];
  onRemoveManagedCa: (id: string) => void;
  onAddManagedCa: () => void;
}

// Central Key Generation also lives inside the Enrollment tab — it's an
// ir/cr request-time behavior (an empty public key asks the server to
// generate the key pair), not a separate CMP message type.
interface CmpCkgTabProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
}

interface CmpPlannedOperationTabsProps {
  ir: CmpIrSettings;
  onIrChange: (patch: Partial<CmpIrSettings>) => void;
  cr: CmpCrSettings;
  onCrChange: (patch: Partial<CmpCrSettings>) => void;
  p10cr: CmpP10crSettings;
  onP10crChange: (patch: Partial<CmpP10crSettings>) => void;
  kur: CmpKurTabProps;
  ckg: CmpCkgTabProps;
  rr: CmpRrSettings;
  onRrChange: (patch: Partial<CmpRrSettings>) => void;
  ccr: CmpCcrSettings;
  onCcrChange: (patch: Partial<CmpCcrSettings>) => void;
  genm: CmpGenmTabProps;
  ccrTrustedRequesterCAs: CA[];
  onRemoveCcrTrustedRequesterCa: (id: string) => void;
  onAddCcrTrustedRequesterCa: () => void;
  // Issuance profiles selectable as a per-operation profile pin. Empty is fine
  // — the picker still offers "Use Enrollment CA & Profile".
  availableProfiles?: ProfileOption[];
  // Enrollment CA & Profile + Device Policy — enrollment-scoped defaults,
  // hoisted by the page and rendered ahead of the per-operation sections
  // since they're enrollment options, not general DMS config.
  enrollmentGeneralSection: React.ReactNode;
}

export function CmpPlannedOperationTabs({
  ir, onIrChange, cr, onCrChange, p10cr, onP10crChange, kur, ckg, rr, onRrChange, ccr, onCcrChange,
  genm, ccrTrustedRequesterCAs, onRemoveCcrTrustedRequesterCa, onAddCcrTrustedRequesterCa,
  availableProfiles = [], enrollmentGeneralSection,
}: CmpPlannedOperationTabsProps) {
  // These three overrides are LIVE (enforced by the backend for ir/cr):
  // workflow → EffectiveWorkflow, confirmation → EffectiveAcceptImplicit, and
  // issuance profile → resolveCMPIssuanceProfile. Hence no "Planned" badge.
  const policyOverrides = (
    workflow: CmpPolicyOverrides['workflow'],
    confirmation: CmpPolicyOverrides['confirmation'],
    issuanceProfileId: CmpPolicyOverrides['issuance_profile_id'],
    onChange: (patch: Partial<CmpPolicyOverrides>) => void,
  ) => (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div>
        <p className="text-sm font-medium">Workflow & confirmation overrides</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Override the DMS-wide defaults from the General tab for just this operation.
        </p>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <PlannedRow label="Workflow" description="Whether certificates are issued automatically or only after administrator approval.">
          <Select value={workflow} onValueChange={(v: CmpPolicyOverrides['workflow']) => onChange({ workflow: v })}>
            <SelectTrigger className="h-auto min-h-14 w-full items-start whitespace-normal py-2.5 data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:flex-col *:data-[slot=select-value]:items-start *:data-[slot=select-value]:gap-0.5">
              <SelectValue>
                {(() => {
                  const selected = POLICY_WORKFLOW_OPTIONS.find((option) => option.value === workflow);
                  return selected && (
                    <div className="w-full min-w-0 space-y-0.5 text-left">
                      <p className="text-sm font-medium leading-none">{selected.label}</p>
                      <p className="text-xs leading-snug text-muted-foreground break-words whitespace-normal">{selected.description}</p>
                    </div>
                  );
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[320px]">
              {POLICY_WORKFLOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} textValue={option.label} className="min-h-0 h-auto items-start py-2.5">
                  <div className="space-y-0.5 text-left">
                    <p className="text-sm font-medium leading-none">{option.label}</p>
                    <p className="text-xs leading-snug text-muted-foreground">{option.description}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PlannedRow>
        <PlannedRow label="Confirmation">
          <Select value={confirmation} onValueChange={(v: CmpPolicyOverrides['confirmation']) => onChange({ confirmation: v })}>
            <SelectTrigger className="h-auto min-h-14 w-full items-start whitespace-normal py-2.5 data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:flex-col *:data-[slot=select-value]:items-start *:data-[slot=select-value]:gap-0.5">
              <SelectValue>
                {(() => {
                  const selected = POLICY_CONFIRMATION_OPTIONS.find((option) => option.value === confirmation);
                  return selected && (
                    <div className="w-full min-w-0 space-y-0.5 text-left">
                      <p className="text-sm font-medium leading-none">{selected.label}</p>
                      <p className="text-xs leading-snug text-muted-foreground break-words whitespace-normal">{selected.description}</p>
                    </div>
                  );
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[320px]">
              {POLICY_CONFIRMATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} textValue={option.label} className="min-h-0 h-auto items-start py-2.5">
                  <div className="space-y-0.5 text-left">
                    <p className="text-sm font-medium leading-none">{option.label}</p>
                    <p className="text-xs leading-snug text-muted-foreground">{option.description}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PlannedRow>
        <IssuanceProfileOverridePicker
          value={issuanceProfileId}
          availableProfiles={availableProfiles}
          onChange={(value) => onChange({ issuance_profile_id: value })}
        />
      </div>
    </div>
  );

  // Per-information-type settings, rendered inside that type's gate. Only the
  // types whose response has something to configure have any: caCerts picks
  // which CA certificates go in the response (what used to be the separate "CA
  // Distribution" section), preferredSymmAlg picks the advertised cipher.
  const genmInfoTypeSettings = (key: keyof CmpGenmInformationTypes): React.ReactNode => {
    switch (key) {
      case 'ca_certificates':
        return (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="cmpIncludeDownstreamCA">Include Downstream CA</Label>
                <p className="text-xs text-muted-foreground">Include downstream Certificate Authorities in the caCerts response.</p>
              </div>
              <Switch id="cmpIncludeDownstreamCA" checked={genm.includeDownstreamCA} onCheckedChange={genm.onIncludeDownstreamCAChange} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="cmpIncludeEnrollmentCA">Include Enrollment CA</Label>
                <p className="text-xs text-muted-foreground">Include the enrollment Certificate Authority in the caCerts response.</p>
              </div>
              <Switch id="cmpIncludeEnrollmentCA" checked={genm.includeEnrollmentCA} onCheckedChange={genm.onIncludeEnrollmentCAChange} />
            </div>
            <div className="space-y-1.5">
              <Label>Managed CAs</Label>
              <div className="space-y-2">
                {genm.managedCAs.length > 0 ? genm.managedCAs.map((ca) => (
                  <div key={ca.id} className="flex items-center gap-2 group">
                    <CaVisualizerCard ca={ca} allCryptoEngines={kur.allCryptoEngines} className="flex-grow shadow-none border-border" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => genm.onRemoveManagedCa(ca.id)}><X className="h-4 w-4" /></Button>
                  </div>
                )) : <p className="text-sm text-muted-foreground italic">No managed CAs selected.</p>}
              </div>
              <Button type="button" variant="secondary" onClick={genm.onAddManagedCa}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Managed CA
              </Button>
            </div>
          </>
        );
      case 'preferred_symmetric_algorithm':
        return (
          <PlannedRow label="Algorithm advertised in the response" description="The symmetric cipher clients are told to use for CMS content encryption.">
            <Select value={genm.preferredSymmetricAlgorithm} onValueChange={(v: CmpPreferredSymmetricAlgorithm) => genm.onPreferredSymmetricAlgorithmChange(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PREFERRED_SYMM_ALG_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PlannedRow>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* ── Enrollment: Initialization (IR/IP) + Certification (CR/CP) +
          PKCS#10 (P10CR/CP) ── One tab, three stacked sections in the standard
          2-col settings layout. ir/cr/p10cr keep entirely separate state and
          controls (no field mirroring) — they're grouped into this one tab
          because all three answer "how does a device get a certificate?". */}
      <TabsContent value="enrollment" className="mt-6">
        {enrollmentGeneralSection}

        <Separator />

        <SettingsSection title={operationTitle('IR / IP', 'Initialization')} description="Used for the initial bootstrap of a brand-new device into the PKI.">
          <CmpOperationGate
            id="cmpIrEnabled"
            label="Enable CMP initialization operation"
            description="Accept ir requests on this DMS."
            disabledNote="Initialization is off — every ir request is rejected, so a brand-new device cannot bootstrap through this DMS."
            checked={ir.enabled}
            onCheckedChange={(v) => onIrChange({ enabled: v })}
          >
            <PlannedRow label="Device identity source">
              <Select value={ir.identity_source} onValueChange={(v: CmpIrSettings['identity_source']) => onIrChange({ identity_source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="subject_only">Subject Common Name only</SelectItem>
                  <SelectItem value="subject_or_san">Subject Common Name or SAN</SelectItem>
                </SelectContent>
              </Select>
            </PlannedRow>
            <PlannedRow label="Proof-of-possession methods" description="Which POPO mechanisms the CA will accept on an initialization request.">
              <CheckboxList
                options={POP_METHOD_OPTIONS}
                selected={ir.proof_of_possession.allowed_methods}
                onToggle={(v) => onIrChange({ proof_of_possession: { ...ir.proof_of_possession, allowed_methods: toggleValue(ir.proof_of_possession.allowed_methods, v) } })}
              />
            </PlannedRow>
            {/* regToken and authenticator are the two CRMF regCtrls that can gate an
                initialization request, and a request carries at most one — so they read
                as a single choice instead of two selects that must be kept consistent. */}
            <PlannedRow
              label="Enrollment credential control"
              description={<>
                Which CRMF registration control (<RfcLink rfc={4211} section="6" />) the CA requires on an
                initialization request. Registration token and authenticator control are mutually exclusive —
                pick at most one. Both are disabled for now; only None is available.
              </>}
            >
              <Select
                value={irCredentialControlOf(ir)}
                onValueChange={(v: IrCredentialControl) => onIrChange({
                  registration_token: { mode: v === 'registration_token' ? 'required' : 'disabled' },
                  authenticator_control: { mode: v === 'authenticator' ? 'required' : 'disabled' },
                })}
              >
                <SelectTrigger className="h-auto min-h-14 w-full items-start whitespace-normal py-2.5 data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:flex-col *:data-[slot=select-value]:items-start *:data-[slot=select-value]:gap-0.5">
                  <SelectValue>
                    {(() => {
                      const selected = IR_CREDENTIAL_CONTROL_OPTIONS.find((o) => o.value === irCredentialControlOf(ir));
                      return selected && (
                        <div className="w-full min-w-0 space-y-0.5 text-left">
                          <p className="text-sm font-medium leading-none">{selected.label}</p>
                          <p className="text-xs leading-snug text-muted-foreground break-words whitespace-normal">{selected.description}</p>
                        </div>
                      );
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-[320px]">
                  {IR_CREDENTIAL_CONTROL_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      textValue={option.label}
                      disabled={option.disabled}
                      className="min-h-0 h-auto items-start py-2.5"
                    >
                      <div className="space-y-0.5 text-left">
                        <p className="text-sm font-medium leading-none">{option.label}</p>
                        <p className="text-xs leading-snug text-muted-foreground">{option.description}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PlannedRow>
            {policyOverrides(ir.policy_overrides.workflow, ir.policy_overrides.confirmation, ir.policy_overrides.issuance_profile_id, (patch) => onIrChange({ policy_overrides: { ...ir.policy_overrides, ...patch } }))}
          </CmpOperationGate>
        </SettingsSection>

        <Separator />

        <SettingsSection title={operationTitle('CR / CP', 'Certification')} description="Used when a device already participates in the PKI and requests another certificate.">
          <CmpOperationGate
            id="cmpCrEnabled"
            label="Enable CMP certification operation"
            description="Accept cr requests on this DMS."
            disabledNote="Certification is off — every cr request is rejected. Devices already in the PKI cannot request an additional certificate through this DMS."
            checked={cr.enabled}
            onCheckedChange={(v) => onCrChange({ enabled: v })}
          >
            <PlannedSwitchRow label="Require an existing device" checked={cr.require_existing_device} onCheckedChange={(v) => onCrChange({ require_existing_device: v })} />
            <PlannedRow label="Certificate behavior">
              <Select value={cr.certificate_behavior} onValueChange={(v: CmpCrSettings['certificate_behavior']) => onCrChange({ certificate_behavior: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="additional">Issue an additional certificate</SelectItem>
                  <SelectItem value="replace">Replace active identity</SelectItem>
                </SelectContent>
              </Select>
            </PlannedRow>
            {cr.certificate_behavior === 'additional' && (
              <PlannedRow label="Maximum active certificates per device">
                <Input
                  type="number"
                  min={1}
                  value={cr.maximum_active_certificates}
                  onChange={(e) => onCrChange({ maximum_active_certificates: Number.parseInt(e.target.value, 10) || 1 })}
                  className="max-w-[160px]"
                />
              </PlannedRow>
            )}
            <PlannedRow label="Proof-of-possession methods">
              <CheckboxList
                options={POP_METHOD_OPTIONS}
                selected={cr.proof_of_possession.allowed_methods}
                onToggle={(v) => onCrChange({ proof_of_possession: { ...cr.proof_of_possession, allowed_methods: toggleValue(cr.proof_of_possession.allowed_methods, v) } })}
              />
            </PlannedRow>
            {policyOverrides(cr.policy_overrides.workflow, cr.policy_overrides.confirmation, cr.policy_overrides.issuance_profile_id, (patch) => onCrChange({ policy_overrides: { ...cr.policy_overrides, ...patch } }))}
          </CmpOperationGate>
        </SettingsSection>

        <Separator />

        <SettingsSection title={operationTitle('P10CR / CP', 'PKCS #10')} description="The simplest enrollment path: a plain PKCS#10 CSR wrapped in a CMP message.">
          <CmpOperationGate
            id="cmpP10crEnabled"
            label="Enable CMP PKCS #10 enrollment operation"
            description="Accept p10cr requests on this DMS. Off by default."
            disabledNote="PKCS #10 enrollment is off — every p10cr request is rejected. Devices must use ir or cr instead."
            checked={p10cr.enabled}
            onCheckedChange={(v) => onP10crChange({ enabled: v })}
          >
            <div className="space-y-2 rounded-md border bg-muted/20 p-4">
              <p className="text-sm font-medium">Fixed behavior for PKCS #10</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>CSR signature verification: <span className="text-foreground">Always required</span></li>
                <li>CRMF proof-of-possession: <span className="text-foreground">Not applicable</span></li>
                <li>Central key generation: <span className="text-foreground">Not supported</span></li>
                <li>CRMF registration controls: <span className="text-foreground">Not applicable</span></li>
              </ul>
            </div>
          </CmpOperationGate>
        </SettingsSection>

        <Separator />

        <SettingsSection title={operationTitle('KUR / KUP', 'Key Update')} description={<>Certificate renewal. Per <RfcLink rfc={9483} section="4.1.3" /> the request is protected with the certificate being updated, so no separate authentication mode applies.</>}>
          <CmpOperationGate
            id="cmpKurEnabled"
            label="Enable CMP key update operation"
            description="Accept kur requests on this DMS."
            disabledNote="Key update is off — every kur request is rejected. Devices cannot renew over CMP and must re-enroll with ir or cr instead."
            checked={kur.enabled}
            onCheckedChange={kur.onEnabledChange}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="cmpRevokeOnReEnroll">Revoke superseded certificate</Label>
                <p className="text-xs text-muted-foreground">Automatically revoke the old certificate when a new one is issued.</p>
              </div>
              <Switch id="cmpRevokeOnReEnroll" checked={kur.revokeOnReEnroll} onCheckedChange={kur.onRevokeOnReEnrollChange} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="cmpAllowExpiredRenewal">Allow renewal using an expired certificate</Label>
              </div>
              <Switch id="cmpAllowExpiredRenewal" checked={kur.allowExpiredRenewal} onCheckedChange={kur.onAllowExpiredRenewalChange} />
            </div>
            <DurationInput id="cmpRenewalWindow" label="Renewal window before expiration" value={kur.allowedRenewalDelta} onChange={kur.onAllowedRenewalDeltaChange} placeholder="e.g., 100d" description="Time before certificate expiry when key update becomes available." />
            <DurationInput id="cmpPreventiveDelta" label="Preventive Renewal Delta" value={kur.preventiveRenewalDelta} onChange={kur.onPreventiveRenewalDeltaChange} placeholder="e.g., 31d" description="Time before expiry when the preventive re-enrollment event is emitted." />
            <DurationInput id="cmpCriticalDelta" label="Critical Renewal Delta" value={kur.criticalRenewalDelta} onChange={kur.onCriticalRenewalDeltaChange} placeholder="e.g., 7d" description="Time before expiry when the critical re-enrollment event is emitted." />
            <RenewalLifespanBar
              certificateValidity={kur.effectiveIssuanceProfile?.validity ?? null}
              issuanceProfileName={kur.effectiveIssuanceProfile?.name}
              reenrollmentWindow={kur.allowedRenewalDelta}
              preventiveDelta={kur.preventiveRenewalDelta}
              criticalDelta={kur.criticalRenewalDelta}
            />

            <div className="space-y-1.5">
              <Label>Additional trusted CAs for migration</Label>
              <div className="space-y-2">
                {kur.additionalValidationCAs.length > 0 ? kur.additionalValidationCAs.map(ca => (
                  <div key={ca.id} className="flex items-center gap-2 group">
                    <CaVisualizerCard ca={ca} allCryptoEngines={kur.allCryptoEngines} className="flex-grow shadow-none border-border" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => kur.onRemoveAdditionalValidationCa(ca.id)}><X className="h-4 w-4" /></Button>
                  </div>
                )) : <p className="text-sm text-muted-foreground italic">No additional validation CAs selected.</p>}
              </div>
              <Button type="button" variant="secondary" onClick={kur.onAddAdditionalValidationCa}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Additional Validation CA
              </Button>
            </div>

            <CmpKurPlannedPolicy
              keyPolicy={kur.keyPolicy}
              onKeyPolicyChange={kur.onKeyPolicyChange}
              identityChangePolicy={kur.identityChangePolicy}
              onIdentityChangePolicyChange={kur.onIdentityChangePolicyChange}
            />
          </CmpOperationGate>
        </SettingsSection>

        {/* CKG is an ir/cr request-time behavior, so it has nothing to act on
            once both of those operations are gated off. */}
        {(ir.enabled || cr.enabled) && (
          <>
            <Separator />

            <SettingsSection title="Central Key Generation" description={<><RfcLink rfc={9483} section="4.1.6" />. Lets a device ask the server to generate its key pair and return it, instead of generating locally.</>}>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="cmpCkgEnabled">Enable central key generation</Label>
                  <p className="text-xs text-muted-foreground">An ir/cr with an empty public key asks the server to generate and return the key pair. When disabled (default), such requests are rejected.</p>
                </div>
                <Switch id="cmpCkgEnabled" checked={ckg.enabled} onCheckedChange={ckg.onEnabledChange} />
              </div>
            </SettingsSection>
          </>
        )}
      </TabsContent>

      {/* ── Revocation Request / Response (RR/RP) ── */}
      <TabsContent value="rr" className="mt-6">
        <SettingsSection title="Revocation" description="Lets a device (or a trusted RA) revoke a certificate over CMP.">
          <CmpOperationGate
            id="cmpRrEnabled"
            label="Enable CMP revocation operation"
            description="Accept rr requests on this DMS."
            disabledNote="Revocation is off — every rr request is rejected. Certificates can still be revoked through the Lamassu API or UI."
            checked={rr.enabled}
            onCheckedChange={(v) => onRrChange({ enabled: v })}
          >
            <PlannedRow label="Authorization">
              <Select value={rr.authorization} onValueChange={(v: CmpRrSettings['authorization']) => onRrChange({ authorization: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self_only">Self-revocation only</SelectItem>
                  <SelectItem value="self_and_trusted_ra">Self-revocation and trusted RA</SelectItem>
                </SelectContent>
              </Select>
            </PlannedRow>
            {rr.authorization === 'self_and_trusted_ra' && (
              <PlannedSwitchRow
                label="Require id-kp-cmcRA EKU for RA actions"
                checked={rr.trusted_ra.require_cmc_ra_eku}
                onCheckedChange={(v) => onRrChange({ trusted_ra: { ...rr.trusted_ra, require_cmc_ra_eku: v } })}
              />
            )}
          </CmpOperationGate>
        </SettingsSection>

        {rr.enabled && (
          <>
            <Separator />

            <SettingsSection title="Reasons & Recovery" description="Which revocation reasons this DMS accepts, and whether a hold can be undone.">
              <PlannedRow label="Allowed revocation reasons">
                <CheckboxList
                  options={REVOCATION_REASON_OPTIONS}
                  selected={rr.allowed_reasons}
                  onToggle={(v) => onRrChange({ allowed_reasons: toggleValue(rr.allowed_reasons, v) })}
                />
              </PlannedRow>
              <PlannedSwitchRow label="Allow revival (removeFromCRL)" description="Permit un-revoking a certificate previously placed on hold." checked={rr.allow_revival} onCheckedChange={(v) => onRrChange({ allow_revival: v })} />
            </SettingsSection>
          </>
        )}
      </TabsContent>

      {/* ── Cross-Certification Request / Response (CCR/CCP) ── */}
      <TabsContent value="ccr" className="mt-6">
        <SettingsSection title="Cross-Certification" description="A privileged CA-to-CA operation. Disabled by default.">
          <CmpOperationGate
            id="cmpCcrEnabled"
            label="Enable CMP cross-certification operation"
            description="Accept ccr requests on this DMS. Off by default."
            disabledNote="Cross-certification is off — every ccr request is rejected. This is the recommended setting unless a specific CA trust relationship requires it."
            checked={ccr.enabled}
            onCheckedChange={(v) => onCcrChange({ enabled: v })}
          >
            <PlannedSwitchRow label="Require the requester to be a CA" checked={ccr.require_ca_certificate} onCheckedChange={(v) => onCcrChange({ require_ca_certificate: v })} />
            <PlannedSwitchRow label="Require proof of possession" checked={ccr.require_proof_of_possession} onCheckedChange={(v) => onCcrChange({ require_proof_of_possession: v })} />
          </CmpOperationGate>
        </SettingsSection>

        {ccr.enabled && (
          <>
            <Separator />

            <SettingsSection title="Trusted Requesting CAs" description="Decide whether any CA may request cross-certification, or only a specific allow-list.">
              <PlannedRow label="Who may request">
                <Select value={ccr.requester_mode} onValueChange={(v: CmpCcrSettings['requester_mode']) => onCcrChange({ requester_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any CA (no restriction)</SelectItem>
                    <SelectItem value="restricted">Only CAs on the allow-list below</SelectItem>
                  </SelectContent>
                </Select>
              </PlannedRow>

              <div className="space-y-1.5">
                <Label>Allow-listed CAs</Label>
                <div className="space-y-2">
                  {ccrTrustedRequesterCAs.length > 0 ? ccrTrustedRequesterCAs.map(ca => (
                    <div key={ca.id} className="flex items-center gap-2 group">
                      <CaVisualizerCard ca={ca} allCryptoEngines={kur.allCryptoEngines} className="flex-grow shadow-none border-border" />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => onRemoveCcrTrustedRequesterCa(ca.id)}><X className="h-4 w-4" /></Button>
                    </div>
                  )) : <p className="text-sm text-muted-foreground italic">No CAs added yet.</p>}
                </div>
                <Button type="button" variant="secondary" onClick={onAddCcrTrustedRequesterCa}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Trusted Requesting CA
                </Button>
                {ccr.requester_mode === 'any' && (
                  <p className="text-xs text-muted-foreground">
                    Not enforced while "Who may request" is set to Any CA above.
                  </p>
                )}
                {ccr.requester_mode === 'restricted' && ccrTrustedRequesterCAs.length === 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      No CA is allow-listed — every cross-certification request will be rejected until you add at least one.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </SettingsSection>

            <Separator />

            <SettingsSection title="Validity & Approval" description="How long a cross-certificate may be valid for, and whether an administrator must approve it first.">
              <PlannedRow label="Maximum validity">
                <DurationInput id="ccr-max-validity" label="" value={ccr.maximum_validity} onChange={(v) => onCcrChange({ maximum_validity: v })} placeholder="e.g., 8760h" />
              </PlannedRow>
              <PlannedRow label="Approval">
                <Select value={ccr.workflow} onValueChange={(v: CmpCcrSettings['workflow']) => onCcrChange({ workflow: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Issue directly</SelectItem>
                    <SelectItem value="administrator_approval">Require administrator approval</SelectItem>
                  </SelectContent>
                </Select>
              </PlannedRow>
              <p className="text-xs text-muted-foreground">
                Subject/name constraints and a pinned issuance profile are enforced by the backend but not yet exposed
                here as editable fields.
              </p>
            </SettingsSection>
          </>
        )}
      </TabsContent>

      {/* ── General Messages (GENM/GENP) ── Same shape as the Enrollment tab:
          the operation's own gate first, then one section per id-it
          information type it can answer, each with its own gate and — where
          the type has a payload to shape — its settings behind it. */}
      <TabsContent value="genm" className="mt-6">
        <SettingsSection
          title="General Messages"
          description={<>Informational CMP queries (<RfcLink rfc={9483} section="4.3" />). Every information type below is served through this operation, so turning it off disables all of them.</>}
        >
          <CmpOperationGate
            id="cmpGenmEnabled"
            label="Enable CMP general message operation"
            description="Accept genm requests on this DMS."
            disabledNote="General messages are off — every genm request is rejected, including caCerts. Clients cannot discover this DMS's CA certificates or capabilities over CMP."
            checked={genm.enabled}
            onCheckedChange={genm.onEnabledChange}
          >
            <PlannedRow label="Access policy" description="Who may send a general message to this DMS.">
              <Select value={genm.accessPolicy} onValueChange={(v: CmpGenmAccessPolicy) => genm.onAccessPolicyChange(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public_discovery">Public discovery</SelectItem>
                  <SelectItem value="require_signed">Require signed CMP message</SelectItem>
                </SelectContent>
              </Select>
            </PlannedRow>
          </CmpOperationGate>
        </SettingsSection>

        {genm.enabled && GENM_INFO_TYPES.filter((t) => t.live).map((t) => (
          <React.Fragment key={t.key}>
            <Separator />

            <SettingsSection title={operationTitle(t.oid, t.title, { uppercase: false })} description={t.description}>
              <CmpOperationGate
                id={`cmpGenm-${t.key}`}
                label={t.switchLabel}
                description={t.switchDescription}
                disabledNote={t.disabledNote}
                checked={genm.informationTypes[t.key]}
                onCheckedChange={(v) => genm.onInformationTypesChange({ ...genm.informationTypes, [t.key]: v })}
              >
                {genmInfoTypeSettings(t.key)}
              </CmpOperationGate>
            </SettingsSection>
          </React.Fragment>
        ))}
      </TabsContent>
    </>
  );
}
