
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, PlusCircle, X, HelpCircle, Loader2 } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { SettingsCard } from './SettingsCard';

interface CMPEnrollmentSettingsCardProps {
  cmpEnrollmentCa: CA | null;
  onSelectCmpEnrollmentCa: () => void;
  isLoadingDependencies: boolean;
  authLoading: boolean;
  allCryptoEngines: ApiCryptoEngine[];
  cmpConfirmationMode: string;
  setCmpConfirmationMode: (v: string) => void;
  cmpConfirmationTimeout: string;
  setCmpConfirmationTimeout: (v: string) => void;
  cmpValidationCAs: CA[];
  onRemoveCmpValidationCa: (id: string) => void;
  onAddCmpValidationCa: () => void;
  cmpAllowExpiredAuth: boolean;
  setCmpAllowExpiredAuth: (v: boolean) => void;
  cmpChainValidationLevel: number;
  setCmpChainValidationLevel: (v: number) => void;
  cmpProtectionCa: CA | null;
  onSelectCmpProtectionCa: () => void;
  onClearCmpProtectionCa: () => void;
}

export function CMPEnrollmentSettingsCard({
  cmpEnrollmentCa,
  onSelectCmpEnrollmentCa,
  isLoadingDependencies,
  authLoading,
  allCryptoEngines,
  cmpConfirmationMode,
  setCmpConfirmationMode,
  cmpConfirmationTimeout,
  setCmpConfirmationTimeout,
  cmpValidationCAs,
  onRemoveCmpValidationCa,
  onAddCmpValidationCa,
  cmpAllowExpiredAuth,
  setCmpAllowExpiredAuth,
  cmpChainValidationLevel,
  setCmpChainValidationLevel,
  cmpProtectionCa,
  onSelectCmpProtectionCa,
  onClearCmpProtectionCa,
}: CMPEnrollmentSettingsCardProps) {
  return (
    <SettingsCard
      icon={ShieldCheck}
      title="CMP Enrollment Settings"
      description="Configure the enrollment CA, confirmation behavior, and client certificate authentication for CMP (RFC 9483 / LWC)."
    >
      <div>
        <Label>Enrollment CA</Label>
        <Button type="button" variant="outline" onClick={onSelectCmpEnrollmentCa} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies || authLoading}>
          {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : cmpEnrollmentCa ? cmpEnrollmentCa.name : "Select Enrollment CA..."}
        </Button>
        {cmpEnrollmentCa && <div className="mt-2"><CaVisualizerCard ca={cmpEnrollmentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} /></div>}
      </div>

      <div>
        <Label>Protection CA</Label>
        <p className="text-xs text-muted-foreground mb-1">CA whose key signs CMP response messages. Leave empty to send responses unprotected.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onSelectCmpProtectionCa} className="flex-1 justify-start text-left font-normal" disabled={isLoadingDependencies || authLoading}>
            {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : cmpProtectionCa ? cmpProtectionCa.name : "Select Protection CA..."}
          </Button>
          {cmpProtectionCa && (
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" onClick={onClearCmpProtectionCa}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {cmpProtectionCa && <div className="mt-2"><CaVisualizerCard ca={cmpProtectionCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} /></div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cmpConfirmationMode">Confirmation Mode</Label>
          <Select value={cmpConfirmationMode || 'default'} onValueChange={(v) => setCmpConfirmationMode(v === 'default' ? '' : v)}>
            <SelectTrigger id="cmpConfirmationMode" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (implicit)</SelectItem>
              <SelectItem value="IMPLICIT">IMPLICIT</SelectItem>
              <SelectItem value="EXPLICIT">EXPLICIT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {cmpConfirmationMode === 'EXPLICIT' && (
          <div>
            <Label htmlFor="cmpConfirmationTimeout">Confirmation Timeout</Label>
            <Input id="cmpConfirmationTimeout" value={cmpConfirmationTimeout} onChange={(e) => setCmpConfirmationTimeout(e.target.value)} placeholder="e.g., 30s, 2m" className="mt-1" />
          </div>
        )}
      </div>

      <div className="space-y-4 pt-2 border-t">
        <h4 className="font-medium text-sm text-muted-foreground pt-2">Client Certificate Authentication</h4>
        <div>
          <Label>Validation CAs</Label>
          <div className="mt-2 space-y-2">
            {cmpValidationCAs.length > 0 ? (
              cmpValidationCAs.map(ca => (
                <div key={ca.id} className="flex items-center gap-2 group">
                  <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => onRemoveCmpValidationCa(ca.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic text-center p-2">No validation CAs selected.</p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onAddCmpValidationCa} className="mt-2">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Validation CA
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <Switch id="cmpAllowExpiredAuth" checked={cmpAllowExpiredAuth} onCheckedChange={setCmpAllowExpiredAuth} />
          <Label htmlFor="cmpAllowExpiredAuth">Allow Expired Client Certificates</Label>
        </div>
        <div>
          <Label htmlFor="cmpChainValidationLevel" className="flex items-center">
            Chain Validation Level
            <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent><p>0 = leaf only, 1 = one intermediate, etc.</p></TooltipContent></Tooltip></TooltipProvider>
          </Label>
          <Input id="cmpChainValidationLevel" type="number" min={0} value={cmpChainValidationLevel} onChange={(e) => setCmpChainValidationLevel(Number.parseInt(e.target.value) || 0)} className="mt-1" />
        </div>
      </div>
    </SettingsCard>
  );
}
