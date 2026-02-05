'use client';

import { useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Plus, Trash2, Loader2, AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createPrincipal } from '@/lib/authz-api';
import type { PrincipalType, ClaimCondition, X509AuthConfig } from '@/types/authz';

export default function NewPrincipalPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic principal fields
  const [principalId, setPrincipalId] = useState(crypto.randomUUID());
  const [name, setName] = useState('');
  const [type, setType] = useState<PrincipalType>('oidc');
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');

  // OIDC specific fields
  const [claims, setClaims] = useState<ClaimCondition[]>([]);

  // X.509 specific fields
  const [caFingerprint, setCaFingerprint] = useState('');
  const [matchMode, setMatchMode] = useState<X509AuthConfig['matchMode']>('any_from_ca');
  const [serialNumber, setSerialNumber] = useState('');
  const [subjectCn, setSubjectCn] = useState('');

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

    // Validation
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

      let authConfig: any = {};
      if (type === 'api_key') {
        authConfig = { apiKeyHash: '' };
      } else if (type === 'oidc') {
        authConfig = {
          claims: claims,
        };
      } else if (type === 'x509') {
        authConfig = {
          caFingerprint: caFingerprint,
          matchMode: matchMode,
        };
        if (matchMode === 'serial_and_ca') {
          authConfig.serialNumber = serialNumber;
        }
        if (matchMode === 'cn') {
          authConfig.subjectCn = subjectCn;
        }
      }

      const principalData: any = {
        id: principalId,
        name: name,
        type: type,
        authConfig: authConfig,
        active: active,
      };

      if (description.trim()) {
        principalData.description = description;
      }

      await createPrincipal(principalData);
      router.push('/authz/principals');
    } catch (err: any) {
      setError(err.message || 'Failed to create principal');
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

                {claim.operator === 'matches' && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Using regex pattern matching. Ensure your pattern is valid.
                    </AlertDescription>
                  </Alert>
                )}
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
        <p className="text-sm text-muted-foreground">
          {matchMode === 'any_from_ca' &&
            'Trust any certificate issued by the specified CA'}
          {matchMode === 'serial_and_ca' &&
            'Match specific certificate by serial number and CA'}
          {matchMode === 'cn' &&
            'Match certificates by Common Name pattern (supports wildcards like *.example.com)'}
        </p>
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
          <p className="text-sm text-muted-foreground">
            The certificate serial number in hex format (colon-separated)
          </p>
        </div>
      )}

      {matchMode === 'cn' && (
        <div className="space-y-2">
          <Label htmlFor="subjectCn">
            Subject Common Name (CN) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="subjectCn"
            placeholder="device-*.example.com or specific.device.com"
            value={subjectCn}
            onChange={(e) => setSubjectCn(e.target.value)}
            required
          />
          <p className="text-sm text-muted-foreground">
            Certificate CN pattern. Use * for wildcard matching (e.g., *.sensors.example.com)
          </p>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Examples: warehouse-*.sensors.example.com, factory-floor-*.example.com, or exact match like gateway-001.example.com
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );

  const renderApiKeyForm = () => (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        API Key will be generated automatically when the principal is created. You will receive
        the key once during creation - store it securely as it cannot be retrieved later.
      </AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create New Principal</h1>
          <p className="text-muted-foreground mt-2">
            Add a new authentication principal to your authorization system
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
          {/* Basic Information Card */}
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
                  placeholder="Alice (System Administrator)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  A descriptive name for this principal (e.g., user name, device name, or group name)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="id">Principal ID</Label>
                <Input
                  id="id"
                  value={principalId}
                  onChange={(e) => setPrincipalId(e.target.value)}
                  disabled
                />
                <p className="text-sm text-muted-foreground">
                  Unique identifier (auto-generated, can be customized before creation)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="System administrator with full access to all IoT devices and policies"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  Optional description explaining the purpose and scope of this principal
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">
                  Principal Type <span className="text-destructive">*</span>
                </Label>
                <Select value={type} onValueChange={(value: PrincipalType) => setType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oidc">OIDC (OpenID Connect)</SelectItem>
                    <SelectItem value="x509">X.509 Certificate</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {type === 'oidc' && 'Authenticate users via OIDC providers (Google, Okta, Auth0, etc.)'}
                  {type === 'x509' && 'Authenticate devices or services via X.509 certificates (mTLS)'}
                  {type === 'api_key' && 'Authenticate via API key for programmatic access'}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Authentication Configuration Card */}
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

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Principal
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
