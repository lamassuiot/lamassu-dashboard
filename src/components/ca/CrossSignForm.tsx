'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from '@/lib/router';
import type { CA, ApiSigningProfile } from '@/lib/ca-data';
import { createCa, fetchAndProcessCAs, fetchSigningProfiles, findCaById } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { flattenCaTree, formatCaSubject } from '@/lib/ca-utils';
import {
  buildCrossSignPayload,
  defaultCrossSignExpiration,
  findExistingCrossSigns,
  getCrossSignBlocker,
  outlivesSigner,
  type CrossSignRole,
} from '@/lib/ca-cross-sign';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';
import { FormSubmitFooter } from '@/components/shared/FormSubmitFooter';
import { CrossSignPairSelector } from './CrossSignPairSelector';

function Section({ title, description, children }: Readonly<{ title: string; description: string; children: React.ReactNode }>) {
  return (
    <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4 lg:col-span-2">{children}</div>
    </div>
  );
}

function PreviewRow({ label, value, mono }: Readonly<{ label: string; value: React.ReactNode; mono?: boolean }>) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-xs' : 'break-words text-sm'}>{value}</dd>
    </div>
  );
}

export function CrossSignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSignerId = searchParams.get('signerCaId');
  const preselectedTargetId = searchParams.get('targetCaId');

  const [cas, setCas] = useState<CA[]>([]);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [profiles, setProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [signer, setSigner] = useState<CA | null>(null);
  const [target, setTarget] = useState<CA | null>(null);
  const [pickingRole, setPickingRole] = useState<CrossSignRole | null>(null);
  const [expiration, setExpiration] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '5y' });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [newCaId] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDependencies = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [fetchedCas, engines, profilesResponse] = await Promise.all([
        fetchAndProcessCAs(),
        fetchCryptoEngines(),
        fetchSigningProfiles(),
      ]);
      setCas(fetchedCas);
      setAllCryptoEngines(engines);
      setProfiles(profilesResponse.list);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load Certification Authorities.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies]);

  const allCas = useMemo(() => flattenCaTree(cas), [cas]);

  // Apply ?signerCaId= / ?targetCaId= once the CA list is in.
  useEffect(() => {
    if (cas.length === 0) return;
    const preselect = (id: string | null, role: CrossSignRole, counterpart: CA | null): CA | null => {
      const ca = findCaById(id, cas);
      if (!ca) return null;
      const blocker = getCrossSignBlocker(ca, role, counterpart);
      if (blocker) {
        sileo.error({ title: `Cannot use "${ca.name}" as ${role}`, description: `${blocker}.` });
        return null;
      }
      return ca;
    };
    const initialSigner = preselect(preselectedSignerId, 'signer', null);
    setSigner(initialSigner);
    setTarget(preselect(preselectedTargetId, 'target', initialSigner));
  }, [cas, preselectedSignerId, preselectedTargetId]);

  // Each new pair starts from the target's own lifetime, capped by the signer's.
  useEffect(() => {
    if (signer && target) setExpiration(defaultCrossSignExpiration(signer, target));
  }, [signer, target]);

  // The new CA entry inherits the target's default issuance profile unless the user picks another.
  useEffect(() => {
    if (!target) return;
    const inherited = target.defaultProfileId && profiles.some(p => p.id === target.defaultProfileId) ? target.defaultProfileId : null;
    setProfileId(inherited ?? profiles[0]?.id ?? null);
  }, [target, profiles]);

  const counterpartOf = (role: CrossSignRole) => (role === 'signer' ? target : signer);

  const handleCaPicked = (ca: CA) => {
    if (!pickingRole) return;
    if (pickingRole === 'signer') setSigner(ca);
    else setTarget(ca);
    setPickingRole(null);
  };

  const handleSwap = () => {
    setSigner(target);
    setTarget(signer);
  };

  const existingCrossSigns = useMemo(
    () => (signer && target ? findExistingCrossSigns(signer, target, allCas) : []),
    [signer, target, allCas],
  );
  const engineName = (ca: CA) => allCryptoEngines.find(e => e.id === ca.kmsKeyId)?.name;

  const validationErrors = [
    ...(!signer ? ['Signing Relationship: select the signer CA.'] : []),
    ...(!target ? ['Signing Relationship: select the target CA.'] : []),
    ...(!profileId ? ['Default Issuance Profile: select a profile.'] : []),
    ...(expiration.type === 'Date' && !expiration.dateValue ? ['Expiration: pick a date.'] : []),
  ];
  const validationWarnings = [
    ...(signer && outlivesSigner(expiration, signer) ? ['Expiration: the cross certificate outlives the signer CA, so chains through it stop validating early.'] : []),
  ];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signer || !target || !profileId) return;
    const blocker = getCrossSignBlocker(signer, 'signer', target) ?? getCrossSignBlocker(target, 'target', signer);
    if (blocker) {
      sileo.error({ title: 'Cannot cross-sign', description: `${blocker}.` });
      return;
    }

    setIsSubmitting(true);
    try {
      await createCa(buildCrossSignPayload({ signer, target, id: newCaId, profileId, expiration }));
      sileo.success({ title: 'Cross-signed', description: `"${signer.name}" issued a certificate for "${target.name}".` });
      router.push(`/certificate-authorities/details?caId=${newCaId}`);
    } catch (error: any) {
      sileo.error({ title: 'Cross-signing failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">Loading Certification Authorities...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Data</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
        <AlertDescription>
          <Button variant="link" onClick={loadDependencies} className="h-auto p-0">Try again?</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="border-b pb-8">
          <h1 className="text-2xl font-bold">Cross-sign Certification Authority</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Issue an existing CA a second certificate signed by another CA. The target keeps its key and subject, so anything
            it already issued chains up through either issuer. Both CAs need their private key in the KMS.
          </p>
        </div>

        <div className="space-y-4 py-8">
          <div>
            <p className="font-semibold">Signing Relationship</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick which CA signs and which one gets cross-signed. CAs whose private key Lamassu does not hold are shown blurred and cannot be picked.
            </p>
          </div>
          <CrossSignPairSelector
            signer={signer}
            target={target}
            onPick={setPickingRole}
            onSwap={handleSwap}
            allCryptoEngines={allCryptoEngines}
            disabled={isSubmitting}
          />
          {existingCrossSigns.length > 0 && signer && target && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                &quot;{signer.name}&quot; has already cross-signed &quot;{target.name}&quot; ({existingCrossSigns.length} active certificate{existingCrossSigns.length === 1 ? '' : 's'}).
                Continue only if you want another one, for example to renew it.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {signer && target && (
          <>
            <Separator />
            <Section title="Resulting Certificate" description="What the new cross certificate will contain. It is stored as a new CA entry.">
              <dl className="divide-y rounded-md border px-4">
                <PreviewRow label="Subject" value={formatCaSubject(target)} />
                <PreviewRow label="Issuer" value={formatCaSubject(signer)} />
                <PreviewRow
                  label="Public key"
                  value={<>{target.keyAlgorithm}{engineName(target) && <span className="text-muted-foreground"> · {engineName(target)}</span>} <span className="text-muted-foreground">(reused from {target.name})</span></>}
                />
                <PreviewRow label="Subject Key ID" value={target.subjectKeyId} mono />
                <PreviewRow label="Authority Key ID" value={signer.subjectKeyId} mono />
                <PreviewRow label="New CA ID" value={newCaId} mono />
              </dl>
              {target.caType !== 'MANAGED' && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    &quot;{target.name}&quot; was imported. Only the CN, OU, O, L, ST and C attributes of its subject are copied; check that its original subject has no others.
                  </AlertDescription>
                </Alert>
              )}
            </Section>
          </>
        )}

        <Separator />
        <Section title="Expiration" description="When the cross certificate expires. Defaults to the target's own expiry, capped at the signer's.">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ExpirationInput idPrefix="cross-sign-exp" label="Cross Certificate Expiration" value={expiration} onValueChange={setExpiration} />
          </div>
        </Section>

        <Separator />
        <Section title="Default Issuance Profile" description="Used when the new CA entry issues certificates. Inherited from the target CA when it has one.">
          <div className="space-y-1.5">
            <Label htmlFor="cross-sign-profile">Issuance profile</Label>
            <Select value={profileId ?? ''} onValueChange={setProfileId} disabled={isSubmitting || profiles.length === 0}>
              <SelectTrigger id="cross-sign-profile" className="w-full md:w-1/2">
                <SelectValue placeholder={profiles.length === 0 ? 'No profiles available' : 'Select a profile...'} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.id === target?.defaultProfileId ? ' (target default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        <FormSubmitFooter
          errors={validationErrors}
          warnings={validationWarnings}
          isSubmitting={isSubmitting}
          idleLabel="Cross-sign"
          submittingLabel="Cross-signing..."
        />
      </form>

      <CaSelectorModal
        isOpen={pickingRole !== null}
        onOpenChange={(open) => { if (!open) setPickingRole(null); }}
        title={pickingRole === 'target' ? 'Select Target CA' : 'Select Signer CA'}
        description={pickingRole === 'target'
          ? 'Choose the CA that gets a new certificate for its existing key. Only active CAs whose private key is in the KMS can be picked.'
          : 'Choose the CA that signs. Only active CAs whose private key is in the KMS can be picked.'}
        availableCAs={cas}
        isLoadingCAs={isLoading}
        errorCAs={loadError}
        loadCAsAction={loadDependencies}
        onCaSelected={handleCaPicked}
        currentSelectedCaId={pickingRole === 'target' ? target?.id : signer?.id}
        allCryptoEngines={allCryptoEngines}
        getDisabledReason={pickingRole ? (ca) => getCrossSignBlocker(ca, pickingRole, counterpartOf(pickingRole)) : undefined}
      />
    </>
  );
}
