'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, PlusCircle, X } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { ApiRaEstSettings } from '@/lib/dms-api';
import { getWebhookAuthOptionErrors, getWebhookUrlError } from '@/lib/webhook-config';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { WebhookHttpClientFields } from '@/components/shared/WebhookHttpClientFields';
import { FormFieldError } from '@/components/shared/FormValidationSummary';

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
  validationCaWarning?: string | null;
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
  validationCaWarning,
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

  const validationCAs = useMemo(
    () => clientSettings.validation_cas
      .map((id) => availableCAs.find((ca) => ca.id === id))
      .filter((ca): ca is CA => !!ca),
    [availableCAs, clientSettings.validation_cas],
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

  const includesClientCertificate = value.auth_mode === 'CLIENT_CERTIFICATE'
    || value.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
  const includesWebhook = value.auth_mode === 'EXTERNAL_WEBHOOK'
    || value.auth_mode === 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK';
  const validationCaError = validationErrors.find((error) => error.includes('validation CA')) || null;
  const webhookNameError = includesWebhook && !webhook.name.trim() ? 'Webhook name is required.' : null;
  const webhookUrlError = includesWebhook ? getWebhookUrlError(webhook.url) : null;
  const webhookConfigErrors = includesWebhook ? getWebhookAuthOptionErrors(webhookConfig) : [];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-auth-mode`}>Authentication Mode</Label>
        <Select
          value={value.auth_mode}
          onValueChange={(authMode: ApiRaEstSettings['auth_mode']) => onChange({ ...value, auth_mode: authMode })}
        >
          <SelectTrigger id={`${idPrefix}-auth-mode`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CLIENT_CERTIFICATE">Client Certificate</SelectItem>
            <SelectItem value="EXTERNAL_WEBHOOK">External Webhook</SelectItem>
            <SelectItem value="CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK">Client Certificate + Webhook</SelectItem>
            <SelectItem value="NO_AUTH">No Authentication</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {includesClientCertificate ? (
        <div className="space-y-4 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">Client certificate</p>
            <p className="mt-1 text-xs text-muted-foreground">Configure certificate trust and chain validation for this EST operation.</p>
          </div>
          <div className="space-y-2">
            <Label>Validation CAs</Label>
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
            )) : <p className="text-sm text-muted-foreground">No validation CAs selected.</p>}
            <Button type="button" variant="outline" onClick={() => setIsCaSelectorOpen(true)} aria-invalid={!!validationCaError} aria-describedby={validationCaError ? `${idPrefix}-validation-ca-error` : undefined}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Validation CA
            </Button>
            {validationCaError && <FormFieldError id={`${idPrefix}-validation-ca-error`} title="Validation CA required." description="Select at least one for client certificate authentication." />}
            {!validationCaError && validationCaWarning ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Enrollment CA not included</AlertTitle>
                <AlertDescription>{validationCaWarning}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor={`${idPrefix}-allow-expired`}>Allow Expired Certificates</Label>
              <p className="mt-1 text-xs text-muted-foreground">Accept an expired certificate during authentication.</p>
            </div>
            <Switch
              id={`${idPrefix}-allow-expired`}
              checked={clientSettings.allow_expired}
              onCheckedChange={(checked) => updateClientSettings({ allow_expired: checked })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-chain-level`}>Chain Validation Level</Label>
            <Input
              id={`${idPrefix}-chain-level`}
              type="number"
              value={clientSettings.chain_level_validation}
              onChange={(event) => updateClientSettings({ chain_level_validation: Number(event.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Use -1 to validate the complete certificate chain.</p>
          </div>
        </div>
      ) : null}

      {includesWebhook ? (
        <div className="space-y-4 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">External webhook</p>
            <p className="mt-1 text-xs text-muted-foreground">Call an external authorization endpoint before issuing the certificate.</p>
          </div>
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
              <Label htmlFor={`${idPrefix}-webhook-method`}>HTTP Method</Label>
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
        </div>
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
