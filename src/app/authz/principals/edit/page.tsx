'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, AlertCircle, Info, Plus, Trash2, ChevronsUpDown } from 'lucide-react';
import { getPrincipal, updatePrincipal } from '@/lib/authz-api';
import { useAuth } from '@/contexts/AuthContext';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { fetchAndProcessCAs, parseCertificatePemDetails, type CA } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { normalizeX509AuthConfig } from '@/lib/x509-auth-config';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { SubjectAttributesEditor } from '@/components/authz/SubjectAttributesEditor';
import {
  newSubjectAttributeRow,
  subjectAttributeRowsFromRecord,
  validateSubjectAttributeRows,
  withSubjectAttributeConfig,
  type SubjectAttributeRow,
} from '@/lib/principal-subject-attributes';
import type {
  Principal,
  PrincipalType,
  ClaimCondition,
  X509AuthConfig,
  X509CaTrustIdentityType,
} from '@/types/authz';

function EditPrincipalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const principal_id = searchParams.get('principal_id');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [principal, setPrincipal] = useState<Principal | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<PrincipalType>('oidc');
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');

  const [claims, setClaims] = useState<ClaimCondition[]>([]);

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

  const loadCAs = useCallback(async () => {
    if (!user?.access_token) {
      setErrorCAs('User not authenticated. Please log in.');
      return;
    }

    try {
      setIsLoadingCAs(true);
      setErrorCAs(null);
      const fetchedCAs = await fetchAndProcessCAs(user.access_token);
      setAllCAs(fetchedCAs);
    } catch (err: any) {
      setErrorCAs(err.message || 'Failed to load Certification Authorities');
    } finally {
      setIsLoadingCAs(false);
    }
  }, [user?.access_token]);

  const handleOpenCaSelector = async () => {
    if (allCAs.length === 0) await loadCAs();
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

  // Eagerly load CAs and crypto engines for x509 principals so the configured CA can be preselected.
  useEffect(() => {
    if (type !== 'x509') return;
    if (allCAs.length === 0 && !isLoadingCAs) loadCAs();
    if (allCryptoEngines.length === 0) {
      fetchCryptoEngines().then(setAllCryptoEngines).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Resolve the currently configured CA against the loaded CA list so it preselects on edit.
  useEffect(() => {
    if (type !== 'x509' || !caTrustValue || selectedCa || allCAs.length === 0) return;
    let cancelled = false;

    const resolveSelectedCa = async () => {
      const normalizedTarget = caTrustValue.trim().toLowerCase();

      if (caTrustIdentityType === 'authority_key_id') {
        const match = allCAs.find((ca) => (ca.authorityKeyId || '').trim().toLowerCase() === normalizedTarget);
        if (match && !cancelled) setSelectedCa(match);
        return;
      }

      for (const ca of allCAs) {
        if (!ca.pemData) continue;
        const details = await parseCertificatePemDetails(ca.pemData);
        const rawFingerprint = (details.fingerprintSha256 || '').replace(/:/g, '').toLowerCase();
        const candidate = rawFingerprint ? `sha256:${rawFingerprint}` : '';
        if (candidate === normalizedTarget) {
          if (!cancelled) setSelectedCa(ca);
          return;
        }
      }
    };

    resolveSelectedCa();
    return () => { cancelled = true; };
  }, [type, caTrustValue, caTrustIdentityType, allCAs, selectedCa]);

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

  useEffect(() => {
    if (principal_id) loadPrincipal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal_id]);

  const loadPrincipal = async () => {
    if (!principal_id) return;

    try {
      setLoading(true);
      const fetchedPrincipal = await getPrincipal(principal_id);
      setPrincipal(fetchedPrincipal);

      setName(fetchedPrincipal.name);
      setType(fetchedPrincipal.type);
      setActive(fetchedPrincipal.active);
      setDescription((fetchedPrincipal as any).description || '');
      setSubjectAttributes(subjectAttributeRowsFromRecord((fetchedPrincipal.auth_config as any)?.subject_attributes));
      setSubjectAttributeMappings(subjectAttributeRowsFromRecord((fetchedPrincipal.auth_config as any)?.subject_attribute_mappings));

      if (fetchedPrincipal.type === 'oidc') {
        const oidcClaims = (fetchedPrincipal.auth_config as any)?.claims;
        setClaims(Array.isArray(oidcClaims) ? oidcClaims : []);
      }

      if (fetchedPrincipal.type === 'x509') {
        const x509Config = normalizeX509AuthConfig(fetchedPrincipal.auth_config);
        setCaTrustIdentityType(x509Config.ca_trust.identity_type);
        setCaTrustValue(x509Config.ca_trust.value);
        setMatchMode(x509Config.match_mode);
        setSerialNumber(x509Config.serial_number || '');
        setSubjectCn(x509Config.subject_cn || '');
      }

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load principal');
    } finally {
      setLoading(false);
    }
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

    if (!principal_id || !principal) {
      setError('Principal ID is missing');
      return;
    }

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

      let auth_config: Record<string, unknown> =
        principal.auth_config && typeof principal.auth_config === 'object'
          ? { ...(principal.auth_config as Record<string, unknown>) }
          : {};
      if (type === 'oidc') {
        auth_config = { ...auth_config, claims };
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
          ...auth_config,
          ca_trust: {
            identity_type: caTrustIdentityType,
            value: resolvedCaTrustValue,
            ...(selectedCaPem ? { pem: selectedCaPem } : {}),
          },
          match_mode: matchMode,
        };
        delete auth_config.serial_number;
        delete auth_config.subject_cn;
        if (matchMode === 'serial_and_ca') auth_config.serial_number = serialNumber;
        if (matchMode === 'cn_and_ca' || matchMode === 'subject_cn') auth_config.subject_cn = subjectCn;
      }

      auth_config = withSubjectAttributeConfig(auth_config, subjectAttributes, subjectAttributeMappings);

      await updatePrincipal(principal_id, { name, description: description.trim(), active, auth_config: auth_config as any });
      router.push(`/authz/principals/details?principal_id=${principal_id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update principal');
    } finally {
      setSubmitting(false);
    }
  };

  const renderOidcForm = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Define claim conditions used to match the JWT of an incoming authentication request.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleAddClaim} className="shrink-0" disabled={submitting}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Claim
        </Button>
      </div>

      {claims.length === 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={handleAddClaim}
          disabled={submitting}
          className="h-auto w-full flex-col gap-2 border-dashed py-6"
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Add your first claim condition</span>
          <span className="text-xs text-muted-foreground">At least one claim is required to identify this principal</span>
        </Button>
      )}

      <div className="rounded-lg border divide-y">
        {claims.map((claim, index) => (
          <div key={index} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Claim condition {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemoveClaim(index)}
                disabled={submitting}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Claim Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="sub, email, groups"
                  value={claim.claim}
                  onChange={(e) => handleUpdateClaim(index, 'claim', e.target.value)}
                  required
                  disabled={submitting}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Operator</Label>
                <Select
                  value={claim.operator}
                  onValueChange={(value: 'equals' | 'contains' | 'matches') =>
                    handleUpdateClaim(index, 'operator', value)
                  }
                  disabled={submitting}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="matches">Matches (Regex)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">
                  Value <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder={claim.operator === 'matches' ? '^[a-z]+@example\\.com$' : 'Claim value'}
                  value={claim.value}
                  onChange={(e) => handleUpdateClaim(index, 'value', e.target.value)}
                  required
                  disabled={submitting}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {claim.operator === 'matches' && (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Regex pattern. Ensure it is valid before saving.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderX509Form = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">
          Certification Authority <span className="text-destructive">*</span>
        </Label>
        <button
          type="button"
          onClick={handleOpenCaSelector}
          disabled={submitting}
          className="flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-input/50 px-3 text-sm whitespace-nowrap transition-[color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={selectedCa ? 'text-foreground' : 'text-muted-foreground'}>
            {selectedCa ? selectedCa.name : caTrustValue ? 'CA configured' : 'Select a Certification Authority...'}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {selectedCa ? (
          <CaVisualizerCard ca={selectedCa} allCryptoEngines={allCryptoEngines} className="shadow-none border-border" />
        ) : caTrustValue ? (
          <p className="truncate font-mono text-xs text-muted-foreground">{caTrustValue}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="caTrustIdentityType" className="text-sm">
            CA Identity Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={caTrustIdentityType}
            onValueChange={(value: X509CaTrustIdentityType) => setCaTrustIdentityType(value)}
            disabled={submitting}
          >
            <SelectTrigger id="caTrustIdentityType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fingerprint">Fingerprint (SHA-256)</SelectItem>
              <SelectItem value="authority_key_id">Authority Key Identifier (AKI)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">How the trusted CA is identified for certificate matching.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="matchMode" className="text-sm">Match Mode</Label>
          <Select
            value={matchMode}
            onValueChange={(value: X509AuthConfig['match_mode']) => setMatchMode(value)}
            disabled={submitting}
          >
            <SelectTrigger id="matchMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any_from_ca">Any from CA</SelectItem>
              <SelectItem value="serial_and_ca">Serial Number + CA</SelectItem>
              <SelectItem value="cn_and_ca">Common Name (CN) + CA</SelectItem>
              <SelectItem value="subject_cn">Subject Common Name</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {matchMode === 'any_from_ca' && 'Trust any certificate issued by the specified CA.'}
            {matchMode === 'serial_and_ca' && 'Match a specific certificate by serial number and issuing CA.'}
            {matchMode === 'cn_and_ca' && 'Match certificates by Common Name pattern. Wildcards such as *.example.com are supported.'}
            {matchMode === 'subject_cn' && 'Match certificates by Subject Common Name.'}
          </p>
        </div>
      </div>

      {matchMode === 'serial_and_ca' && (
        <div className="space-y-1.5">
          <Label htmlFor="serialNumber" className="text-sm">
            Serial Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="serialNumber"
            placeholder="1A2B3C4D5E6FF7A8B9C0D1E2F3A4B5C6D"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            required
            disabled={submitting}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Certificate serial number.</p>
        </div>
      )}

      {(matchMode === 'cn_and_ca' || matchMode === 'subject_cn') && (
        <div className="space-y-1.5">
          <Label htmlFor="subjectCn" className="text-sm">
            Subject Common Name (CN) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="subjectCn"
            placeholder="device-*.example.com"
            value={subjectCn}
            onChange={(e) => setSubjectCn(e.target.value)}
            required
            disabled={submitting}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="rounded bg-muted px-1 py-0.5 text-xs">*</code> for wildcard matching, e.g.{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">*.sensors.example.com</code>
          </p>
        </div>
      )}
    </div>
  );

  const applyWfxDevicePreset = () => {
    setMatchMode('subject_cn');
    setSubjectAttributeMappings((rows) => {
      const nextRows = rows.filter((row) => row.key.trim() !== 'client_id');
      return [newSubjectAttributeRow('client_id', 'x509.subject.cn'), ...nextRows];
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !principal) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push('/authz/principals')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Principals
        </Button>
      </div>
    );
  }

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Principals', href: '/authz/principals' },
    ...(principal_id
      ? [{ label: principal?.name || 'Details', href: `/authz/principals/details?principal_id=${principal_id}` }]
      : []),
    { label: 'Edit' },
  ];

  return (
    <BreadcrumbPage items={breadcrumbItems} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto space-y-5 mb-8">

        <form onSubmit={handleSubmit} className="space-y-0">

          {/* ── Page header ── */}
          <div className="pb-8 border-b">
            <h1 className="text-2xl font-bold">Edit Principal</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Update the authentication identity and configuration.
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
                    placeholder="Principal name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="id">Principal ID</Label>
                  <Input id="id" value={principal?.id || ''} readOnly className="bg-muted/50 font-mono text-xs" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description"
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
                The authentication type cannot be changed after creation.
              </p>
            </div>
            <div className="space-y-6 lg:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-sm">Principal Type</Label>
                <Input
                  id="type"
                  value={type === 'oidc' ? 'OIDC (OpenID Connect)' : 'X.509 Certificate'}
                  readOnly
                  className="bg-muted/50"
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                {type === 'oidc' && renderOidcForm()}
                {type === 'x509' && renderX509Form()}
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                'Save Changes'
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

export default function EditPrincipalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <EditPrincipalContent />
    </Suspense>
  );
}
