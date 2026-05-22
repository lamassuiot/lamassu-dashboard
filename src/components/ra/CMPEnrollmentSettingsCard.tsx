
'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FileText, ShieldCheck, PlusCircle, HelpCircle, Loader2, X } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { CertificateData } from '@/types/certificate';
import { SettingsCard } from './SettingsCard';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

interface CMPEnrollmentSettingsCardProps {
  enrollmentCa: CA | null;
  onSelectEnrollmentCa: () => void;
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
  cmpProtectionCertificate: CertificateData | null;
  cmpProtectionCertificateId?: string | null;
  onSelectCmpProtectionCertificate: () => void;
  onClearCmpProtectionCertificate: () => void;
}

function getCertificateName(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/CN=([^,]+)/);
  return match ? match[1] : value;
}

function getCaIdReference(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^CA_ID:(.+)$/);
  return match ? match[1] : null;
}

const confirmationModeOptions = [
  {
    value: 'default',
    title: 'Default (implicit)',
    description: 'Use the server default behavior and treat enrollment as implicitly confirmed.',
  },
  {
    value: 'IMPLICIT',
    title: 'Implicit',
    description: 'Complete enrollment without waiting for an additional confirmation message from the client.',
  },
  {
    value: 'EXPLICIT',
    title: 'Explicit',
    description: 'Require the client to confirm the issued certificate before the configured timeout expires.',
  },
] as const;

export function CMPEnrollmentSettingsCard({
  enrollmentCa,
  onSelectEnrollmentCa,
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
  cmpProtectionCertificate,
  cmpProtectionCertificateId,
  onSelectCmpProtectionCertificate,
  onClearCmpProtectionCertificate,
}: CMPEnrollmentSettingsCardProps) {
  const protectionCertificateSerial = cmpProtectionCertificate?.serialNumber || cmpProtectionCertificateId || '';
  const protectionCertificateName = getCertificateName(cmpProtectionCertificate?.subject) || 'Protection certificate';
  const protectionCertificateIssuer = getCertificateName(cmpProtectionCertificate?.issuer);
  const protectionCertificateIssuerCaId = cmpProtectionCertificate?.issuerCaId || getCaIdReference(cmpProtectionCertificate?.issuer);
  const selectedConfirmationMode = confirmationModeOptions.find((option) => option.value === (cmpConfirmationMode || 'default'));

  return (
    <SettingsCard
      icon={ShieldCheck}
      title="CMP Enrollment Settings"
      description="Configure the enrollment CA, confirmation behavior, and client certificate authentication for CMP (RFC 9483 / LWC)."
    >
      <div>
        <Label>Enrollment CA</Label>
        <Button type="button" variant="outline" onClick={onSelectEnrollmentCa} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies || authLoading}>
          {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enrollmentCa ? enrollmentCa.name : "Select Enrollment CA..."}
        </Button>
        {enrollmentCa && <div className="mt-2"><CaVisualizerCard ca={enrollmentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} /></div>}
      </div>

      <div>
        <Label>Protection Certificate</Label>
        <p className="text-xs text-muted-foreground mb-2">Certificate used to sign CMP response messages. Leave empty to send responses unprotected.</p>
        {(cmpProtectionCertificate || cmpProtectionCertificateId) ? (
          <div className="rounded-md border bg-muted/20">
            <div className="flex items-start gap-3 p-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-1">
                {protectionCertificateSerial ? (
                  <Button variant="link" className="h-auto min-w-0 justify-start truncate p-0 text-left text-sm font-medium" asChild>
                    <Link
                      href={`/certificates/details?certificateId=${encodeURIComponent(protectionCertificateSerial)}`}
                      title={cmpProtectionCertificate?.subject || `View certificate ${protectionCertificateSerial}`}
                    >
                      {protectionCertificateName}
                    </Link>
                  </Button>
                ) : (
                  <p className="truncate text-sm font-medium text-foreground" title={cmpProtectionCertificate?.subject || protectionCertificateSerial}>
                    {protectionCertificateName}
                  </p>
                )}
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[72px_minmax(0,1fr)]">
                  {protectionCertificateSerial && (
                    <>
                      <span className="text-muted-foreground/80">Serial</span>
                      <IdentifierDisplay value={protectionCertificateSerial} className="min-w-0 truncate font-mono text-xs text-muted-foreground" />
                    </>
                  )}
                  {protectionCertificateIssuer && (
                    <>
                      <span className="text-muted-foreground/80">Issuer</span>
                      {protectionCertificateIssuerCaId ? (
                        <Button variant="link" size="sm" className="h-auto min-w-0 justify-start truncate p-0 text-xs font-normal" asChild>
                          <Link
                            href={`/certificate-authorities/details?caId=${encodeURIComponent(protectionCertificateIssuerCaId)}`}
                            title={`View CA ${protectionCertificateIssuerCaId}`}
                          >
                            {protectionCertificateIssuerCaId}
                          </Link>
                        </Button>
                      ) : (
                        <span className="min-w-0 truncate" title={cmpProtectionCertificate?.issuer}>{protectionCertificateIssuer}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onClearCmpProtectionCertificate} disabled={isLoadingDependencies || authLoading} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
                <span className="sr-only">Clear protection certificate</span>
              </Button>
            </div>
            <div className="border-t px-3 py-2">
              <Button type="button" variant="secondary" size="sm" onClick={onSelectCmpProtectionCertificate} disabled={isLoadingDependencies || authLoading}>
                Change certificate
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={onSelectCmpProtectionCertificate} className="w-full justify-start text-left font-normal" disabled={isLoadingDependencies || authLoading}>
            {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Select Protection Certificate..."}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cmpConfirmationMode">Confirmation Mode</Label>
          <Select value={cmpConfirmationMode || 'default'} onValueChange={(v) => setCmpConfirmationMode(v === 'default' ? '' : v)}>
            <SelectTrigger id="cmpConfirmationMode" className="mt-1">
              <SelectValue>{selectedConfirmationMode?.title}</SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[320px]">
              {confirmationModeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} textValue={option.title} className="items-start py-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-none">{option.title}</p>
                    <p className="text-xs leading-snug text-muted-foreground">{option.description}</p>
                  </div>
                </SelectItem>
              ))}
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
