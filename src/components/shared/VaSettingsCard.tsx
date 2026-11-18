'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { getCrlUrl, type CrlSettingsStatus } from '@/lib/va-api';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

interface VaSettingsCardProps {
  state: CrlSettingsState;
  limitToCAs?: CA[];
}

export function VaSettingsCard({ state, limitToCAs }: Readonly<VaSettingsCardProps>) {
  const [isSignerModalOpen, setIsSignerModalOpen] = useState(false);
  // Errors only show for fields the user has left, or for all of them after a failed save.
  const [touched, setTouched] = useState({ refreshInterval: false, validity: false, signer: false });
  const { settings, signerDisplay, isSubmitting, isLoading, isReadOnly } = state;
  const caId = settings?.caId;

  useEffect(() => {
    setTouched({ refreshInterval: false, validity: false, signer: false });
  }, [caId]);

  if (!settings) return null;

  const touch = (field: keyof typeof touched) => setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

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
  const allErrors = isReadOnly ? [] : [
    { field: 'refreshInterval' as const, id: 'va-refreshInterval', message: refreshIntervalError },
    { field: 'validity' as const, id: 'va-validity', message: validityError },
    { field: 'signer' as const, id: 'va-crlSigner', message: signerError },
  ].filter((entry): entry is typeof entry & { message: string } => Boolean(entry.message));
  const visibleErrors = allErrors.filter(({ field }) => touched[field]);
  const visibleError = (field: keyof typeof touched) => visibleErrors.find((entry) => entry.field === field)?.message;

  const handleSave = () => {
    if (allErrors.length > 0) {
      setTouched({ refreshInterval: true, validity: true, signer: true });
      // The browser would focus the first invalid field on a failed submit; do the same here.
      const firstInvalid = document.getElementById(allErrors[0].id);
      firstInvalid?.focus();
      return;
    }
    void state.save();
  };

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
          onBlur={() => touch('refreshInterval')}
          error={visibleError('refreshInterval')}
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
          onBlur={() => touch('validity')}
          error={visibleError('validity')}
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
                  onClick={() => {
                    state.clearSigner();
                    touch('signer');
                  }}
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
              aria-invalid={!!visibleError('signer')}
              aria-describedby={visibleError('signer') ? 'va-crl-signer-error' : undefined}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Select CRL Signer Certificate...'
              )}
            </Button>
          )}
          {visibleError('signer') && <FormFieldError id="va-crl-signer-error" title={visibleError('signer')!} />}
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
          onOpenChange={(open) => {
            setIsSignerModalOpen(open);
            if (!open) touch('signer');
          }}
          title="Select CRL Signer Certificate"
          description="Choose the certificate whose public key will be used for the SubjectKeyIdentifier in the CRLs of this CA."
          onCertificateSelected={handleSignerSelected}
          currentSelectedCertificateId={settings.signerSerialNumber}
          limitToCAs={limitToCAs}
          requirePrivateKey
          requiredKeyUsages={['CRLSign']}
          includeCaCertificates
        />

        <FormValidationSummary errors={visibleErrors.map(({ message }) => message)} />
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={disabled}>
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

const CRL_SETTINGS_STATUS_BADGES: Record<CrlSettingsStatus, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  FINAL: { label: 'Final', variant: 'warning' },
  ARCHIVED: { label: 'Archived', variant: 'muted' },
};

/** Status of CRL settings: `ACTIVE`, `FINAL` (revoked or expired CA) or `ARCHIVED` (deleted CA). */
export function CrlSettingsStatusBadge({ status }: Readonly<{ status: CrlSettingsStatus }>) {
  const badge = CRL_SETTINGS_STATUS_BADGES[status];
  if (!badge) return <Badge variant="muted">{status}</Badge>;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

/** Shown for CRL settings that are not `ACTIVE`, which cannot be edited. */
export function InactiveCrlSettingsAlert({ status, className }: Readonly<{ status: CrlSettingsStatus; className?: string }>) {
  const isFinal = status === 'FINAL';
  return (
    <Alert variant="warning" className={className}>
      <Archive className="h-4 w-4" />
      <AlertTitle>{isFinal ? 'Final CRL Settings' : 'Archived CRL Settings'}</AlertTitle>
      <AlertDescription>
        {isFinal
          ? 'The CA these settings belong to was revoked or has expired. Its final CRL, if any, has been published and no new CRL is generated, so the settings cannot be edited.'
          : 'These settings belong to a CA that no longer exists. Its last CRL is still served, but it is never regenerated and the settings cannot be edited.'}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Shown for CRL settings migrated from the SKI-keyed model: certificates issued back then point
 * their CDP at `/crl/<ski>`, which keeps resolving to the CRL of this CA.
 */
export function LegacyCrlUrlNote({ legacySki }: Readonly<{ legacySki: string | null }>) {
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
