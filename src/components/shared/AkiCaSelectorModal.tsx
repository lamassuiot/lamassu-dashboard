

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs } from '@/lib/ca-data';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { useAuth } from '@/contexts/AuthContext';

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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
        <DialogHeader>
          <DialogTitle>Select Issuer Certification Authority</DialogTitle>
          <DialogDescription>
            The following Certification Authorities match the Authority Key Identifier (AKI) of the certificate. Select one to view its details.
          </DialogDescription>
        </DialogHeader>
        
        <div className="min-h-[20rem] my-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Searching for Issuer CA...</p>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : foundCAs.length > 0 ? (
            <ScrollArea className="h-80">
              <div className="space-y-2 p-1">
                {foundCAs.map(ca => (
                  <CaVisualizerCard
                    key={ca.id}
                    ca={ca}
                    onClick={() => handleCaSelected(ca)}
                    allCryptoEngines={allCryptoEngines}
                    className="w-full"
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground p-4 border rounded-md bg-muted/20">
              No matching issuer Certification Authority found in the system for the provided AKI.
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
