'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Info,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  UserCog,
  Settings2,
  Lock,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { createPrincipal } from '@/lib/authz-api';
import { useAuth } from '@/contexts/AuthContext';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { fetchAndProcessCAs, parseCertificatePemDetails, type CA } from '@/lib/ca-data';
import type {
  PrincipalType,
  ClaimCondition,
  X509AuthConfig,
  X509CaTrustIdentityType,
} from '@/types/authz';

type SupportedPrincipalType = Extract<PrincipalType, 'oidc' | 'x509'>;

const PRINCIPAL_TYPE_CONFIG: Record<
  SupportedPrincipalType,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    short: string;
    description: string;
    iconColor: string;
    iconBg: string;
    selectedBorder: string;
    selectedBg: string;
  }
> = {
  oidc: {
    icon: UserCheck,
    label: 'OpenID Connect',
    short: 'OIDC',
    description: 'Authenticate users via identity providers using JWT claims',
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-100 dark:bg-violet-950/50',
    selectedBorder: 'border-violet-400 dark:border-violet-600',
    selectedBg: 'bg-violet-50/60 dark:bg-violet-950/20',
  },
  x509: {
    icon: ShieldCheck,
    label: 'X.509 Certificate',
    short: 'X.509',
    description: 'Authenticate devices or services via mTLS client certificates',
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-100 dark:bg-sky-950/50',
    selectedBorder: 'border-sky-400 dark:border-sky-600',
    selectedBg: 'bg-sky-50/60 dark:bg-sky-950/20',
  },
};

