'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Lock, PlusCircle, X } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { ApiRaEstSettings } from '@/lib/dms-api';
import { authModeFor, usesClientCertificate, usesWebhook } from '@/lib/ra-form';
import { getWebhookAuthOptionErrors, getWebhookUrlError } from '@/lib/webhook-config';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WebhookHttpClientFields } from '@/components/shared/WebhookHttpClientFields';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { SettingSwitch, SettingToggleGroup } from '@/components/ra/form/RaFormSection';

type EstAuthSettingsEditorProps = {
  idPrefix: string;
  value: ApiRaEstSettings;
  onChange: (value: ApiRaEstSettings) => void;
  availableCAs: CA[];
  allCryptoEngines: ApiCryptoEngine[];
  isLoadingCAs: boolean;
  errorCAs: string | null;
  loadCAsAction: () => void;
  validationErrors?: readonly string[];
  timeoutError?: string | null;
  /**
   * Re-enrollment always validates against the Enrollment CA before trying the listed CAs.
   * When set, that CA is shown pinned above the list; `null` means none is selected yet.
   */
  implicitEnrollmentCaId?: string | null;
};

export function EstAuthSettingsEditor({
  idPrefix,
  value,
  onChange,
  availableCAs,
  allCryptoEngines,
  isLoadingCAs,
  errorCAs,
  loadCAsAction,
  validationErrors = [],
  timeoutError,
  implicitEnrollmentCaId,
}: EstAuthSettingsEditorProps) {
  const [isCaSelectorOpen, setIsCaSelectorOpen] = useState(false);
  const clientSettings = value.client_certificate_settings || {
    chain_level_validation: -1,
    validation_cas: [],
    allow_expired: false,
  };
  const webhook = value.external_webhook_settings || {
    name: '',
    url: '',
    method: 'POST',
    config: {
      auth_mode: 'noauth' as const,
      log_level: 'info',
      insecure_skip_verify: false,
      call_timeout: '10s',
    },
  };
  const webhookConfig = webhook.config;

  const showsImplicitEnrollmentCa = implicitEnrollmentCaId !== undefined;
  const implicitEnrollmentCa = implicitEnrollmentCaId
    ? availableCAs.find((ca) => ca.id === implicitEnrollmentCaId)
    : undefined;
  // An explicit entry for the Enrollment CA is redundant with the pinned row, so it is not repeated.
  const validationCAs = useMemo(
    () => clientSettings.validation_cas
      .filter((id) => id !== implicitEnrollmentCaId)
      .map((id) => availableCAs.find((ca) => ca.id === id))
      .filter((ca): ca is CA => !!ca),
    [availableCAs, clientSettings.validation_cas, implicitEnrollmentCaId],
  );

  const updateClientSettings = (
    patch: Partial<NonNullable<ApiRaEstSettings['client_certificate_settings']>>,
  ) => {
    onChange({
      ...value,
      client_certificate_settings: { ...clientSettings, ...patch },
    });
  };

  const updateWebhook = (patch: Partial<NonNullable<ApiRaEstSettings['external_webhook_settings']>>) => {
    onChange({
      ...value,
      external_webhook_settings: { ...webhook, ...patch },
    });
  };

  const updateWebhookConfig = (patch: Partial<typeof webhookConfig>) => {
    updateWebhook({ config: { ...webhookConfig, ...patch } });
  };

  const includesClientCertificate = usesClientCertificate(value);
  const includesWebhook = usesWebhook(value);
  const validationCaError = validationErrors.find((error) => error.includes('validation CA')) || null;
  const webhookNameError = includesWebhook && !webhook.name.trim() ? 'Webhook name is required.' : null;
  const webhookUrlError = includesWebhook ? getWebhookUrlError(webhook.url) : null;
  const webhookConfigErrors = includesWebhook ? getWebhookAuthOptionErrors(webhookConfig) : [];

  return (
    <div className="space-y-4">
      <div className="divide-y">
        <SettingToggleGroup
          id={`${idPrefix}-client-certificate`}
          label="Require client certificate"
          description="Devices authenticate with a certificate issued by a trusted CA."
          checked={includesClientCertificate}
          onCheckedChange={(checked) => onChange({ ...value, auth_mode: authModeFor(checked, includesWebhook) })}
        >
          <div className="space-y-2">
            <Label>Validation CAs</Label>
            {showsImplicitEnrollmentCa ? (
              <>
                <p className="text-xs text-muted-foreground">
                  The Enrollment CA is always included. Add other CAs to also accept certificates they issued, such as the previous Enrollment CA during a CA rotation.
                </p>
                <div className="flex items-center gap-2">
                  {implicitEnrollmentCa ? (
                    <CaVisualizerCard ca={implicitEnrollmentCa} allCryptoEngines={allCryptoEngines} className="flex-1 shadow-none" />
                  ) : (
                    <div className="flex-1 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      {implicitEnrollmentCaId ? `Enrollment CA "${implicitEnrollmentCaId}"` : 'Enrollment CA (not selected yet)'}
                    </div>
                  )}
                  <Badge variant="muted" title="The Enrollment CA is always used to validate re-enrollment requests.">
                    <Lock /> Always included
                  </Badge>
                </div>
              </>
            ) : null}
            {validationCAs.length ? validationCAs.map((ca) => (
              <div key={ca.id} className="flex items-center gap-2">
                <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-1 shadow-none" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${ca.name}`}
                  onClick={() => updateClientSettings({
                    validation_cas: clientSettings.validation_cas.filter((id) => id !== ca.id),
                  })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">
                {showsImplicitEnrollmentCa ? 'No additional validation CAs.' : 'No validation CAs selected.'}
              </p>
            )}
            <Button type="button" variant="outline" onClick={() => setIsCaSelectorOpen(true)} aria-invalid={!!validationCaError} aria-describedby={validationCaError ? `${idPrefix}-validation-ca-error` : undefined}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add validation CA
            </Button>
            {validationCaError && <FormFieldError id={`${idPrefix}-validation-ca-error`} title="Validation CA required." description="Select at least one for client certificate authentication." />}
          </div>
          <SettingSwitch
            id={`${idPrefix}-allow-expired`}
            label="Allow expired certificates"
            description="Accept an expired certificate during authentication."
            checked={clientSettings.allow_expired}
            onCheckedChange={(checked) => updateClientSettings({ allow_expired: checked })}
          />
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-chain-level`}>Chain validation level</Label>
            <Input
              id={`${idPrefix}-chain-level`}
              type="number"
              className="max-w-40"
              value={clientSettings.chain_level_validation}
              onChange={(event) => updateClientSettings({ chain_level_validation: Number(event.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Use -1 to validate the complete certificate chain.</p>
          </div>
        </SettingToggleGroup>

        <SettingToggleGroup
          id={`${idPrefix}-webhook`}
          label="Call external webhook"
          description="An external endpoint must approve each request before the certificate is issued."
          checked={includesWebhook}
          onCheckedChange={(checked) => onChange({ ...value, auth_mode: authModeFor(includesClientCertificate, checked) })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-webhook-name`}>Name</Label>
              <Input
                id={`${idPrefix}-webhook-name`}
                value={webhook.name}
                onChange={(event) => updateWebhook({ name: event.target.value })}
                placeholder="Device authorization"
                aria-invalid={!!webhookNameError}
                aria-describedby={webhookNameError ? `${idPrefix}-webhook-name-error` : undefined}
              />
              {webhookNameError && <FormFieldError id={`${idPrefix}-webhook-name-error`} title={webhookNameError} />}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-webhook-url`}>URL</Label>
              <Input
                id={`${idPrefix}-webhook-url`}
                type="url"
                value={webhook.url}
                onChange={(event) => updateWebhook({ url: event.target.value })}
                placeholder="https://example.com/authorize"
                aria-invalid={!!webhookUrlError}
                aria-describedby={webhookUrlError ? `${idPrefix}-webhook-url-error` : undefined}
              />
              {webhookUrlError && <FormFieldError id={`${idPrefix}-webhook-url-error`} title={webhookUrlError} />}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-webhook-method`}>HTTP method</Label>
              <Select value={webhook.method || 'POST'} onValueChange={(method) => updateWebhook({ method })}>
                <SelectTrigger id={`${idPrefix}-webhook-method`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <WebhookHttpClientFields
            idPrefix={`${idPrefix}-webhook`}
            value={webhookConfig}
            onChange={updateWebhookConfig}
            errors={webhookConfigErrors}
            timeoutError={timeoutError}
            url={webhook.url}
          />
        </SettingToggleGroup>
      </div>

      {value.auth_mode === 'NO_AUTH' ? (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>No authentication: any device can request a certificate.</span>
        </p>
      ) : null}
      {value.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK' ? (
        <p className="text-xs text-muted-foreground">Both checks must pass.</p>
      ) : null}

      <CaSelectorModal
        isOpen={isCaSelectorOpen}
        onOpenChange={setIsCaSelectorOpen}
        title="Add Validation CA"
        description="Select a CA trusted for client certificate authentication."
        availableCAs={availableCAs}
        isLoadingCAs={isLoadingCAs}
        errorCAs={errorCAs}
        loadCAsAction={loadCAsAction}
        onCaSelected={(ca) => {
          if (!clientSettings.validation_cas.includes(ca.id)) {
            updateClientSettings({ validation_cas: [...clientSettings.validation_cas, ca.id] });
          }
          setIsCaSelectorOpen(false);
        }}
        allCryptoEngines={allCryptoEngines}
      />
    </div>
  );
}
