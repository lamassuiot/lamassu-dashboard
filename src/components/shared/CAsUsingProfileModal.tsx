
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CA } from '@/lib/ca-data';
import { fetchAndProcessCAs, fetchCryptoEngines } from '@/lib/ca-data';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { useAuth } from '@/contexts/AuthContext';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

interface CAsUsingProfileModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  profileId: string;
  profileName: string;
  onUsageLoaded?: (count: number) => void; // New callback prop
}

export const CAsUsingProfileModal: React.FC<CAsUsingProfileModalProps> = ({
  isOpen,
  onOpenChange,
  profileId,
  profileName,
  onUsageLoaded,
}) => {
  const router = useRouter();
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  
  const [cas, setCas] = useState<CA[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);


  const fetchCAs = useCallback(async () => {
    if (!profileId || !isOpen || !isAuthenticated() || !user?.access_token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setCas([]);

    try {
      const [casData, enginesData] = await Promise.all([
        fetchAndProcessCAs(user.access_token, `filter=profile_id[equal]${profileId}`),
        fetchCryptoEngines(user.access_token) // Fetch engines for the visualizer cards
      ]);
      setCas(casData);
      setAllCryptoEngines(enginesData);
      onUsageLoaded?.(casData.length); // Call the callback with the count
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred while searching for CAs.');
    } finally {
      setIsLoading(false);
    }
  }, [profileId, isOpen, isAuthenticated, user?.access_token, onUsageLoaded]);

  useEffect(() => {
    fetchCAs();
  }, [fetchCAs]);

  const handleCaSelected = (ca: CA) => {
    onOpenChange(false);
    router.push(`/certificate-authorities/details?caId=${ca.id}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>CAs Using Profile: {profileName}</DialogTitle>
          <DialogDescription>
            The following Certificate Authorities use this profile as their default for issuance.
          </DialogDescription>
        </DialogHeader>
        
        <div className="min-h-[20rem] my-4">
          {(isLoading || isAuthLoading) ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">{isAuthLoading ? "Authenticating..." : "Searching for CAs..."}</p>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : cas.length > 0 ? (
            <ScrollArea className="h-80">
              <div className="space-y-2 p-1">
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

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
