
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { CaTableView } from '@/components/ca/CaTableView';
import { CaDrawer } from './CaDrawer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

interface CAsUsingProfileModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  profileId: string;
  profileName: string;
  onUsageLoaded?: (count: number) => void;
}

const flattenCaTree = (cas: CA[]): CA[] => {
  const flatList: CA[] = [];
  function recurse(items: CA[]) {
    for (const item of items) {
      const { children, ...rest } = item;
      flatList.push(rest as CA);
      if (children) recurse(children);
    }
  }
  recurse(cas);
  return flatList;
};

export const CAsUsingProfileModal: React.FC<CAsUsingProfileModalProps> = ({
  isOpen,
  onOpenChange,
  profileId,
  profileName,
  onUsageLoaded,
}) => {
  const router = useRouter();

  const [cas, setCas] = useState<CA[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);

  const fetchCAs = useCallback(async () => {
    if (!profileId || !isOpen) return;
    setIsLoading(true);
    setError(null);
    setCas([]);
    try {
      const [casData, enginesData] = await Promise.all([
        fetchAndProcessCAs(`filter=profile_id[equal]${profileId}`),
        fetchCryptoEngines(),
      ]);
      const flatCas = flattenCaTree(casData);
      setCas(casData);
      setAllCryptoEngines(enginesData);
      onUsageLoaded?.(flatCas.length);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred while searching for CAs.');
    } finally {
      setIsLoading(false);
    }
  }, [profileId, isOpen, onUsageLoaded]);

  useEffect(() => {
    fetchCAs();
  }, [fetchCAs]);

  const handleCaSelected = (ca: CA) => {
    onOpenChange(false);
    router.push(`/certificate-authorities/details?caId=${ca.id}`);
  };

  return (
    <CaDrawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={<>CAs Using Profile: {profileName}</>}
      description="The following Certificate Authorities use this profile as their default for issuance."
      isLoading={isLoading}
      loadingText="Searching for CAs..."
      error={error}
      onRetry={fetchCAs}
      isEmpty={cas.length === 0}
      emptyText="No Certificate Authorities found using this issuance profile."
    >
      <CaTableView cas={cas} allCryptoEngines={allCryptoEngines} onSelect={handleCaSelected} />
    </CaDrawer>
  );
};
