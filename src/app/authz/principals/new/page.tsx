'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPrincipal } from '@/lib/authz-api';

import { fetchAndProcessCAs, parseCertificatePemDetails, type CA } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { PrincipalForm } from '@/components/authz/PrincipalForm';
import {
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

export default function NewPrincipalPage() {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic principal fields
  const [principal_id, setPrincipalId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<PrincipalType>('oidc');
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

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Principals', href: '/authz/principals' },
    { label: 'New' },
  ];

  return (
    <BreadcrumbPage items={breadcrumbItems} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto space-y-5 mb-8">
        <PrincipalForm
          mode="create"
          error={error}
          submitting={submitting}
          principalId={principal_id}
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
