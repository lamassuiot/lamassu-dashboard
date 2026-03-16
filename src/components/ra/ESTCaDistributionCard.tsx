
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Key, PlusCircle, X } from "lucide-react";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { SettingsCard } from './SettingsCard';

interface ESTCaDistributionCardProps {
  includeDownstreamCA: boolean;
  setIncludeDownstreamCA: (v: boolean) => void;
  includeEnrollmentCA: boolean;
  setIncludeEnrollmentCA: (v: boolean) => void;
  managedCAs: CA[];
  onRemoveManagedCa: (id: string) => void;
  onAddManagedCa: () => void;
  allCryptoEngines: ApiCryptoEngine[];
}

export function ESTCaDistributionCard({
  includeDownstreamCA,
  setIncludeDownstreamCA,
  includeEnrollmentCA,
  setIncludeEnrollmentCA,
  managedCAs,
  onRemoveManagedCa,
  onAddManagedCa,
  allCryptoEngines,
}: ESTCaDistributionCardProps) {
  return (
    <SettingsCard
      icon={AlertTriangle}
      title="CA Distribution"
      description="Choose which authorities and chains are distributed to clients through this Registration Authority."
    >
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="includeDownstreamCA" className="flex items-center">
            <AlertTriangle className="mr-2 h-4 w-4 text-muted-foreground" />
            Include 'Downstream' CA
          </Label>
          <p className="text-sm text-muted-foreground">
            Include downstream Certificate Authorities in the distribution.
          </p>
        </div>
        <Switch id="includeDownstreamCA" checked={includeDownstreamCA} onCheckedChange={setIncludeDownstreamCA} />
      </div>
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="includeEnrollmentCA" className="flex items-center">
            <Key className="mr-2 h-4 w-4 text-muted-foreground" />
            Include Enrollment CA
          </Label>
          <p className="text-sm text-muted-foreground">
            Include the enrollment Certificate Authority in the distribution.
          </p>
        </div>
        <Switch id="includeEnrollmentCA" checked={includeEnrollmentCA} onCheckedChange={setIncludeEnrollmentCA} />
      </div>
      <div>
        <Label>Managed CAs</Label>
        <div className="mt-2 space-y-2">
          {managedCAs.length > 0 ? (
            managedCAs.map(ca => (
              <div key={ca.id} className="flex items-center gap-2 group">
                <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => onRemoveManagedCa(ca.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic text-center p-2">No managed CAs selected.</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddManagedCa} className="mt-2">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Managed CA
        </Button>
      </div>
    </SettingsCard>
  );
}
