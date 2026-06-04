'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, X, RefreshCw } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import { CertificateCard } from '@/components/shared/CertificateCard';
import { DurationInput } from '@/components/shared/DurationInput';
import { cn } from '@/lib/utils';
import type { VAConfig } from '@/lib/va-api';

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
            <CertificateCard
              name={selectedCertificateSignerDisplay.subject ?? ''}
              serialNumber={selectedCertificateSignerDisplay.serialNumber}
              issuer={selectedCertificateSignerDisplay.issuer}
              issuerCaId={selectedCertificateSignerDisplay.issuerCaId}
              topRight={
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
              }
              footer={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onCertificateSignerModalOpenChange(true)}
                  disabled={isSubmitting}
                >
                  Change certificate
                </Button>
              }
            />
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
