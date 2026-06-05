'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  PlusCircle,
  Trash2,
  Loader2,
  AlertCircle,
  Info,
  ShieldCheck,
  UserCheck,
  UserCog,
  Lock,
  Settings2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { createPrincipal } from '@/lib/authz-api';
import { useAuth } from '@/contexts/AuthContext';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { fetchAndProcessCAs, parseCertificatePemDetails, type CA } from '@/lib/ca-data';
import { CardSelector, type CardSelectorOption } from '@/components/shared/CardSelector';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
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
  const { user } = useAuth();
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
  const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);
  const [matchMode, setMatchMode] = useState<X509AuthConfig['match_mode']>('any_from_ca');
  const [serialNumber, setSerialNumber] = useState('');
  const [subjectCn, setSubjectCn] = useState('');

  useEffect(() => {
    setPrincipalId(crypto.randomUUID());
  }, []);

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
    if (allCAs.length === 0) {
      await loadCAs();
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
      if (matchMode === 'cn_and_ca' && !subjectCn.trim()) {
        setError('Subject CN is required when using cn_and_ca match mode');
        return;
      }
    }

    try {
      setSubmitting(true);

      let auth_config: any = {};
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
        if (matchMode === 'cn_and_ca') auth_config.subject_cn = subjectCn;
      }

      await createPrincipal({ id: principal_id, name, description: description.trim(), type, auth_config, active });
      router.push('/authz/principals');
    } catch (err: any) {
      setError(err.message || 'Failed to create principal');
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

      <div className="space-y-3">
        {claims.map((claim, index) => (
          <div key={index} className="rounded-lg border bg-card">
            <div className="p-4">
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
                    placeholder={
                      claim.operator === 'matches' ? '^[a-z]+@example\\.com$' : 'Claim value'
                    }
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
          </div>
        ))}
      </div>
    </div>
  );

  const renderX509Form = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">
          Certification Authority <span className="text-destructive">*</span>
        </Label>
        <Button
          type="button"
          variant="outline"
          onClick={handleOpenCaSelector}
          className="mt-1 h-auto w-full justify-start py-3 text-left font-normal"
          disabled={submitting}
        >
          {selectedCa ? (
            <span className="flex min-w-0 items-center gap-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{selectedCa.name}</span>
                {caTrustValue && (
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                    {caTrustValue}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-3 text-muted-foreground">
              <Plus className="h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm font-medium">Select a Certification Authority</span>
                <span className="mt-0.5 block text-xs">
                  {caTrustIdentityType === 'fingerprint'
                    ? 'SHA-256 fingerprint will be derived automatically'
                    : 'Authority Key Identifier (AKI) will be resolved automatically'}
                </span>
              </span>
            </span>
          )}
        </Button>
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
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {matchMode === 'any_from_ca' && 'Trust any certificate issued by the specified CA.'}
            {matchMode === 'serial_and_ca' && 'Match a specific certificate by serial number and issuing CA.'}
            {matchMode === 'cn_and_ca' && 'Match certificates by Common Name pattern. Wildcards such as *.example.com are supported.'}
          </p>
        </div>
      </div>

      {selectedCa && caTrustValue && (
        <div className="space-y-1.5">
          <Label htmlFor="caTrustValue" className="text-sm">Derived CA Trust Value</Label>
          <Input
            id="caTrustValue"
            value={caTrustValue}
            readOnly
            className="bg-muted/50 font-mono text-xs"
          />
        </div>
      )}

      {matchMode === 'serial_and_ca' && (
        <div className="space-y-1.5">
          <Label htmlFor="serialNumber" className="text-sm">
            Serial Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="serialNumber"
            placeholder="1A:2B:3C:4D:5E:6F:7A:8B:9C:0D:1E:2F:3A:4B:5C:6D"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            required
            disabled={submitting}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Certificate serial number in colon-separated hex format.</p>
        </div>
      )}

      {matchMode === 'cn_and_ca' && (
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

                {type === 'oidc' && renderOidcForm()}
                {type === 'x509' && renderX509Form()}
              </div>
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
        title="Select Certification Authority"
        description="Choose the Certification Authority used to match X.509 client certificates."
        availableCAs={allCAs}
        isLoadingCAs={isLoadingCAs}
        errorCAs={errorCAs}
        loadCAsAction={loadCAs}
        onCaSelected={handleCaSelected}
        currentSelectedCaId={selectedCa?.id}
      />
    </BreadcrumbPage>
  );
}
