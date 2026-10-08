
'use client';

import React, { useMemo, useState } from 'react';
import { Search } from "lucide-react";
import type { CA } from '@/lib/ca-data';
import { CaTableView } from '@/components/ca/CaTableView';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { CaDrawer } from './CaDrawer';
import { filterCaList, hasActiveCaFilters, type CaStatusFilter } from '@/lib/ca-utils';

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
  allCryptoEngines?: ApiCryptoEngine[];
  /** Why a CA cannot be picked, or null when it can. Unpickable CAs stay listed but blurred. */
  getDisabledReason?: (ca: CA) => string | null;
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
  allCryptoEngines,
  getDisabledReason,
}) => {
  const [filterText, setFilterText] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<CaStatusFilter[]>([]);

  const filters = useMemo(() => ({ filterText, selectedStatuses }), [filterText, selectedStatuses]);
  const filteredCAs = useMemo(() => filterCaList(availableCAs, filters), [availableCAs, filters]);

  return (
    <CaDrawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      toolbar={
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="modal-ca-filter">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="modal-ca-filter"
                placeholder="Search certification authorities..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-9 pl-10"
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
      }
      isLoading={isLoadingCAs}
      error={errorCAs}
      onRetry={loadCAsAction}
      isEmpty={filteredCAs.length === 0}
      emptyText={hasActiveCaFilters(filters) ? 'No CAs match your search.' : 'No Certification Authorities available to select.'}
    >
      <CaTableView
        cas={filteredCAs}
        allCryptoEngines={allCryptoEngines ?? []}
        filters={filters}
        onSelect={onCaSelected}
        selectedCaId={currentSelectedCaId}
        getDisabledReason={getDisabledReason}
      />
    </CaDrawer>
  );
};
