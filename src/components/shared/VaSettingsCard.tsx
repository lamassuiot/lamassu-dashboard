'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, X, RefreshCw, Archive, History, Info } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { CertificateSelectorModal } from '@/components/shared/CertificateSelectorModal';
import { SignerCertificateCard } from '@/components/shared/SignerCertificateCard';
import { DurationInput } from '@/components/shared/DurationInput';
import { isValidDurationOrZero, isValidPositiveDuration, isZeroOrZeroDuration } from '@/lib/duration';
import { cn } from '@/lib/utils';
import type { CrlSettingsState } from '@/hooks/useCrlSettings';
import { getCrlUrl } from '@/lib/va-api';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

interface VaSettingsCardProps {
  state: CrlSettingsState;
  limitToCAs?: CA[];
}

export function VaSettingsCard({ state, limitToCAs }: VaSettingsCardProps) {
  const [isSignerModalOpen, setIsSignerModalOpen] = useState(false);
  const { settings, signerDisplay, isSubmitting, isLoading, isReadOnly } = state;
  if (!settings) return null;

  const disabled = isSubmitting || isReadOnly;
  // "0" disables interval-based regeneration: the CRL is then only regenerated before it expires.
  const refreshIntervalError = !isValidDurationOrZero(settings.refreshInterval)
    ? 'CRL refresh interval must be a duration, or 0 to disable it.'
    : null;
  const refreshIntervalDisabled = isZeroOrZeroDuration(settings.refreshInterval);
  const validityError = !isValidPositiveDuration(settings.validity)
    ? 'CRL cache duration must be a positive duration.'
    : null;
  const signerError = !signerDisplay || !settings.signerSerialNumber
    ? 'CRL signer certificate is required.'
    : null;
  const validationErrors = isReadOnly ? [] : [refreshIntervalError, validityError, signerError]
    .filter((message): message is string => Boolean(message));

  const handleSignerSelected = (certificate: CertificateData) => {
    state.selectSigner(certificate);
    setIsSignerModalOpen(false);
  };

  return (
    <div className="space-y-6">
        <DurationInput
          id="va-refreshInterval"
          label="CRL Refresh Interval"
          value={settings.refreshInterval}
          onChange={(value) => state.setDuration('refreshInterval', value)}
          disabled={disabled}
          placeholder="e.g., 24h, 30m, 7d, or 0 to disable"
          allowZero
          description="Time since the latest CRL after which a new one is generated. Use 0 to disable."
          error={isReadOnly ? undefined : refreshIntervalError || undefined}
        />
        {refreshIntervalDisabled && (
          <Alert>
            <Info />
            <AlertTitle>Periodic CRL regeneration disabled</AlertTitle>
            <AlertDescription>
              With a refresh interval of 0, no new CRL is generated just because time has passed. A new CRL is only
              generated shortly before the current one expires (its validity is set below)
              {settings.regenerateOnRevoke
                ? ', and immediately whenever a certificate is revoked.'
                : '. Revocations are not published until then, because regeneration on revocation is off.'}
            </AlertDescription>
          </Alert>
        )}
        <DurationInput
          id="va-validity"
          label="CRL Max Validity / Cache Duration"
          value={settings.validity}
          onChange={(value) => state.setDuration('validity', value)}
          disabled={disabled}
          placeholder="e.g., 7d, 48h"
          description="Maximum time to consider a cached CRL valid."
          error={isReadOnly ? undefined : validityError || undefined}
        />

        <div className="space-y-1">
          <Label>CRL Signer</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Certificate whose public key corresponds to the SubjectKeyIdentifier in generated CRLs.
          </p>
          {signerDisplay ? (
            <SignerCertificateCard
              certificate={signerDisplay}
              topRight={!isReadOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={state.clearSigner}
                  disabled={disabled}
                  className="text-muted-foreground hover:text-destructive"
                  title="Clear CRL signer certificate"
                >
                  <X />
                  <span className="sr-only">Clear CRL signer certificate</span>
                </Button>
              )}
              action={!isReadOnly && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsSignerModalOpen(true)}
                  disabled={disabled}
                >
                  Change certificate
                </Button>
              )}
            />
          ) : (
            <Button
              id="va-crlSigner"
              type="button"
              variant="secondary"
              onClick={() => setIsSignerModalOpen(true)}
              className="w-full justify-start text-left font-normal"
              disabled={disabled}
              aria-invalid={!!signerError}
              aria-describedby={signerError ? 'va-crl-signer-error' : undefined}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Select CRL Signer Certificate...'
              )}
            </Button>
          )}
          {signerError && !isReadOnly && <FormFieldError id="va-crl-signer-error" title={signerError} />}
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
            checked={settings.regenerateOnRevoke}
            onCheckedChange={state.toggleRegenerateOnRevoke}
            disabled={disabled}
          />
        </div>

        <CertificateSelectorModal
          isOpen={isSignerModalOpen}
          onOpenChange={setIsSignerModalOpen}
          title="Select CRL Signer Certificate"
          description="Choose the certificate whose public key will be used for the SubjectKeyIdentifier in the CRLs of this CA."
          onCertificateSelected={handleSignerSelected}
          currentSelectedCertificateId={settings.signerSerialNumber}
          limitToCAs={limitToCAs}
          requirePrivateKey
          requiredKeyUsages={['CRLSign']}
          includeCaCertificates
        />

        <FormValidationSummary errors={validationErrors} />
        <div className="flex items-center gap-2">
          <Button onClick={state.save} disabled={disabled || validationErrors.length > 0}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : 'Save CRL Settings'}
          </Button>
          <Button variant="secondary" onClick={state.reload} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
    </div>
  );
}

/** Shown for `ARCHIVED` CRL settings, which cannot be edited. */
export function ArchivedCrlSettingsAlert({ className }: { className?: string }) {
  return (
    <Alert variant="warning" className={className}>
      <Archive className="h-4 w-4" />
      <AlertTitle>Archived CRL Settings</AlertTitle>
      <AlertDescription>
        These settings belong to a CA that no longer exists. Its last CRL is still served, but it is never regenerated and the settings cannot be edited.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Shown for CRL settings migrated from the SKI-keyed model: certificates issued back then point
 * their CDP at `/crl/<ski>`, which keeps resolving to the CRL of this CA.
 */
export function LegacyCrlUrlNote({ legacySki }: { legacySki: string | null }) {
  if (!legacySki) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
      <History className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p>Certificates issued before CRL settings were keyed by CA ID keep using the legacy CRL URL, which still resolves to this CRL:</p>
        <code className="block break-all font-mono text-foreground">{getCrlUrl(legacySki)}</code>
      </div>
    </div>
  );
}
