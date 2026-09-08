'use client';

import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { DmsSelector } from '@/components/shared/DmsSelector';
import { KmsKeySelector } from '@/components/shared/KmsKeySelector';
import { SigningProfileSelect } from '@/components/shared/SigningProfileSelect';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchAndProcessCAs,
  fetchSigningProfiles,
  type ApiSigningProfile,
  type CA,
} from '@/lib/ca-data';
import type { ChatToolInputControl } from '@/lib/chat-tools';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { CertificateData } from '@/types/certificate';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { ChevronsUpDown, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ChatToolResourceSelectorProps {
  control: ChatToolInputControl;
  id: string;
  onChange: (value: string) => void;
  relatedValues: Record<string, unknown>;
  value: unknown;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getCertificateCommonName(certificate: CertificateData) {
  return certificate.subject.match(/(?:^|,)\s*CN=([^,]+)/i)?.[1]?.trim() || certificate.subject;
}

function CertificationAuthoritySelector({
  id,
  onChange,
  value,
}: Omit<ChatToolResourceSelectorProps, 'control' | 'relatedValues'>) {
  const [isOpen, setIsOpen] = useState(false);
  const [availableCAs, setAvailableCAs] = useState<CA[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCA, setSelectedCA] = useState<CA | null>(null);

  const loadCAs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAvailableCAs(await fetchAndProcessCAs());
    } catch (loadError) {
      setAvailableCAs([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load certification authorities.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && availableCAs.length === 0 && !isLoading && !error) {
      void loadCAs();
    }
  }, [availableCAs.length, error, isLoading, isOpen, loadCAs]);

  const selectedValue = stringValue(value);
  const selectedFromList = useMemo(() => {
    const find = (cas: CA[]): CA | null => {
      for (const ca of cas) {
        if (ca.id === selectedValue) return ca;
        const child = ca.children ? find(ca.children) : null;
        if (child) return child;
      }
      return null;
    };
    return find(availableCAs);
  }, [availableCAs, selectedValue]);
  const displayCA = selectedCA?.id === selectedValue ? selectedCA : selectedFromList;

  return (
    <>
      <Button
        aria-expanded={isOpen}
        className="h-10 w-full justify-between gap-2 px-3 text-left font-normal"
        id={id}
        onClick={() => setIsOpen(true)}
        role="combobox"
        type="button"
        variant="secondary"
      >
        <span className={displayCA || selectedValue ? 'truncate' : 'truncate text-muted-foreground'}>
          {displayCA?.name || selectedValue || 'Select a certification authority…'}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>
      <CaSelectorModal
        availableCAs={availableCAs}
        currentSelectedCaId={selectedValue || null}
        description="Choose the certification authority the tool should use."
        errorCAs={error}
        isLoadingCAs={isLoading}
        isOpen={isOpen}
        loadCAsAction={() => void loadCAs()}
        onCaSelected={(ca) => {
          setSelectedCA(ca);
          onChange(ca.id);
          setIsOpen(false);
        }}
        onOpenChange={setIsOpen}
        title="Select certification authority"
        useSheet
      />
    </>
  );
}

function CertificateSelector({
  id,
  onChange,
  value,
}: Omit<ChatToolResourceSelectorProps, 'control' | 'relatedValues'>) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<CertificateData | null>(null);
  const selectedValue = stringValue(value);

  return (
    <>
      <Button
        aria-expanded={isOpen}
        className="h-10 w-full justify-between gap-2 px-3 text-left font-normal"
        id={id}
        onClick={() => setIsOpen(true)}
        role="combobox"
        type="button"
        variant="secondary"
      >
        <span className={selectedCertificate || selectedValue ? 'min-w-0 truncate' : 'min-w-0 truncate text-muted-foreground'}>
          {selectedCertificate
            ? `${getCertificateCommonName(selectedCertificate)} · ${selectedCertificate.serialNumber}`
            : selectedValue || 'Select a certificate…'}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>
      <CertificateSelectorModal
        currentSelectedCertificateId={selectedValue || null}
        description="Search the live certificate inventory and choose a certificate."
        isOpen={isOpen}
        onCertificateSelected={(certificate) => {
          setSelectedCertificate(certificate);
          onChange(certificate.serialNumber);
          setIsOpen(false);
        }}
        onOpenChange={setIsOpen}
        title="Select certificate"
      />
    </>
  );
}

function SigningProfileResourceSelector({
  id,
  onChange,
  value,
}: Omit<ChatToolResourceSelectorProps, 'control' | 'relatedValues'>) {
  const [profiles, setProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchSigningProfiles(new URLSearchParams({ page_size: '100' }));
      setProfiles(response.list ?? []);
    } catch (loadError) {
      setProfiles([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load signing profiles.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  if (isLoading) return <Skeleton className="h-10 w-full" />;

  if (error) {
    return (
      <Button className="h-10 w-full justify-start" onClick={() => void loadProfiles()} type="button" variant="outline">
        <Loader2 className="size-4" />
        Retry loading signing profiles
      </Button>
    );
  }

  return (
    <SigningProfileSelect
      availableProfiles={profiles}
      id={id}
      onProfileIdChange={(profileId) => onChange(profileId ?? '')}
      selectedProfileId={stringValue(value) || null}
      triggerClassName="w-full"
    />
  );
}

function KmsKeyResourceSelector({
  control,
  id,
  onChange,
  relatedValues,
  value,
}: ChatToolResourceSelectorProps) {
  const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);

  useEffect(() => {
    let isActive = true;
    void fetchCryptoEngines()
      .then((result) => {
        if (isActive) setEngines(result);
      })
      .catch(() => {
        if (isActive) setEngines([]);
      });
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <KmsKeySelector
      allCryptoEngines={engines}
      filterEngineId={typeof relatedValues.engine_id === 'string' ? relatedValues.engine_id : undefined}
      id={id}
      onValueChange={(keyReference) => onChange(keyReference)}
      requirePrivateKey={control === 'kms-key-reference'}
      value={stringValue(value) || undefined}
      valueType={control === 'kms-key-id' ? 'key-id' : 'pkcs11-uri'}
    />
  );
}

export function ChatToolResourceSelector(props: ChatToolResourceSelectorProps) {
  const { control, id, onChange, relatedValues, value } = props;

  if (control === 'certificate-authority') {
    return <CertificationAuthoritySelector id={id} onChange={onChange} value={value} />;
  }
  if (control === 'certificate') {
    return <CertificateSelector id={id} onChange={onChange} value={value} />;
  }
  if (control === 'registration-authority') {
    return (
      <DmsSelector
        id={id}
        onChange={(raId) => onChange(raId ?? '')}
        placeholder="Select a Registration Authority…"
        selectedDisplay="stacked"
        showAllOption={false}
        value={stringValue(value) || null}
      />
    );
  }
  if (control === 'crypto-engine') {
    return (
      <CryptoEngineSelector
        id={id}
        onValueChange={(engineId) => onChange(engineId ?? '')}
        value={stringValue(value) || undefined}
      />
    );
  }
  if (control === 'kms-key-id' || control === 'kms-key-reference') {
    return <KmsKeyResourceSelector {...props} />;
  }
  if (control === 'signing-profile') {
    return <SigningProfileResourceSelector id={id} onChange={onChange} value={value} />;
  }

  return null;
}
