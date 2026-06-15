
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
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
      setCas(flatCas);
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
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-[33vw] sm:!max-w-none flex flex-col p-0">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>CAs Using Profile: {profileName}</SheetTitle>
          <SheetDescription>
            The following Certificate Authorities use this profile as their default for issuance.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Searching for CAs...</p>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : cas.length > 0 ? (
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-2">
                {cas.map(ca => (
                  <CaVisualizerCard
                    key={ca.id}
                    ca={ca}
                    onClick={() => handleCaSelected(ca)}
                    className="w-full"
                    allCryptoEngines={allCryptoEngines}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground p-4 border rounded-md bg-muted/20">
              No Certificate Authorities found using this issuance profile.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
