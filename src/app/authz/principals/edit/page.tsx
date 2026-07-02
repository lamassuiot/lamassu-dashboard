'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { getPrincipal, updatePrincipal } from '@/lib/authz-api';

import { fetchAndProcessCAs, parseCertificatePemDetails, type CA } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { normalizeX509AuthConfig } from '@/lib/x509-auth-config';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { PrincipalForm } from '@/components/authz/PrincipalForm';
import {
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
        <PrincipalForm
          mode="edit"
          error={error}
          submitting={submitting}
          principalId={principal?.id || ''}
          name={name}
          setName={setName}
          type={type}
          setType={setType}
          active={active}
          setActive={setActive}
          description={description}
          setDescription={setDescription}
          claims={claims}
          setClaims={setClaims}
          caTrustIdentityType={caTrustIdentityType}
          setCaTrustIdentityType={setCaTrustIdentityType}
          caTrustValue={caTrustValue}
          selectedCa={selectedCa}
          allCAs={allCAs}
          isLoadingCAs={isLoadingCAs}
          errorCAs={errorCAs}
          loadCAs={loadCAs}
          allCryptoEngines={allCryptoEngines}
          isCaSelectorOpen={isCaSelectorOpen}
          setIsCaSelectorOpen={setIsCaSelectorOpen}
          handleOpenCaSelector={handleOpenCaSelector}
          handleCaSelected={handleCaSelected}
          matchMode={matchMode}
          setMatchMode={setMatchMode}
          serialNumber={serialNumber}
          setSerialNumber={setSerialNumber}
          subjectCn={subjectCn}
          setSubjectCn={setSubjectCn}
          subjectAttributes={subjectAttributes}
          setSubjectAttributes={setSubjectAttributes}
          subjectAttributeMappings={subjectAttributeMappings}
          setSubjectAttributeMappings={setSubjectAttributeMappings}
          onSubmit={handleSubmit}
        />
      </div>
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
