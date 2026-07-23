'use client';

import React from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info } from 'lucide-react';
import { DurationInput } from '@/components/shared/DurationInput';
import { LateralSectionTabs } from '@/components/shared/LateralSectionTabs';
import { RfcLink } from '@/components/shared/RfcLink';
import type {
  CmpIrSettings, CmpCrSettings, CmpP10crSettings, CmpRrSettings, CmpCcrSettings,
  CmpKeyPolicy, CmpIdentityChangePolicy, CmpGenmAccessPolicy, CmpGenmInformationTypes,
  CmpPopoMethod, CmpRevocationReason,
} from '@/lib/dms-api';

// Phase 2 of the CMP settings redesign: the backend now has a nested
// per-operation schema (core/pkg/models/dms_cmp_operations.go) that persists
// and round-trips through the DMS API 1:1 with these controls — so every
// field here is bound to real state and actually saved. What is NOT yet true
// is enforcement: per the backend's own doc comments, only two bridges are
// live (central_key_generation.enabled, and kur's renewal/expiry/validation-CA/
// revoke-on-supersede fields). Every other control below is saved but not yet
// read by the CMP protocol handlers — the "Planned" marker now specifically
// means "enforcement is planned", not "this isn't saved".

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
    <div className="space-y-4 rounded-md border border-dashed p-4">
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
  { key: 'root_ca_update', label: 'Root CA update', live: false },
  { key: 'certificate_request_template', label: 'Certificate request template', live: false },
  { key: 'current_crl', label: 'Current CRL', live: false },
  { key: 'crl_update', label: 'CRL update', live: false },
  { key: 'protocol_encryption_certificate', label: 'Protocol encryption certificate', live: false },
];

