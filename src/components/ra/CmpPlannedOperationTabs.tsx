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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info, PlusCircle, Settings2, X, AlertTriangle } from 'lucide-react';
import { DurationInput } from '@/components/shared/DurationInput';
import { Separator } from '@/components/ui/separator';
import { SettingsSection } from '@/components/shared/SettingsSection';
import { RfcLink } from '@/components/shared/RfcLink';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { RenewalLifespanBar, type CertificateValidity } from '@/components/ra/RenewalLifespanBar';
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

// Phase 2 of the CMP settings redesign: the backend now has a nested
// per-operation schema (core/pkg/models/dms_cmp_operations.go) that persists
// and round-trips through the DMS API 1:1 with these controls — so every
// field here is bound to real state and actually saved.
//
// CORRECTION (post manual protocol-conformance audit, openssl cmp against a
// live server): the "Planned" badge below was originally meant to flag fields
// the backend saves but doesn't yet enforce. That premise turned out to be
// wrong for most of this file — registration_mode, existing_device_policy,
// proof_of_possession.allowed_methods/required, cr's require_existing_device/
// certificate_behavior/maximum_active_certificates, kur's key_policy/
// identity_change_policy, rr's authorization/allow_revival/allow_expired_target/
// allowed_reasons/trusted_ra.require_cmc_ra_eku, and nearly all of ccr are ALL
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
];

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

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
    <div className="space-y-4">
      <SectionHeader title="Key & identity policy" badge={false}>
        Constrain how much a key update may change relative to the certificate being replaced.
      </SectionHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </div>
  );
}

const GENM_INFO_TYPES: { key: keyof CmpGenmInformationTypes; label: string; live: boolean }[] = [
  { key: 'ca_certificates', label: 'CA certificates', live: true },
  { key: 'signing_key_types', label: 'Signing key types', live: true },
  { key: 'encryption_key_types', label: 'Encryption key types', live: true },
  { key: 'preferred_symmetric_algorithm', label: 'Preferred symmetric algorithm', live: true },
  { key: 'supported_languages', label: 'Supported languages', live: true },
  { key: 'root_ca_update', label: 'Root CA update', live: true },
  { key: 'certificate_request_template', label: 'Certificate request template', live: true },
  { key: 'current_crl', label: 'Current CRL', live: true },
  { key: 'crl_update', label: 'CRL update', live: true },
  // Hard-disabled server-side for the time being (genmInfoTypeEnabled rejects
  // it): Lamassu does not provision a dedicated protocol-encryption certificate,
  // so the CA has nothing real to return. Kept hidden (live: false) — and the
  // save path forces its flag to false — until it is actually implemented.
  // (id-it-revPassphrase is likewise disabled server-side, but it has no config
  // flag or toggle, so there is nothing to represent here.)
  { key: 'protocol_encryption_certificate', label: 'Protocol encryption certificate', live: false },
];

