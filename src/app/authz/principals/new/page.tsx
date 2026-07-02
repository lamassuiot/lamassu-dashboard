'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  PlusCircle,
  Loader2,
  AlertCircle,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { createPrincipal } from '@/lib/authz-api';

import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { fetchAndProcessCAs, parseCertificatePemDetails, type CA } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CardSelector, type CardSelectorOption } from '@/components/shared/CardSelector';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { SubjectAttributesEditor } from '@/components/authz/SubjectAttributesEditor';
import { OidcClaimsEditor } from '@/components/authz/OidcClaimsEditor';
import { X509ConfigEditor } from '@/components/authz/X509ConfigEditor';
import {
  newSubjectAttributeRow,
  validateSubjectAttributeRows,
  withSubjectAttributeConfig,
  type SubjectAttributeRow,
} from '@/lib/principal-subject-attributes';
import type {
  PrincipalType,
  ClaimCondition,
  X509AuthConfig,
  X509CaTrustIdentityType,
} from '@/types/authz';

type SupportedPrincipalType = Extract<PrincipalType, 'oidc' | 'x509'>;

const PRINCIPAL_TYPE_OPTIONS: CardSelectorOption<SupportedPrincipalType>[] = [
  {
    value: 'oidc',
    icon: UserCheck,
    label: 'OIDC',
    description: 'Match a JWT from an identity provider using claim conditions.',
  },
  {
    value: 'x509',
    icon: ShieldCheck,
    label: 'X.509',
    description: 'Match mTLS client certificates issued by a trusted CA.',
  },
];

const PRINCIPAL_TYPE_LABEL: Record<SupportedPrincipalType, string> = {
  oidc: 'OpenID Connect',
  x509: 'X.509 Certificate',
};

