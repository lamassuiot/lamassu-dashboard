

'use client';

import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CA } from '@/lib/ca-data';
import { SelectableCaTreeItem } from './SelectableCaTreeItem';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectDropdown } from './MultiSelectDropdown';

type CaStatus = 'active' | 'expired' | 'revoked' | 'unknown';

const STATUS_OPTIONS: { value: CaStatus; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'expired', label: 'Expired' },
    { value: 'revoked', label: 'Revoked' },
];

interface CaSelectorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  availableCAs: CA[];
  isLoadingCAs: boolean;
  errorCAs: string | null;
  loadCAsAction: () => void;
  onCaSelected: (ca: CA) => void;
  currentSelectedCaId?: string | null;
  isAuthLoading: boolean;
  children?: React.ReactNode;
  allCryptoEngines?: ApiCryptoEngine[];
}

export const CaSelectorModal: React.FC<CaSelectorModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  description,
  availableCAs,
  isLoadingCAs,
  errorCAs,
  loadCAsAction,
  onCaSelected,
  currentSelectedCaId,
  isAuthLoading,
  children,
  allCryptoEngines,
}) => {
  const [filterText, setFilterText] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<CaStatus[]>(['active', 'expired']);

  const filteredCAs = useMemo(() => {
    const filterCaList = (caList: CA[]): CA[] => {
      return caList
        .map(ca => {
          const filteredChildren = ca.children ? filterCaList(ca.children) : [];
          const newCa = { ...ca, children: filteredChildren };
          
          const matchesStatus = selectedStatuses.includes(ca.status);
          const matchesText = filterText ? ca.name.toLowerCase().includes(filterText.toLowerCase()) : true;
          
          if (matchesText && matchesStatus) {
            return newCa;
          }
          
          if (filteredChildren.length > 0) {
              return newCa;
          }

          return null;
        })
        .filter((ca): ca is CA => ca !== null);
    };

    return filterCaList(availableCAs);
  }, [availableCAs, filterText, selectedStatuses]);


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? (
          children
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end py-2">
                <div className="flex-grow space-y-1.5">
                    <Label htmlFor="modal-ca-filter">Filter by Name</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="modal-ca-filter"
                            placeholder="e.g., My Root CA..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
                 <div className="space-y-1.5">
                    <Label htmlFor="modal-status-filter">Filter by Status</Label>
                    <MultiSelectDropdown
                        id="modal-status-filter"
                        options={STATUS_OPTIONS}
                        selectedValues={selectedStatuses}
                        onChange={setSelectedStatuses}
                        buttonText="Filter by status..."
                    />
                </div>
            </div>

            {(isLoadingCAs || isAuthLoading) && (
              <div className="flex items-center justify-center h-72">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">{isAuthLoading ? "Authenticating..." : "Loading Certification Authorities..."}</p>
              </div>
            )}
            {errorCAs && !isLoadingCAs && !isAuthLoading && (
              <Alert variant="destructive" className="my-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error Loading Certification Authorities</AlertTitle>
                <AlertDescription>
                  {errorCAs} <Button variant="link" onClick={loadCAsAction} className="p-0 h-auto">Try again?</Button>
                </AlertDescription>
              </Alert>
            )}
            {!isLoadingCAs && !isAuthLoading && !errorCAs && filteredCAs.length > 0 && (
              <ScrollArea className="h-72 my-4 border rounded-md">
                <ul className="space-y-0.5 p-2">
                  {filteredCAs.map((ca) => (
                    <SelectableCaTreeItem
                      key={ca.id}
                      ca={ca}
                      level={0}
                      onSelect={onCaSelected}
                      currentSingleSelectedCaId={currentSelectedCaId}
                      allCryptoEngines={allCryptoEngines}
                    />
                  ))}
                </ul>
              </ScrollArea>
            )}
            {!isLoadingCAs && !isAuthLoading && !errorCAs && filteredCAs.length === 0 && (
              <p className="text-muted-foreground text-center my-4 p-4 border rounded-md bg-muted/20">
                {filterText || selectedStatuses.length > 0 ? "No CAs match your search." : "No Certification Authorities available to select."}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