export function CmpGenmPlannedCapabilities({
  accessPolicy, onAccessPolicyChange, informationTypes, onInformationTypesChange,
}: {
  accessPolicy: CmpGenmAccessPolicy;
  onAccessPolicyChange: (v: CmpGenmAccessPolicy) => void;
  informationTypes: CmpGenmInformationTypes;
  onInformationTypesChange: (v: CmpGenmInformationTypes) => void;
}) {
  return (
    <div className="space-y-4 rounded-md border border-dashed p-4">
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
          {GENM_INFO_TYPES.map((t) => (
            <div key={t.key} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span className="flex items-center gap-2">
                {t.label}
                {!t.live && (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground">Unsupported</Badge>
                )}
              </span>
              <Switch
                checked={informationTypes[t.key]}
                disabled={!t.live}
                onCheckedChange={(checked) => onInformationTypesChange({ ...informationTypes, [t.key]: checked })}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Types marked <em>Unsupported</em> are recognized by the protocol layer but have no data provider yet, so
          the CA cannot answer them regardless of this toggle — those switches stay off and disabled.
        </p>
      </div>
    </div>
  );
}

function OperationHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-primary/80">{eyebrow}</p>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

interface CmpPlannedOperationTabsProps {
  ir: CmpIrSettings;
  onIrChange: (patch: Partial<CmpIrSettings>) => void;
  cr: CmpCrSettings;
  onCrChange: (patch: Partial<CmpCrSettings>) => void;
  p10cr: CmpP10crSettings;
  onP10crChange: (patch: Partial<CmpP10crSettings>) => void;
  rr: CmpRrSettings;
  onRrChange: (patch: Partial<CmpRrSettings>) => void;
  ccr: CmpCcrSettings;
  onCcrChange: (patch: Partial<CmpCcrSettings>) => void;
}

export function CmpPlannedOperationTabs({
  ir, onIrChange, cr, onCrChange, p10cr, onP10crChange, rr, onRrChange, ccr, onCcrChange,
}: CmpPlannedOperationTabsProps) {
  const policyOverrides = (
    workflow: CmpIrSettings['policy_overrides']['workflow'],
    confirmation: CmpIrSettings['policy_overrides']['confirmation'],
    onChange: (patch: Partial<CmpIrSettings['policy_overrides']>) => void,
  ) => (
    <div className="space-y-4 rounded-md border border-dashed p-4">
      <SectionHeader title="Workflow & confirmation overrides">
        Override the DMS-wide defaults from the General tab for just this operation.
      </SectionHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlannedRow label="Workflow">
          <Select value={workflow} onValueChange={(v: CmpIrSettings['policy_overrides']['workflow']) => onChange({ workflow: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit DMS default</SelectItem>
              <SelectItem value="direct">Direct (synchronous)</SelectItem>
              <SelectItem value="phased">Phased (admin-approved)</SelectItem>
            </SelectContent>
          </Select>
        </PlannedRow>
        <PlannedRow label="Confirmation">
          <Select value={confirmation} onValueChange={(v: CmpIrSettings['policy_overrides']['confirmation']) => onChange({ confirmation: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit DMS default</SelectItem>
              <SelectItem value="explicit">Explicit</SelectItem>
              <SelectItem value="implicit">Implicit</SelectItem>
            </SelectContent>
          </Select>
        </PlannedRow>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Enrollment: Initialization (IR/IP) + Certification (CR/CP) +
          PKCS#10 (P10CR/CP) ── One tab, three clickable subsections using the
          shared LateralSectionTabs pattern every CMP settings tab uses.
          ir/cr/p10cr keep entirely separate state and controls (no field
          mirroring) — they're grouped into this one tab because all three
          answer "how does a device get a certificate?". */}
      <TabsContent value="enrollment" className="mt-0">
        <LateralSectionTabs
          sections={[
            {
              value: 'ir',
              label: 'Initialization',
              content: (
                <>
                  <OperationHeader eyebrow="IR / IP" title="Initialization" description="Used for the initial bootstrap of a brand-new device into the PKI." />
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
                  {policyOverrides(ir.policy_overrides.workflow, ir.policy_overrides.confirmation, (patch) => onIrChange({ policy_overrides: { ...ir.policy_overrides, ...patch } }))}
                </>
              ),
            },
            {
              value: 'cr',
              label: 'Certification',
              content: (
                <>
                  <OperationHeader eyebrow="CR / CP" title="Certification" description="Used when a device already participates in the PKI and requests another certificate." />
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
                  {policyOverrides(cr.policy_overrides.workflow, cr.policy_overrides.confirmation, (patch) => onCrChange({ policy_overrides: { ...cr.policy_overrides, ...patch } }))}
                </>
              ),
            },
            {
              value: 'p10cr',
              label: 'PKCS #10',
              content: (
                <>
                  <OperationHeader eyebrow="P10CR / CP" title="PKCS #10" description="The simplest enrollment path: a plain PKCS#10 CSR wrapped in a CMP message." />
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
                </>
              ),
            },
          ]}
        />
      </TabsContent>

      {/* ── Revocation Request / Response (RR/RP) ── */}
      <TabsContent value="rr" className="mt-0">
        <LateralSectionTabs
          sections={[
            {
              value: 'authorization',
              label: 'Authorization',
              content: (
                <>
                  <OperationHeader eyebrow="RR / RP" title="Revocation" description="Lets a device (or a trusted RA) revoke a certificate over CMP." />
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
                </>
              ),
            },
            {
              value: 'reasons',
              label: 'Reasons & Recovery',
              content: (
                <>
                  <OperationHeader eyebrow="RR / RP" title="Reasons & Recovery" description="Which revocation reasons this DMS accepts, and whether a hold can be undone." />
                  <PlannedRow label="Allowed revocation reasons">
                    <CheckboxList
                      options={REVOCATION_REASON_OPTIONS}
                      selected={rr.allowed_reasons}
                      onToggle={(v) => onRrChange({ allowed_reasons: toggleValue(rr.allowed_reasons, v) })}
                    />
                  </PlannedRow>
                  <PlannedSwitchRow label="Allow revival (removeFromCRL)" description="Permit un-revoking a certificate previously placed on hold." checked={rr.allow_revival} onCheckedChange={(v) => onRrChange({ allow_revival: v })} />
                  <PlannedSwitchRow label="Allow revoking expired certificates" checked={rr.allow_expired_target} onCheckedChange={(v) => onRrChange({ allow_expired_target: v })} />
                </>
              ),
            },
          ]}
        />
      </TabsContent>

      {/* ── Cross-Certification Request / Response (CCR/CCP) ── */}
      <TabsContent value="ccr" className="mt-0">
        <LateralSectionTabs
          sections={[
            {
              value: 'trust',
              label: 'Trust & Proof of Possession',
              content: (
                <>
                  <OperationHeader eyebrow="CCR / CCP" title="Cross-Certification" description="A privileged CA-to-CA operation. Disabled by default." />
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
                </>
              ),
            },
            {
              value: 'validity',
              label: 'Validity & Approval',
              content: (
                <>
                  <OperationHeader eyebrow="CCR / CCP" title="Validity & Approval" description="How long a cross-certificate may be valid for, and whether an administrator must approve it first." />
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
                    Trusted requesting CAs, subject/name constraints, and a pinned issuance profile are enforced by the
                    backend but not yet exposed here as editable fields.
                  </p>
                </>
              ),
            },
          ]}
        />
      </TabsContent>
    </>
  );
}