export default function NewPrincipalPage() {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic principal fields
  const [principal_id, setPrincipalId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<SupportedPrincipalType>('oidc');
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');

  // OIDC specific fields
  const [claims, setClaims] = useState<ClaimCondition[]>([]);

  // X.509 specific fields
  const [caTrustIdentityType, setCaTrustIdentityType] = useState<X509CaTrustIdentityType>('fingerprint');
  const [caTrustValue, setCaTrustValue] = useState('');
  const [selectedCa, setSelectedCa] = useState<CA | null>(null);
  const [allCAs, setAllCAs] = useState<CA[]>([]);
  const [isLoadingCAs, setIsLoadingCAs] = useState(false);
  const [errorCAs, setErrorCAs] = useState<string | null>(null);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);
  const [matchMode, setMatchMode] = useState<X509AuthConfig['match_mode']>('any_from_ca');
  const [serialNumber, setSerialNumber] = useState('');
  const [subjectCn, setSubjectCn] = useState('');
  const [subjectAttributes, setSubjectAttributes] = useState<SubjectAttributeRow[]>([]);
  const [subjectAttributeMappings, setSubjectAttributeMappings] = useState<SubjectAttributeRow[]>([]);

  useEffect(() => {
    setPrincipalId(crypto.randomUUID());
  }, []);

  const loadCAs = useCallback(async () => {
    try {
      setIsLoadingCAs(true);
      setErrorCAs(null);
      const fetchedCAs = await fetchAndProcessCAs();
      setAllCAs(fetchedCAs);
    } catch (err: any) {
      setErrorCAs(err.message || 'Failed to load Certification Authorities');
    } finally {
      setIsLoadingCAs(false);
    }
  }, []);

  const handleOpenCaSelector = async () => {
    if (allCAs.length === 0) {
      await loadCAs();
    }
    if (allCryptoEngines.length === 0) {
      try {
        setAllCryptoEngines(await fetchCryptoEngines());
      } catch {
        // Icons fall back to a generic indicator if engines fail to load.
      }
    }
    setIsCaSelectorOpen(true);
  };

  const handleCaSelected = (ca: CA) => {
    setSelectedCa(ca);
    setIsCaSelectorOpen(false);
  };

  useEffect(() => {
    const recalculateCaTrustValue = async () => {
      if (!selectedCa) return;

      if (caTrustIdentityType === 'authority_key_id') {
        setCaTrustValue((selectedCa.authorityKeyId || '').trim());
        return;
      }

      if (!selectedCa.pemData) {
        setCaTrustValue('');
        return;
      }

      const details = await parseCertificatePemDetails(selectedCa.pemData);
      const rawFingerprint = (details.fingerprintSha256 || '').replace(/:/g, '').toLowerCase();
      setCaTrustValue(rawFingerprint ? `SHA256:${rawFingerprint}` : '');
    };

    recalculateCaTrustValue();
  }, [caTrustIdentityType, selectedCa]);

  const deriveCaTrustValue = async (): Promise<string> => {
    if (!selectedCa) return caTrustValue.trim();
    if (caTrustIdentityType === 'authority_key_id') return (selectedCa.authorityKeyId || '').trim();
    return caTrustValue.trim();
  };

  const handleAddClaim = () => {
    setClaims([...claims, { claim: '', operator: 'equals', value: '' }]);
  };

  const handleRemoveClaim = (index: number) => {
    setClaims(claims.filter((_, i) => i !== index));
  };

  const handleUpdateClaim = (index: number, field: keyof ClaimCondition, value: string) => {
    const updatedClaims = [...claims];
    updatedClaims[index] = { ...updatedClaims[index], [field]: value };
    setClaims(updatedClaims);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Principal name is required');
      return;
    }

    if (type === 'oidc') {
      if (claims.length === 0) {
        setError('At least one claim is required for OIDC principals');
        return;
      }
      for (let i = 0; i < claims.length; i++) {
        if (!claims[i].claim.trim() || !claims[i].value.trim()) {
          setError(`Claim ${i + 1}: Claim name and value are required`);
          return;
        }
      }
    }

    if (type === 'x509') {
      if (!selectedCa && !caTrustValue.trim()) {
        setError('Please select a Certification Authority for X.509 principals');
        return;
      }
      if (matchMode === 'serial_and_ca' && !serialNumber.trim()) {
        setError('Serial number is required when using serial_and_ca match mode');
        return;
      }
      if ((matchMode === 'cn_and_ca' || matchMode === 'subject_cn') && !subjectCn.trim()) {
        setError('Subject CN is required when using this match mode');
        return;
      }
    }

    const subjectAttributeError = validateSubjectAttributeRows(subjectAttributes, subjectAttributeMappings, type);
    if (subjectAttributeError) {
      setError(subjectAttributeError);
      return;
    }

    try {
      setSubmitting(true);

      let auth_config: Record<string, unknown> = {};
      if (type === 'oidc') {
        auth_config = { claims };
      } else if (type === 'x509') {
        const selectedCaPem = selectedCa?.rawApiData?.certificate?.certificate;
        const resolvedCaTrustValue = await deriveCaTrustValue();
        if (!resolvedCaTrustValue) {
          setError(
            caTrustIdentityType === 'fingerprint'
              ? 'Unable to derive CA fingerprint from the selected Certification Authority'
              : 'Unable to derive CA Authority Key Identifier (AKI) from the selected Certification Authority'
          );
          setSubmitting(false);
          return;
        }

        auth_config = {
          ca_trust: {
            identity_type: caTrustIdentityType,
            value: resolvedCaTrustValue,
            ...(selectedCaPem ? { pem: selectedCaPem } : {}),
          },
          match_mode: matchMode,
        };
        if (matchMode === 'serial_and_ca') auth_config.serial_number = serialNumber;
        if (matchMode === 'cn_and_ca' || matchMode === 'subject_cn') auth_config.subject_cn = subjectCn;
      }

      auth_config = withSubjectAttributeConfig(auth_config, subjectAttributes, subjectAttributeMappings);

      await createPrincipal({ id: principal_id, name, description: description.trim(), type, auth_config: auth_config as any, active });
      router.push('/authz/principals');
    } catch (err: any) {
      setError(err.message || 'Failed to create principal');
    } finally {
      setSubmitting(false);
    }
  };


  const applyWfxDevicePreset = () => {
    setMatchMode('subject_cn');
    setSubjectAttributeMappings((rows) => {
      const nextRows = rows.filter((row) => row.key.trim() !== 'client_id');
      return [newSubjectAttributeRow('client_id', 'x509.subject.cn'), ...nextRows];
    });
  };

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Principals', href: '/authz/principals' },
    { label: 'New' },
  ];

  return (
    <BreadcrumbPage items={breadcrumbItems} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto space-y-5 mb-8">

        <form onSubmit={handleSubmit} className="space-y-0">

          {/* ── Page header ── */}
          <div className="pb-8 border-b">
            <h1 className="text-2xl font-bold">Create New Principal</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Add an authentication identity to the authorization system.
            </p>
          </div>

          {error && (
            <div className="pt-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* ── Identity ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Identity</p>
              <p className="text-sm text-muted-foreground mt-1">Name and describe this principal.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    Principal Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g., Alice (System Administrator)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={submitting}
                  />
                  {!name.trim() && (
                    <p className="text-xs text-destructive">Principal name is required.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="id">Principal ID (auto-generated)</Label>
                  <Input
                    id="id"
                    value={principal_id}
                    readOnly
                    className="bg-muted/50 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">Auto-generated unique identifier.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="e.g., System administrator with full access to policies"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={submitting}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Authentication Method ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Authentication Method</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configure how incoming requests are matched to this principal.
              </p>
            </div>
            <div className="space-y-6 lg:col-span-2">
              <CardSelector
                label="Principal Type"
                value={type}
                onChange={setType}
                options={PRINCIPAL_TYPE_OPTIONS}
                columns={2}
                disabled={submitting}
              />

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center gap-2">
                  {type === 'oidc' ? (
                    <UserCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  )}
                  <p className="text-sm font-medium">{PRINCIPAL_TYPE_LABEL[type]} Configuration</p>
                </div>

                {type === 'oidc' && (
                  <OidcClaimsEditor
                    claims={claims}
                    disabled={submitting}
                    onAdd={handleAddClaim}
                    onRemove={handleRemoveClaim}
                    onUpdate={handleUpdateClaim}
                  />
                )}
                {type === 'x509' && (
                  <X509ConfigEditor
                    isNew
                    selectedCa={selectedCa}
                    caTrustValue={caTrustValue}
                    caTrustIdentityType={caTrustIdentityType}
                    setCaTrustIdentityType={setCaTrustIdentityType}
                    matchMode={matchMode}
                    setMatchMode={setMatchMode}
                    serialNumber={serialNumber}
                    setSerialNumber={setSerialNumber}
                    subjectCn={subjectCn}
                    setSubjectCn={setSubjectCn}
                    allCryptoEngines={allCryptoEngines}
                    onOpenCaSelector={handleOpenCaSelector}
                    disabled={submitting}
                  />
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Subject Attributes ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Subject Attributes</p>
              <p className="text-sm text-muted-foreground mt-1">
                Neutral attributes used by authorization policies.
              </p>
            </div>
            <div className="lg:col-span-2">
              <SubjectAttributesEditor
                type={type}
                staticRows={subjectAttributes}
                mappingRows={subjectAttributeMappings}
                onStaticRowsChange={setSubjectAttributes}
                onMappingRowsChange={setSubjectAttributeMappings}
                onApplyWfxDevicePreset={type === 'x509' ? applyWfxDevicePreset : undefined}
                disabled={submitting}
              />
            </div>
          </div>

          <Separator />

          {/* ── Activation ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Activation</p>
              <p className="text-sm text-muted-foreground mt-1">
                Inactive principals are blocked from authenticating.
              </p>
            </div>
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="active" className="cursor-pointer font-medium">Active</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enable or disable this principal's ability to authenticate.
                  </p>
                </div>
                <Switch id="active" checked={active} onCheckedChange={setActive} disabled={submitting} />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end pt-6">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
              ) : (
                <><PlusCircle className="mr-2 h-4 w-4" /> Create Principal</>
              )}
            </Button>
          </div>
        </form>
      </div>

      <CaSelectorModal
        isOpen={isCaSelectorOpen}
        onOpenChange={setIsCaSelectorOpen}
        title="Select an Issuer"
        description="Choose the Certification Authority used to match X.509 client certificates."
        availableCAs={allCAs}
        isLoadingCAs={isLoadingCAs}
        errorCAs={errorCAs}
        loadCAsAction={loadCAs}
        onCaSelected={handleCaSelected}
        currentSelectedCaId={selectedCa?.id}
        allCryptoEngines={allCryptoEngines}
        useSheet
      />
    </BreadcrumbPage>
  );
}