export function CmpGenmPlannedCapabilities({
  accessPolicy, onAccessPolicyChange, informationTypes, onInformationTypesChange,
  preferredSymmetricAlgorithm, onPreferredSymmetricAlgorithmChange,
}: {
  accessPolicy: CmpGenmAccessPolicy;
  onAccessPolicyChange: (v: CmpGenmAccessPolicy) => void;
  informationTypes: CmpGenmInformationTypes;
  onInformationTypesChange: (v: CmpGenmInformationTypes) => void;
  preferredSymmetricAlgorithm: CmpPreferredSymmetricAlgorithm;
  onPreferredSymmetricAlgorithmChange: (v: CmpPreferredSymmetricAlgorithm) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader title="General message capabilities" badge={false}>
        Which id-it information types the CA answers, and who may ask.
      </SectionHeader>
      <PlannedRow label="Access policy">
        <Select value={accessPolicy} onValueChange={(v: CmpGenmAccessPolicy) => onAccessPolicyChange(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="public_discovery">Public discovery</SelectItem>
            <SelectItem value="require_signed">Require signed CMP message</SelectItem>
          </SelectContent>
        </Select>
      </PlannedRow>
      <div className="space-y-2">
        <Label className="text-sm">Enabled information types</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GENM_INFO_TYPES.filter((t) => t.live).map((t) => (
            <div key={t.key} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>{t.label}</span>
              <div className="flex items-center gap-1">
                {t.key === 'preferred_symmetric_algorithm' && informationTypes.preferred_symmetric_algorithm && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Choose algorithm">
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64" align="end">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Algorithm advertised in the response</Label>
                        <Select value={preferredSymmetricAlgorithm} onValueChange={(v: CmpPreferredSymmetricAlgorithm) => onPreferredSymmetricAlgorithmChange(v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PREFERRED_SYMM_ALG_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <Switch
                  checked={informationTypes[t.key]}
                  onCheckedChange={(checked) => onInformationTypesChange({ ...informationTypes, [t.key]: checked })}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Only the id-it information types the CA can actually answer are listed.
        </p>
      </div>
    </div>
  );
}

function operationTitle(eyebrow: string, title: string) {
  return (
    <>
      <span className="block text-xs font-medium uppercase tracking-wide text-primary/80">{eyebrow}</span>
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

// Key Update (KUR/KUP) lives inside the Enrollment tab as a fourth section
// alongside IR/CR/P10CR — it still answers "how does a device get a
// certificate?", so it belongs with the others rather than as its own tab.
interface CmpKurTabProps {
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
  ccrTrustedRequesterCAs: CA[];
  onRemoveCcrTrustedRequesterCa: (id: string) => void;
  onAddCcrTrustedRequesterCa: () => void;
  // Issuance profiles selectable as a per-operation profile pin. Empty is fine
  // — the picker still offers "Inherit DMS default".
  availableProfiles?: ProfileOption[];
  // Enrollment CA & Profile + Device Policy — enrollment-scoped defaults,
  // hoisted by the page and rendered ahead of the per-operation sections
  // since they're enrollment options, not general DMS config.
  enrollmentGeneralSection: React.ReactNode;
}

export function CmpPlannedOperationTabs({
  ir, onIrChange, cr, onCrChange, p10cr, onP10crChange, kur, ckg, rr, onRrChange, ccr, onCcrChange,
  ccrTrustedRequesterCAs, onRemoveCcrTrustedRequesterCa, onAddCcrTrustedRequesterCa,
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
    <div className="space-y-4">
      <SectionHeader title="Workflow & confirmation overrides" badge={false}>
        Override the DMS-wide defaults from the General tab for just this operation.
      </SectionHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlannedRow label="Workflow">
          <Select value={workflow} onValueChange={(v: CmpPolicyOverrides['workflow']) => onChange({ workflow: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit DMS default</SelectItem>
              <SelectItem value="direct">Direct (synchronous)</SelectItem>
              <SelectItem value="phased">Phased (admin-approved)</SelectItem>
            </SelectContent>
          </Select>
        </PlannedRow>
        <PlannedRow label="Confirmation">
          <Select value={confirmation} onValueChange={(v: CmpPolicyOverrides['confirmation']) => onChange({ confirmation: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit DMS default</SelectItem>
              <SelectItem value="explicit">Explicit</SelectItem>
              <SelectItem value="implicit">Implicit</SelectItem>
            </SelectContent>
          </Select>
        </PlannedRow>
        <PlannedRow label="Issuance profile" description="Pin a specific issuance profile for this operation instead of the DMS enrollment CA's default.">
          <Select
            value={issuanceProfileId ?? 'inherit'}
            onValueChange={(v) => onChange({ issuance_profile_id: v === 'inherit' ? null : v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit DMS default</SelectItem>
              {availableProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PlannedRow>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Enrollment: Initialization (IR/IP) + Certification (CR/CP) +
          PKCS#10 (P10CR/CP) ── One tab, three stacked sections in the standard
          2-col settings layout. ir/cr/p10cr keep entirely separate state and
          controls (no field mirroring) — they're grouped into this one tab
          because all three answer "how does a device get a certificate?". */}
      <TabsContent value="enrollment" className="mt-0">
        {enrollmentGeneralSection}

        <Separator />

        <SettingsSection title={operationTitle('IR / IP', 'Initialization')} description="Used for the initial bootstrap of a brand-new device into the PKI.">
          <PlannedRow label="Device registration" description="How devices are provisioned when they present an initialization request.">
            <Select value={ir.registration_mode} onValueChange={(v: CmpIrSettings['registration_mode']) => onIrChange({ registration_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit DMS setting</SelectItem>
                <SelectItem value="jitp">Just-in-time provisioning</SelectItem>
                <SelectItem value="pre_registration">Pre-registered devices only</SelectItem>
              </SelectContent>
            </Select>
          </PlannedRow>
          <PlannedRow label="Existing-device behavior">
            <Select value={ir.existing_device_policy} onValueChange={(v: CmpIrSettings['existing_device_policy']) => onIrChange({ existing_device_policy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reject">Reject</SelectItem>
                <SelectItem value="replace">Replace existing identity</SelectItem>
              </SelectContent>
            </Select>
          </PlannedRow>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PlannedRow label="CRMF authenticator control" description={<>id-regCtrl-authenticator (<RfcLink rfc={4211} section="6.2" />).</>}>
              <Select value={ir.authenticator_control.mode} onValueChange={(v: CmpIrSettings['authenticator_control']['mode']) => onIrChange({ authenticator_control: { mode: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="required">Required</SelectItem>
                </SelectContent>
              </Select>
            </PlannedRow>
            <PlannedRow label="Registration token" description={<>id-regCtrl-regToken (<RfcLink rfc={4211} section="6.1" />).</>}>
              <Select value={ir.registration_token.mode} onValueChange={(v: CmpIrSettings['registration_token']['mode']) => onIrChange({ registration_token: { mode: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="required">Required</SelectItem>
                </SelectContent>
              </Select>
            </PlannedRow>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Registration tokens are one-time credentials provisioned or generated independently of DMS
              configuration — this control governs whether the CA <em>requires</em> one, not the token values themselves.
            </AlertDescription>
          </Alert>
          {policyOverrides(ir.policy_overrides.workflow, ir.policy_overrides.confirmation, ir.policy_overrides.issuance_profile_id, (patch) => onIrChange({ policy_overrides: { ...ir.policy_overrides, ...patch } }))}
        </SettingsSection>

        <Separator />

        <SettingsSection title={operationTitle('CR / CP', 'Certification')} description="Used when a device already participates in the PKI and requests another certificate.">
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
        </SettingsSection>

        <Separator />

        <SettingsSection title={operationTitle('P10CR / CP', 'PKCS #10')} description="The simplest enrollment path: a plain PKCS#10 CSR wrapped in a CMP message.">
          <PlannedSwitchRow label="Enable PKCS #10 enrollment" checked={p10cr.enabled} onCheckedChange={(v) => onP10crChange({ enabled: v })} />
          <PlannedRow label="Device registration">
            <Select value={p10cr.registration_mode} onValueChange={(v: CmpP10crSettings['registration_mode']) => onP10crChange({ registration_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit DMS setting</SelectItem>
                <SelectItem value="jitp">Just-in-time provisioning</SelectItem>
                <SelectItem value="pre_registration">Pre-registered devices only</SelectItem>
              </SelectContent>
            </Select>
          </PlannedRow>
          <PlannedRow label="Existing-device behavior">
            <Select value={p10cr.existing_device_policy} onValueChange={(v: CmpP10crSettings['existing_device_policy']) => onP10crChange({ existing_device_policy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reject">Reject</SelectItem>
                <SelectItem value="replace">Replace existing identity</SelectItem>
              </SelectContent>
            </Select>
          </PlannedRow>
          <div className="space-y-2 rounded-md border bg-muted/20 p-4">
            <p className="text-sm font-medium">Fixed behavior for PKCS #10</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>CSR signature verification: <span className="text-foreground">Always required</span></li>
              <li>CRMF proof-of-possession: <span className="text-foreground">Not applicable</span></li>
              <li>Central key generation: <span className="text-foreground">Not supported</span></li>
              <li>CRMF registration controls: <span className="text-foreground">Not applicable</span></li>
            </ul>
          </div>
        </SettingsSection>

        <Separator />

        <SettingsSection title={operationTitle('KUR / KUP', 'Key Update')} description={<>Certificate renewal. Per <RfcLink rfc={9483} section="4.1.3" /> the request is protected with the certificate being updated, so no separate authentication mode applies.</>}>
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
        </SettingsSection>

        <Separator />

        <SettingsSection title="Trust" description="Extra CAs to accept as the signer of the certificate being renewed, beyond the current enrollment CA — useful when migrating between CA hierarchies.">
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
        </SettingsSection>

        <Separator />

        <SettingsSection title="Key & Identity Policy">
          <CmpKurPlannedPolicy
            keyPolicy={kur.keyPolicy}
            onKeyPolicyChange={kur.onKeyPolicyChange}
            identityChangePolicy={kur.identityChangePolicy}
            onIdentityChangePolicyChange={kur.onIdentityChangePolicyChange}
          />
        </SettingsSection>

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
      </TabsContent>

      {/* ── Revocation Request / Response (RR/RP) ── */}
      <TabsContent value="rr" className="mt-0">
        <SettingsSection title="Revocation" description="Lets a device (or a trusted RA) revoke a certificate over CMP.">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Revocation requests always require signature-based protection, regardless of the DMS enrollment
              auth mode — an unsigned rr is never accepted, even under NO_AUTH or EXTERNAL_WEBHOOK.
            </AlertDescription>
          </Alert>
          <PlannedSwitchRow label="Enable CMP revocation" checked={rr.enabled} onCheckedChange={(v) => onRrChange({ enabled: v })} />
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
        </SettingsSection>

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
          <PlannedSwitchRow label="Allow revoking expired certificates" checked={rr.allow_expired_target} onCheckedChange={(v) => onRrChange({ allow_expired_target: v })} />
        </SettingsSection>
      </TabsContent>

      {/* ── Cross-Certification Request / Response (CCR/CCP) ── */}
      <TabsContent value="ccr" className="mt-0">
        <SettingsSection title="Cross-Certification" description="A privileged CA-to-CA operation. Disabled by default.">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Cross-certification is a privileged CA-to-CA operation and stays disabled by default — enable it only
              for a specific, deliberate CA trust relationship.
            </AlertDescription>
          </Alert>
          <PlannedSwitchRow label="Enable cross-certification" checked={ccr.enabled} onCheckedChange={(v) => onCcrChange({ enabled: v })} />
          <PlannedSwitchRow label="Require the requester to be a CA" checked={ccr.require_ca_certificate} onCheckedChange={(v) => onCcrChange({ require_ca_certificate: v })} />
          <PlannedSwitchRow label="Require proof of possession" checked={ccr.require_proof_of_possession} onCheckedChange={(v) => onCcrChange({ require_proof_of_possession: v })} />
        </SettingsSection>

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
      </TabsContent>
    </>
  );
}
