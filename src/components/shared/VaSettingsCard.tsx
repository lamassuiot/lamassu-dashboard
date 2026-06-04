'use client';

import Link from 'next/link';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, FileText, X, RefreshCw } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import { DurationInput } from '@/components/shared/DurationInput';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { cn } from '@/lib/utils';
import type { VAConfig } from '@/lib/va-api';

function getCommonName(subjectOrIssuer: string | undefined): string {
  if (!subjectOrIssuer) return '';
  const cnMatch = subjectOrIssuer.match(/CN=([^,]+)/i);
  return cnMatch ? cnMatch[1].trim() : subjectOrIssuer;
}

interface VaSettingsCardProps {
  config: VAConfig;
  onInputChange: (key: 'refreshInterval' | 'validity', value: string) => void;
  onSwitchChange: (key: 'regenerateOnRevoke') => void;
  selectedCertificateSignerDisplay: CertificateData | null;
  onCertificateSignerSelected: (cert: CertificateData) => void;
  onClearCertificateSigner: () => void;
  isCertificateSignerModalOpen: boolean;
  onCertificateSignerModalOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  isLoadingConfig: boolean;
  onSave: () => void;
  onRefresh: () => void;
  limitToCAs?: CA[];
}

export function VaSettingsCard({
  config,
  onInputChange,
  onSwitchChange,
  selectedCertificateSignerDisplay,
  onCertificateSignerSelected,
  onClearCertificateSigner,
  isCertificateSignerModalOpen,
  onCertificateSignerModalOpenChange,
  isSubmitting,
  isLoadingConfig,
  onSave,
  onRefresh,
  limitToCAs,
}: VaSettingsCardProps) {
  return (
    <div className="space-y-6">
        <DurationInput
          id="va-refreshInterval"
          label="CRL Refresh Interval"
          value={config.refreshInterval}
          onChange={(value) => onInputChange('refreshInterval', value)}
          placeholder="e.g., 24h, 30m, 7d"
          description="How often to check for new CRLs."
        />
        <DurationInput
          id="va-validity"
          label="CRL Max Validity / Cache Duration"
          value={config.validity}
          onChange={(value) => onInputChange('validity', value)}
          placeholder="e.g., 7d, 48h"
          description="Maximum time to consider a cached CRL valid."
        />

        <div className="space-y-1">
          <Label>CRL Signer</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Certificate whose public key corresponds to the SubjectKeyIdentifier in generated CRLs.
          </p>
          {selectedCertificateSignerDisplay ? (
            <div className="rounded-md border bg-muted/20">
              <div className="flex items-start gap-3 p-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  {selectedCertificateSignerDisplay.serialNumber &&
                  selectedCertificateSignerDisplay.serialNumber !== 'Unknown' ? (
                    <Button
                      variant="link"
                      className="h-auto min-w-0 justify-start truncate p-0 text-left text-sm font-medium"
                      asChild
                    >
                      <Link
                        href={`/certificates/details?certificateId=${encodeURIComponent(selectedCertificateSignerDisplay.serialNumber)}`}
                        title={
                          selectedCertificateSignerDisplay.subject ||
                          `View certificate ${selectedCertificateSignerDisplay.serialNumber}`
                        }
                      >
                        {getCommonName(selectedCertificateSignerDisplay.subject) ||
                          selectedCertificateSignerDisplay.subject}
                      </Link>
                    </Button>
                  ) : (
                    <p
                      className="truncate text-sm font-medium text-foreground"
                      title={selectedCertificateSignerDisplay.subject}
                    >
                      {getCommonName(selectedCertificateSignerDisplay.subject) ||
                        selectedCertificateSignerDisplay.subject}
                    </p>
                  )}
                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[72px_minmax(0,1fr)]">
                    {selectedCertificateSignerDisplay.serialNumber && (
                      <>
                        <span className="text-muted-foreground/80">Serial</span>
                        <IdentifierDisplay
                          value={selectedCertificateSignerDisplay.serialNumber}
                          className="min-w-0 truncate font-mono text-xs text-muted-foreground"
                        />
                      </>
                    )}
                    {selectedCertificateSignerDisplay.issuer && (
                      <>
                        <span className="text-muted-foreground/80">Issuer</span>
                        {selectedCertificateSignerDisplay.issuerCaId ? (
                          <Button
                            variant="link"
                           
                            className="h-auto min-w-0 justify-start truncate p-0 text-xs font-normal"
                            asChild
                          >
                            <Link
                              href={`/certificate-authorities/details?caId=${encodeURIComponent(selectedCertificateSignerDisplay.issuerCaId)}`}
                              title={`View CA ${selectedCertificateSignerDisplay.issuerCaId}`}
                            >
                              {selectedCertificateSignerDisplay.issuerCaId}
                            </Link>
                          </Button>
                        ) : (
                          <span className="min-w-0 truncate" title={selectedCertificateSignerDisplay.issuer}>
                            {getCommonName(selectedCertificateSignerDisplay.issuer)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClearCertificateSigner}
                  disabled={isSubmitting}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Clear CRL signer certificate</span>
                </Button>
              </div>
              <div className="border-t px-3 py-2">
                <Button
                  type="button"
                  variant="secondary"
                 
                  onClick={() => onCertificateSignerModalOpenChange(true)}
                  disabled={isSubmitting}
                >
                  Change certificate
                </Button>
              </div>
            </div>
          ) : (
            <Button
              id="va-crlSigner"
              type="button"
              variant="secondary"
              onClick={() => onCertificateSignerModalOpenChange(true)}
              className="w-full justify-start text-left font-normal"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Select CRL Signer Certificate...'
              )}
            </Button>
          )}
        </div>

        <div className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="va-regenerateOnRevoke" className="flex items-center">
              <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" />
              Regenerate CRL Immediately on Revocation
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, a new CRL will be generated immediately whenever a certificate is revoked.
            </p>
          </div>
          <Switch
            id="va-regenerateOnRevoke"
            checked={config.regenerateOnRevoke}
            onCheckedChange={() => onSwitchChange('regenerateOnRevoke')}
            disabled={isSubmitting}
          />
        </div>

        <CertificateSelectorModal
          isOpen={isCertificateSignerModalOpen}
          onOpenChange={onCertificateSignerModalOpenChange}
          title="Select CRL Signer Certificate"
          description="Choose the certificate whose public key will be used for the SubjectKeyIdentifier in CRLs generated by this VA."
          onCertificateSelected={onCertificateSignerSelected}
          currentSelectedCertificateId={config.subjectKeyIDSigner}
          limitToCAs={limitToCAs}
          requiredKeyUsages={['CRLSign']}
          includeCaCertificates
        />

        <div className="flex items-center gap-2">
          <Button onClick={onSave} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : 'Save VA Configuration'}
          </Button>
          <Button variant="secondary" onClick={onRefresh} disabled={isLoadingConfig}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoadingConfig && 'animate-spin')} />
            Refresh
          </Button>
        </div>
    </div>
  );
}
