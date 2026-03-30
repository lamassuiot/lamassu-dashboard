
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
import { filterCaList, type CaStatusFilter } from '@/lib/ca-utils';

const STATUS_OPTIONS: { value: CaStatusFilter; label: string }[] = [
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
  children,
  allCryptoEngines,
}) => {
  const [filterText, setFilterText] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<CaStatusFilter[]>([]);

  const filteredCAs = useMemo(() => {
    return filterCaList(availableCAs, {
        filterText,
        selectedStatuses,
    });
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
                    <Label htmlFor="modal-ca-filter">Search</Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            id="modal-ca-filter"
                            placeholder="Search certification authorities..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="pl-10 h-9"
                        />
                    </div>
                </div>
                 <div className="space-y-1.5">
                    <Label htmlFor="modal-status-filter">Status</Label>
                    <MultiSelectDropdown
                        id="modal-status-filter"
                        options={STATUS_OPTIONS}
                        allOptionValues={STATUS_OPTIONS.map(o => o.value)}
                        selectedValues={selectedStatuses}
                        onChange={setSelectedStatuses as (selected: string[]) => void}
                        buttonText="All Statuses"
                        className="h-9 min-h-9"
                    />
                </div>
            </div>

            {isLoadingCAs && (
              <div className="flex items-center justify-center h-72">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading Certification Authorities...</p>
              </div>
            )}
            {errorCAs && !isLoadingCAs && (
              <Alert variant="destructive" className="my-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error Loading Certification Authorities</AlertTitle>
                <AlertDescription>
                  {errorCAs} <Button variant="link" onClick={loadCAsAction} className="p-0 h-auto">Try again?</Button>
                </AlertDescription>
              </Alert>
            )}
            {!isLoadingCAs && !errorCAs && filteredCAs.length > 0 && (
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
            {!isLoadingCAs && !errorCAs && filteredCAs.length === 0 && (
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
