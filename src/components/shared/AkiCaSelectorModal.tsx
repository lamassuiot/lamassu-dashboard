

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { CaTableView } from '@/components/ca/CaTableView';
import { CaDrawer } from './CaDrawer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

interface AkiCaSelectorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  aki: string | null;
  allCryptoEngines: ApiCryptoEngine[];
}

export const AkiCaSelectorModal: React.FC<AkiCaSelectorModalProps> = ({
  isOpen,
  onOpenChange,
  aki,
  allCryptoEngines,
}) => {
  const router = useRouter();
  const [foundCAs, setFoundCAs] = useState<CA[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCAsByAki = useCallback(async () => {
    if (!aki || !isOpen ) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setFoundCAs([]);
    try {
      const queryString = `filter=subject_key_id[equal]${aki}`;
      const results = await fetchAndProcessCAs(queryString);
      setFoundCAs(results);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred while searching for the issuer Certification Authority.');
    } finally {
      setIsLoading(false);
    }
  }, [aki, isOpen]);

  useEffect(() => {
    fetchCAsByAki();
  }, [fetchCAsByAki]);

  const handleCaSelected = (ca: CA) => {
    onOpenChange(false);
    router.push(`/certificate-authorities/details?caId=${ca.id}`);
  };

  return (
    <CaDrawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Select Issuer Certification Authority"
      description="The following Certification Authorities match the Authority Key Identifier (AKI) of the certificate. Select one to view its details."
      isLoading={isLoading}
      loadingText="Searching for Issuer CA..."
      error={error}
      onRetry={fetchCAsByAki}
      isEmpty={foundCAs.length === 0}
      emptyText="No matching issuer Certification Authority found in the system for the provided AKI."
    >
      <CaTableView cas={foundCAs} allCryptoEngines={allCryptoEngines} onSelect={handleCaSelected} />
    </CaDrawer>
  );
};
