'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { AlertCircle, Loader2, PlusCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { CardSelector, type CardSelectorOption } from '@/components/shared/CardSelector';
import { OidcClaimsEditor } from '@/components/authz/OidcClaimsEditor';
import { SubjectAttributesEditor } from '@/components/authz/SubjectAttributesEditor';
import { X509ConfigEditor } from '@/components/authz/X509ConfigEditor';
import { newSubjectAttributeRow, type SubjectAttributeRow } from '@/lib/principal-subject-attributes';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type {
  ClaimCondition,
  PrincipalType,
  X509AuthConfig,
  X509CaTrustIdentityType,
} from '@/types/authz';

const PRINCIPAL_TYPE_OPTIONS: CardSelectorOption<PrincipalType>[] = [
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

const PRINCIPAL_TYPE_LABEL: Record<PrincipalType, string> = {
  oidc: 'OpenID Connect',
  x509: 'X.509 Certificate',
};

interface PrincipalFormProps {
  mode: 'create' | 'edit';
  error: string | null;
  submitting: boolean;
  principalId: string;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  type: PrincipalType;
  setType: Dispatch<SetStateAction<PrincipalType>>;
  active: boolean;
  setActive: Dispatch<SetStateAction<boolean>>;
  description: string;
  setDescription: Dispatch<SetStateAction<string>>;
  claims: ClaimCondition[];
  setClaims: Dispatch<SetStateAction<ClaimCondition[]>>;
  caTrustIdentityType: X509CaTrustIdentityType;
  setCaTrustIdentityType: Dispatch<SetStateAction<X509CaTrustIdentityType>>;
  caTrustValue: string;
  selectedCa: CA | null;
  allCAs: CA[];
  isLoadingCAs: boolean;
  errorCAs: string | null;
  loadCAs: () => Promise<void>;
  allCryptoEngines: ApiCryptoEngine[];
  isCaSelectorOpen: boolean;
  setIsCaSelectorOpen: Dispatch<SetStateAction<boolean>>;
  handleOpenCaSelector: () => Promise<void>;
  handleCaSelected: (ca: CA) => void;
  matchMode: X509AuthConfig['match_mode'];
  setMatchMode: Dispatch<SetStateAction<X509AuthConfig['match_mode']>>;
  serialNumber: string;
  setSerialNumber: Dispatch<SetStateAction<string>>;
  subjectCn: string;
  setSubjectCn: Dispatch<SetStateAction<string>>;
  subjectAttributes: SubjectAttributeRow[];
  setSubjectAttributes: Dispatch<SetStateAction<SubjectAttributeRow[]>>;
  subjectAttributeMappings: SubjectAttributeRow[];
  setSubjectAttributeMappings: Dispatch<SetStateAction<SubjectAttributeRow[]>>;
  onSubmit: (event: FormEvent) => void;
}

export function PrincipalForm({
  mode,
  error,
  submitting,
  principalId,
  name,
  setName,
  type,
  setType,
  active,
  setActive,
  description,
  setDescription,
  claims,
  setClaims,
  caTrustIdentityType,
  setCaTrustIdentityType,
  caTrustValue,
  selectedCa,
  allCAs,
  isLoadingCAs,
  errorCAs,
  loadCAs,
  allCryptoEngines,
  isCaSelectorOpen,
  setIsCaSelectorOpen,
  handleOpenCaSelector,
  handleCaSelected,
  matchMode,
  setMatchMode,
  serialNumber,
  setSerialNumber,
  subjectCn,
  setSubjectCn,
  subjectAttributes,
  setSubjectAttributes,
  subjectAttributeMappings,
  setSubjectAttributeMappings,
  onSubmit,
}: PrincipalFormProps) {
  const isCreate = mode === 'create';

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

  const applyWfxDevicePreset = () => {
    setMatchMode('subject_cn');
    setSubjectAttributeMappings((rows) => {
      const nextRows = rows.filter((row) => row.key.trim() !== 'client_id');
      return [newSubjectAttributeRow('client_id', 'x509.subject.cn'), ...nextRows];
    });
  };

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-0">
        <div className="pb-8 border-b">
          <h1 className="text-2xl font-bold">{isCreate ? 'Create New Principal' : 'Edit Principal'}</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {isCreate
              ? 'Add an authentication identity to the authorization system.'
              : 'Update the authentication identity and configuration.'}
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
                  placeholder={isCreate ? 'e.g., Alice (System Administrator)' : 'Principal name'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={submitting}
                />
                {isCreate && !name.trim() && (
                  <p className="text-xs text-destructive">Principal name is required.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="id">{isCreate ? 'Principal ID (auto-generated)' : 'Principal ID'}</Label>
                <Input id="id" value={principalId} readOnly className="bg-muted/50 font-mono text-xs" />
                {isCreate && (
                  <p className="text-xs text-muted-foreground">Auto-generated unique identifier.</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder={isCreate ? 'e.g., System administrator with full access to policies' : 'Optional description'}
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

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Authentication Method</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isCreate
                ? 'Configure how incoming requests are matched to this principal.'
                : 'The authentication type cannot be changed after creation.'}
            </p>
          </div>
          <div className="space-y-6 lg:col-span-2">
            {isCreate ? (
              <CardSelector
                label="Principal Type"
                value={type}
                onChange={setType}
                options={PRINCIPAL_TYPE_OPTIONS}
                columns={2}
                disabled={submitting}
              />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-sm">Principal Type</Label>
                <Input
                  id="type"
                  value={type === 'oidc' ? 'OIDC (OpenID Connect)' : 'X.509 Certificate'}
                  readOnly
                  className="bg-muted/50"
                />
              </div>
            )}

            <div className="space-y-4 border-t pt-4">
              {isCreate && (
                <div className="flex items-center gap-2">
                  {type === 'oidc' ? (
                    <UserCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  )}
                  <p className="text-sm font-medium">{PRINCIPAL_TYPE_LABEL[type]} Configuration</p>
                </div>
              )}

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
                  isNew={isCreate}
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
                  Enable or disable this principal&apos;s ability to authenticate.
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
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isCreate ? 'Creating...' : 'Saving...'}</>
            ) : isCreate ? (
              <><PlusCircle className="mr-2 h-4 w-4" /> Create Principal</>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>

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
    </>
  );
}