export default function NewPrincipalPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic principal fields
  const [principalId, setPrincipalId] = useState(crypto.randomUUID());
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

  const loadCAs = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
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
  }, [isAuthenticated, user?.access_token]);

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
      if (!selectedCa) {
        return;
      }

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
    if (!selectedCa) {
      return caTrustValue.trim();
    }

    if (caTrustIdentityType === 'authority_key_id') {
      return (selectedCa.authorityKeyId || '').trim();
    }

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

      let authConfig: any = {};
      if (type === 'oidc') {
        authConfig = { claims };
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

        authConfig = {
          ca_trust: {
            identity_type: caTrustIdentityType,
            value: resolvedCaTrustValue,
            ...(selectedCaPem ? { pem: selectedCaPem } : {}),
          },
          match_mode: matchMode,
        };
        if (matchMode === 'serial_and_ca') {
          authConfig.serial_number = serialNumber;
        }
        if (matchMode === 'cn_and_ca') {
          authConfig.subject_cn = subjectCn;
        }
      }

      const principalData: any = {
        id: principalId,
        name,
        description: description.trim(),
        type,
        authConfig,
        active,
      };

      await createPrincipal(principalData);
      router.push('/authz/principals');
    } catch (err: any) {
      setError(err.message || 'Failed to create principal');
      setSubmitting(false);
    }
  };

  const renderOidcForm = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define claim conditions used to match the JWT of an incoming authentication request.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleAddClaim} className="shrink-0 ml-4">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Claim
        </Button>
      </div>

      {claims.length === 0 && (
        <button
          type="button"
          onClick={handleAddClaim}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50/30 dark:hover:bg-violet-950/10 transition-colors p-6 text-center group"
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-violet-600 transition-colors">
            <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center group-hover:bg-violet-100 dark:group-hover:bg-violet-950/50 transition-colors">
              <Plus className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium">Add your first claim condition</p>
            <p className="text-xs">At least one claim is required to identify this principal</p>
          </div>
        </button>
      )}

      <div className="space-y-3">
        {claims.map((claim, index) => (
          <div key={index} className="relative rounded-xl border bg-card overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-400 dark:bg-violet-600" />
            <div className="p-4 pl-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Condition {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveClaim(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Claim Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="sub, email, groups…"
                    value={claim.claim}
                    onChange={(e) => handleUpdateClaim(index, 'claim', e.target.value)}
                    required
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Operator</Label>
                  <Select
                    value={claim.operator}
                    onValueChange={(value: 'equals' | 'contains' | 'matches') =>
                      handleUpdateClaim(index, 'operator', value)
                    }
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
                  <Label className="text-xs">
                    Value <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder={
                      claim.operator === 'matches' ? '^[a-z]+@example\\.com$' : 'Claim value…'
                    }
                    value={claim.value}
                    onChange={(e) => handleUpdateClaim(index, 'value', e.target.value)}
                    required
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              {claim.operator === 'matches' && (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Regex pattern — ensure it is valid before saving.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderX509Form = () => (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="caTrustIdentityType" className="text-sm">
          CA Identity Type <span className="text-destructive">*</span>
        </Label>
        <Select
          value={caTrustIdentityType}
          onValueChange={(value: X509CaTrustIdentityType) => setCaTrustIdentityType(value)}
        >
          <SelectTrigger id="caTrustIdentityType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fingerprint">Fingerprint (SHA-256)</SelectItem>
            <SelectItem value="authority_key_id">Authority Key Identifier (AKI)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select how the trusted CA is identified for certificate matching
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">
          Certification Authority <span className="text-destructive">*</span>
        </Label>
        <button
          type="button"
          onClick={handleOpenCaSelector}
          className={cn(
            'w-full rounded-xl border-2 border-dashed p-4 text-left transition-all',
            'hover:border-sky-300 dark:hover:border-sky-700 hover:bg-sky-50/30 dark:hover:bg-sky-950/10',
            selectedCa
              ? 'border-sky-300 dark:border-sky-700 bg-sky-50/40 dark:bg-sky-950/20'
              : 'border-border'
          )}
        >
          {selectedCa ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/50">
                <ShieldCheck className="h-4 w-4 text-sky-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{selectedCa.name}</p>
                {caTrustValue && (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {caTrustValue}
                  </p>
                )}
              </div>
              <span className="ml-auto shrink-0 text-xs text-sky-600 font-medium">Change</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
                <Plus className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Select a Certification Authority</p>
                <p className="text-xs mt-0.5">
                  {caTrustIdentityType === 'fingerprint'
                    ? 'SHA-256 fingerprint will be derived automatically'
                    : 'Authority Key Identifier (AKI) will be resolved automatically'}
                </p>
              </div>
            </div>
          )}
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="matchMode" className="text-sm">Match Mode</Label>
        <Select
          value={matchMode}
          onValueChange={(value: X509AuthConfig['match_mode']) => setMatchMode(value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any_from_ca">Any from CA</SelectItem>
            <SelectItem value="serial_and_ca">Serial Number + CA</SelectItem>
            <SelectItem value="cn_and_ca">Common Name (CN) + CA</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {matchMode === 'any_from_ca' && 'Trust any certificate issued by the specified CA'}
          {matchMode === 'serial_and_ca' && 'Match a specific certificate by serial number and issuing CA'}
          {matchMode === 'cn_and_ca' && 'Match certificates by Common Name pattern — supports wildcards like *.example.com'}
        </p>
      </div>

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
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Certificate serial number in colon-separated hex format
          </p>
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
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="rounded bg-muted px-1 py-0.5 text-xs">*</code> for wildcard
            matching — e.g.{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">*.sensors.example.com</code>
          </p>
        </div>
      )}
    </div>
  );

  const selectedTypeConfig = PRINCIPAL_TYPE_CONFIG[type];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="-ml-1 shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Create New Principal</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add an authentication identity to your authorization system
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-5">

          {/* Section 01 — Identity */}
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center text-lg">
                <UserCog className="mr-3 h-5 w-5 text-primary" />
                Identity
              </CardTitle>
              <CardDescription>Basic information about this principal</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="divide-y">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="Alice (System Administrator)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      A descriptive name — e.g., a user name, device, or service identifier
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="id" className="text-sm">Principal ID</Label>
                    <Input
                      id="id"
                      value={principalId}
                      onChange={(e) => setPrincipalId(e.target.value)}
                      disabled
                      className="font-mono text-xs text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">Auto-generated unique identifier</p>
                  </div>
                </div>

                <div className="pt-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="description" className="text-sm">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="System administrator with full access to all IoT devices and policies"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 02 — Authentication Method */}
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center text-lg">
                <Lock className="mr-3 h-5 w-5 text-primary" />
                Authentication Method
              </CardTitle>
              <CardDescription>Configure how this principal will be authenticated</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="divide-y">
                {/* Visual type picker */}
                <div className="pb-6 space-y-2">
                  <Label className="text-sm">
                    Principal Type <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                    {(Object.entries(PRINCIPAL_TYPE_CONFIG) as [SupportedPrincipalType, typeof PRINCIPAL_TYPE_CONFIG[SupportedPrincipalType]][]).map(
                      ([typeKey, config]) => {
                        const Icon = config.icon;
                        const isSelected = type === typeKey;
                        return (
                          <button
                            key={typeKey}
                            type="button"
                            onClick={() => setType(typeKey)}
                            className={cn(
                              'relative flex flex-col gap-3 rounded-xl border-2 p-4 text-left transition-all',
                              'hover:border-border/80 hover:bg-accent/20',
                              isSelected
                                ? cn(config.selectedBorder, config.selectedBg, 'shadow-sm')
                                : 'border-border bg-card'
                            )}
                          >
                            {isSelected && (
                              <CheckCircle2
                                className={cn('absolute top-3 right-3 h-4 w-4', config.iconColor)}
                              />
                            )}
                            <div
                              className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-lg',
                                config.iconBg
                              )}
                            >
                              <Icon className={cn('h-4 w-4', config.iconColor)} />
                            </div>
                            <div>
                              <p
                                className={cn(
                                  'text-sm font-semibold leading-tight',
                                  isSelected ? config.iconColor : 'text-foreground'
                                )}
                              >
                                {config.short}
                                <span className="ml-1.5 font-normal text-muted-foreground">
                                  — {config.label}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                {config.description}
                              </p>
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Type-specific configuration */}
                <div className="pt-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-md',
                        selectedTypeConfig.iconBg
                      )}
                    >
                      <selectedTypeConfig.icon className={cn('h-3.5 w-3.5', selectedTypeConfig.iconColor)} />
                    </div>
                    <span className="text-sm font-medium">{selectedTypeConfig.label} Configuration</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  {type === 'oidc' && renderOidcForm()}
                  {type === 'x509' && renderX509Form()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 03 — Settings */}
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <CardTitle className="flex items-center text-lg">
                <Settings2 className="mr-3 h-5 w-5 text-primary" />
                Settings
              </CardTitle>
              <CardDescription>Principal activation and access controls</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="active" className="text-sm font-medium cursor-pointer">
                    Active
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Inactive principals are blocked from authenticating
                  </p>
                </div>
                <Switch id="active" checked={active} onCheckedChange={setActive} />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create Principal'
              )}
            </Button>
          </div>
        </div>
      </form>

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
        isAuthLoading={isAuthLoading}
      />
    </div>
  );
}
