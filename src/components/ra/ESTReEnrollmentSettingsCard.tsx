
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PackageCheck, AlertTriangle, PlusCircle, X } from "lucide-react";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { DurationInput } from '@/components/shared/DurationInput';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { SettingsCard } from './SettingsCard';

interface ESTReEnrollmentSettingsCardProps {
  revokeOnReEnroll: boolean;
  setRevokeOnReEnroll: (v: boolean) => void;
  allowExpiredRenewal: boolean;
  setAllowExpiredRenewal: (v: boolean) => void;
  allowedRenewalDelta: string;
  setAllowedRenewalDelta: (v: string) => void;
  preventiveRenewalDelta: string;
  setPreventiveRenewalDelta: (v: string) => void;
  criticalRenewalDelta: string;
  setCriticalRenewalDelta: (v: string) => void;
  additionalValidationCAs: CA[];
  onRemoveAdditionalValidationCa: (id: string) => void;
  onAddAdditionalValidationCa: () => void;
  allCryptoEngines: ApiCryptoEngine[];
}

export function ESTReEnrollmentSettingsCard({
  revokeOnReEnroll,
  setRevokeOnReEnroll,
  allowExpiredRenewal,
  setAllowExpiredRenewal,
  allowedRenewalDelta,
  setAllowedRenewalDelta,
  preventiveRenewalDelta,
  setPreventiveRenewalDelta,
  criticalRenewalDelta,
  setCriticalRenewalDelta,
  additionalValidationCAs,
  onRemoveAdditionalValidationCa,
  onAddAdditionalValidationCa,
  allCryptoEngines,
}: ESTReEnrollmentSettingsCardProps) {
  return (
    <SettingsCard
      icon={PackageCheck}
      title="Re-Enrollment Settings"
      description="Set certificate replacement, renewal windows, and additional trust requirements for re-enrollment."
    >
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="revokeOnReEnroll" className="flex items-center">
            <PackageCheck className="mr-2 h-4 w-4 text-muted-foreground" />
            Revoke On Re-Enroll
          </Label>
          <p className="text-sm text-muted-foreground">
            Automatically revoke the old certificate when a new one is issued during re-enrollment.
          </p>
        </div>
        <Switch id="revokeOnReEnroll" checked={revokeOnReEnroll} onCheckedChange={setRevokeOnReEnroll} />
      </div>
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="allowExpiredRenewal" className="flex items-center">
            <AlertTriangle className="mr-2 h-4 w-4 text-muted-foreground" />
            Allow Expired Renewal
          </Label>
          <p className="text-sm text-muted-foreground">
            Permit renewal of certificates that have already expired.
          </p>
        </div>
        <Switch id="allowExpiredRenewal" checked={allowExpiredRenewal} onCheckedChange={setAllowExpiredRenewal} />
      </div>
      <DurationInput id="allowedRenewalDelta" label="Allowed Renewal Delta" value={allowedRenewalDelta} onChange={setAllowedRenewalDelta} placeholder="e.g., 100d" description="Max time after expiry a cert can be renewed."/>
      <DurationInput id="preventiveRenewalDelta" label="Preventive Renewal Delta" value={preventiveRenewalDelta} onChange={setPreventiveRenewalDelta} placeholder="e.g., 31d" description="Time before expiry to start allowing renewals."/>
      <DurationInput id="criticalRenewalDelta" label="Critical Renewal Delta" value={criticalRenewalDelta} onChange={setCriticalRenewalDelta} placeholder="e.g., 7d" description="Time before expiry when renewal is critical."/>
      <div>
        <Label htmlFor="additionalValidationCAs">Additional Validation CAs (for re-enrollment)</Label>
        <div className="mt-2 space-y-2">
          {additionalValidationCAs.length > 0 ? (
            additionalValidationCAs.map(ca => (
              <div key={ca.id} className="flex items-center gap-2 group">
                <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => onRemoveAdditionalValidationCa(ca.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic text-center p-2">No additional validation CAs selected.</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddAdditionalValidationCa} className="mt-2">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Additional Validation CA
        </Button>
      </div>
    </SettingsCard>
  );
}
