'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Loader2, AlertCircle, Info, Plus, Trash2 } from 'lucide-react';
import { getPrincipal, updatePrincipal } from '@/lib/authz-api';
import type { Principal, PrincipalType, ClaimCondition, X509AuthConfig } from '@/types/authz';

function EditPrincipalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const principalId = searchParams.get('principalId');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [principal, setPrincipal] = useState<Principal | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<PrincipalType>('oidc');
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');

  const [claims, setClaims] = useState<ClaimCondition[]>([]);

  const [caFingerprint, setCaFingerprint] = useState('');
  const [matchMode, setMatchMode] = useState<X509AuthConfig['matchMode']>('any_from_ca');
  const [serialNumber, setSerialNumber] = useState('');
  const [subjectCn, setSubjectCn] = useState('');

  useEffect(() => {
    if (principalId) {
      loadPrincipal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principalId]);

  const loadPrincipal = async () => {
    if (!principalId) return;

    try {
      setLoading(true);
      const fetchedPrincipal = await getPrincipal(principalId);
      setPrincipal(fetchedPrincipal);

      setName(fetchedPrincipal.name);
      setType(fetchedPrincipal.type);
      setActive(fetchedPrincipal.active);
      setDescription((fetchedPrincipal as any).description || '');

      if (fetchedPrincipal.type === 'oidc') {
        const oidcClaims = (fetchedPrincipal.authConfig as any)?.claims;
        setClaims(Array.isArray(oidcClaims) ? oidcClaims : []);
      }

      if (fetchedPrincipal.type === 'x509') {
        const x509Config = fetchedPrincipal.authConfig as any;
        setCaFingerprint(x509Config?.caFingerprint || '');
        setMatchMode(x509Config?.matchMode || 'any_from_ca');
        setSerialNumber(x509Config?.serialNumber || '');
        setSubjectCn(x509Config?.subjectCn || '');
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

    if (!principalId || !principal) {
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
      if (!caFingerprint.trim()) {
        setError('CA fingerprint is required for X.509 principals');
        return;
      }
      if (matchMode === 'serial_and_ca' && !serialNumber.trim()) {
        setError('Serial number is required when using serial_and_ca match mode');
        return;
      }
      if (matchMode === 'cn' && !subjectCn.trim()) {
        setError('Subject CN is required when using cn match mode');
        return;
      }
    }

    try {
      setSubmitting(true);

      let authConfig: any = principal.authConfig;
      if (type === 'oidc') {
        authConfig = { claims };
      } else if (type === 'x509') {
        authConfig = {
          caFingerprint,
          matchMode,
        };

        if (matchMode === 'serial_and_ca') {
          authConfig.serialNumber = serialNumber;
        }

        if (matchMode === 'cn') {
          authConfig.subjectCn = subjectCn;
        }
      }

      const updatePayload: any = {
        name,
        active,
        authConfig,
      };

      if (description.trim()) {
        updatePayload.description = description;
      }

      await updatePrincipal(principalId, updatePayload);
      router.push(`/authz/principals/details?principalId=${principalId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update principal');
    } finally {
      setSubmitting(false);
    }
  };

  const renderOidcForm = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Claims</h3>
            <p className="text-sm text-muted-foreground">
              Define claim conditions for principal identification
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAddClaim}>
            <Plus className="mr-2 h-4 w-4" />
            Add Claim
          </Button>
        </div>

        {claims.length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No claims configured. Add at least one claim to identify this principal.
            </AlertDescription>
          </Alert>
        )}

        {claims.map((claim, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <h4 className="text-sm font-medium">Claim {index + 1}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveClaim(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Claim Name <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="sub, email, groups..."
                      value={claim.claim}
                      onChange={(e) => handleUpdateClaim(index, 'claim', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Operator</Label>
                    <Select
                      value={claim.operator}
                      onValueChange={(value: 'equals' | 'contains' | 'matches') =>
                        handleUpdateClaim(index, 'operator', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="matches">Matches (Regex)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Value <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder={
                        claim.operator === 'matches'
                          ? '^[a-z]+@example\\.com$'
                          : 'Claim value...'
                      }
                      value={claim.value}
                      onChange={(e) => handleUpdateClaim(index, 'value', e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderX509Form = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="caFingerprint">
          CA Fingerprint <span className="text-destructive">*</span>
        </Label>
        <Input
          id="caFingerprint"
          placeholder="SHA256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae"
          value={caFingerprint}
          onChange={(e) => setCaFingerprint(e.target.value)}
          required
        />
        <p className="text-sm text-muted-foreground">
          The SHA256 fingerprint of the trusted CA certificate
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="matchMode">Match Mode</Label>
        <Select
          value={matchMode}
          onValueChange={(value: X509AuthConfig['matchMode']) => setMatchMode(value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any_from_ca">Any from CA</SelectItem>
            <SelectItem value="serial_and_ca">Serial Number + CA</SelectItem>
            <SelectItem value="cn">Common Name (CN)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {matchMode === 'serial_and_ca' && (
        <div className="space-y-2">
          <Label htmlFor="serialNumber">
            Serial Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="serialNumber"
            placeholder="1A:2B:3C:4D:5E:6F:7A:8B:9C:0D:1E:2F:3A:4B:5C:6D"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            required
          />
        </div>
      )}

      {matchMode === 'cn' && (
        <div className="space-y-2">
          <Label htmlFor="subjectCn">
            Subject Common Name (CN) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="subjectCn"
            placeholder="device-*.example.com"
            value={subjectCn}
            onChange={(e) => setSubjectCn(e.target.value)}
            required
          />
        </div>
      )}
    </div>
  );

  const renderApiKeyForm = () => (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        API key material cannot be edited from the dashboard. You can update name and status for this principal.
      </AlertDescription>
    </Alert>
  );

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Principal</h1>
          <p className="text-muted-foreground mt-2">
            Update principal details and authentication configuration
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Configure the fundamental properties of this principal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Principal Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Principal name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="id">Principal ID</Label>
                <Input id="id" value={principal?.id || ''} disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Principal Type</Label>
                <Select value={type} onValueChange={(value: PrincipalType) => setType(value)} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oidc">OIDC (OpenID Connect)</SelectItem>
                    <SelectItem value="x509">X.509 Certificate</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authentication Configuration</CardTitle>
              <CardDescription>
                Configure how this principal will be authenticated
              </CardDescription>
            </CardHeader>
            <CardContent>
              {type === 'oidc' && renderOidcForm()}
              {type === 'x509' && renderX509Form()}
              {type === 'api_key' && renderApiKeyForm()}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </div>
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
