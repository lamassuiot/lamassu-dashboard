'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, PlusCircle, X } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { ApiRaEstSettings } from '@/lib/dms-api';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { DurationInput } from '@/components/shared/DurationInput';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
      validate_server_cert: true,
      log_level: 'info',
      auth_mode: 'noauth' as const,
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
  const webhookUrlError = includesWebhook && !webhook.url.trim() ? 'Webhook URL is required.' : null;
  const apiKeyError = includesWebhook && webhookConfig.auth_mode === 'apikey' && !webhookConfig.apikey?.key
    ? 'Webhook API key is required.'
    : null;
  const apiKeyHeaderError = includesWebhook && webhookConfig.auth_mode === 'apikey' && !webhookConfig.apikey?.header
    ? 'Webhook API key header is required.'
    : null;
  const oidcClientIdError = includesWebhook && webhookConfig.auth_mode === 'jwt' && !webhookConfig.oidc?.client_id
    ? 'OIDC client ID is required.'
    : null;
  const oidcClientSecretError = includesWebhook && webhookConfig.auth_mode === 'jwt' && !webhookConfig.oidc?.client_secret
    ? 'OIDC client secret is required.'
    : null;
  const oidcWellKnownError = includesWebhook && webhookConfig.auth_mode === 'jwt' && !webhookConfig.oidc?.well_known
    ? 'OIDC well-known URL is required.'
    : null;
  const mtlsCertError = includesWebhook && webhookConfig.auth_mode === 'mtls' && !webhookConfig.mtls?.cert
    ? 'mTLS client certificate is required.'
    : null;
  const mtlsKeyError = includesWebhook && webhookConfig.auth_mode === 'mtls' && !webhookConfig.mtls?.key
    ? 'mTLS client private key is required.'
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-auth-mode`}>Authentication Mode</Label>
        <Select
          value={value.auth_mode}
          onValueChange={(authMode: ApiRaEstSettings['auth_mode']) => onChange({ ...value, auth_mode: authMode })}
        >
          <SelectTrigger id={`${idPrefix}-auth-mode`}><SelectValue /></SelectTrigger>
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
                <SelectTrigger id={`${idPrefix}-webhook-method`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-webhook-log-level`}>Log Level</Label>
              <Select value={webhookConfig.log_level || 'info'} onValueChange={(logLevel) => updateWebhookConfig({ log_level: logLevel })}>
                <SelectTrigger id={`${idPrefix}-webhook-log-level`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DurationInput
            id={`${idPrefix}-webhook-timeout`}
            label="Call Timeout"
            value={webhookConfig.call_timeout || '10s'}
            onChange={(callTimeout) => updateWebhookConfig({ call_timeout: callTimeout })}
            placeholder="e.g., 10s"
            description="Maximum time to wait for the webhook response."
            error={timeoutError || undefined}
          />
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor={`${idPrefix}-validate-server-cert`}>Validate Server Certificate</Label>
              <p className="mt-1 text-xs text-muted-foreground">Verify the TLS certificate presented by the webhook endpoint.</p>
            </div>
            <Switch
              id={`${idPrefix}-validate-server-cert`}
              checked={webhookConfig.validate_server_cert}
              onCheckedChange={(checked) => updateWebhookConfig({ validate_server_cert: checked })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-webhook-auth-mode`}>HTTP Authentication</Label>
            <Select
              value={webhookConfig.auth_mode}
              onValueChange={(authMode: typeof webhookConfig.auth_mode) => updateWebhookConfig({ auth_mode: authMode })}
            >
              <SelectTrigger id={`${idPrefix}-webhook-auth-mode`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="noauth">No Authentication</SelectItem>
                <SelectItem value="jwt">OIDC Client Credentials</SelectItem>
                <SelectItem value="apikey">API Key</SelectItem>
                <SelectItem value="mtls">Mutual TLS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {webhookConfig.auth_mode === 'apikey' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-api-key`}>API Key</Label>
                <Input
                  id={`${idPrefix}-api-key`}
                  type="password"
                  value={webhookConfig.apikey?.key || ''}
                  onChange={(event) => updateWebhookConfig({
                    apikey: { key: event.target.value, header: webhookConfig.apikey?.header || 'X-API-Key' },
                  })}
                  aria-invalid={!!apiKeyError}
                  aria-describedby={apiKeyError ? `${idPrefix}-api-key-error` : undefined}
                />
                {apiKeyError && <FormFieldError id={`${idPrefix}-api-key-error`} title={apiKeyError} />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-api-key-header`}>Header Name</Label>
                <Input
                  id={`${idPrefix}-api-key-header`}
                  value={webhookConfig.apikey?.header || 'X-API-Key'}
                  onChange={(event) => updateWebhookConfig({
                    apikey: { key: webhookConfig.apikey?.key || '', header: event.target.value },
                  })}
                  aria-invalid={!!apiKeyHeaderError}
                  aria-describedby={apiKeyHeaderError ? `${idPrefix}-api-key-header-error` : undefined}
                />
                {apiKeyHeaderError && <FormFieldError id={`${idPrefix}-api-key-header-error`} title={apiKeyHeaderError} />}
              </div>
            </div>
          ) : null}

          {webhookConfig.auth_mode === 'jwt' ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-oidc-client-id`}>Client ID</Label>
                  <Input
                    id={`${idPrefix}-oidc-client-id`}
                    value={webhookConfig.oidc?.client_id || ''}
                    onChange={(event) => updateWebhookConfig({
                      oidc: {
                        client_id: event.target.value,
                        client_secret: webhookConfig.oidc?.client_secret || '',
                        well_known: webhookConfig.oidc?.well_known || '',
                      },
                    })}
                    aria-invalid={!!oidcClientIdError}
                    aria-describedby={oidcClientIdError ? `${idPrefix}-oidc-client-id-error` : undefined}
                  />
                  {oidcClientIdError && <FormFieldError id={`${idPrefix}-oidc-client-id-error`} title={oidcClientIdError} />}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-oidc-client-secret`}>Client Secret</Label>
                  <Input
                    id={`${idPrefix}-oidc-client-secret`}
                    type="password"
                    value={webhookConfig.oidc?.client_secret || ''}
                    onChange={(event) => updateWebhookConfig({
                      oidc: {
                        client_id: webhookConfig.oidc?.client_id || '',
                        client_secret: event.target.value,
                        well_known: webhookConfig.oidc?.well_known || '',
                      },
                    })}
                    aria-invalid={!!oidcClientSecretError}
                    aria-describedby={oidcClientSecretError ? `${idPrefix}-oidc-client-secret-error` : undefined}
                  />
                  {oidcClientSecretError && <FormFieldError id={`${idPrefix}-oidc-client-secret-error`} title={oidcClientSecretError} />}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-oidc-well-known`}>Well-Known URL</Label>
                <Input
                  id={`${idPrefix}-oidc-well-known`}
                  type="url"
                  value={webhookConfig.oidc?.well_known || ''}
                  onChange={(event) => updateWebhookConfig({
                    oidc: {
                      client_id: webhookConfig.oidc?.client_id || '',
                      client_secret: webhookConfig.oidc?.client_secret || '',
                      well_known: event.target.value,
                    },
                  })}
                  placeholder="https://issuer.example.com/.well-known/openid-configuration"
                  aria-invalid={!!oidcWellKnownError}
                  aria-describedby={oidcWellKnownError ? `${idPrefix}-oidc-well-known-error` : undefined}
                />
                {oidcWellKnownError && <FormFieldError id={`${idPrefix}-oidc-well-known-error`} title={oidcWellKnownError} />}
              </div>
            </div>
          ) : null}

          {webhookConfig.auth_mode === 'mtls' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-mtls-cert`}>Client Certificate</Label>
                <Textarea
                  id={`${idPrefix}-mtls-cert`}
                  value={webhookConfig.mtls?.cert || ''}
                  onChange={(event) => updateWebhookConfig({
                    mtls: { cert: event.target.value, key: webhookConfig.mtls?.key || '' },
                  })}
                  placeholder="PEM certificate or backend-accessible path"
                  className="min-h-32 font-mono text-xs"
                  aria-invalid={!!mtlsCertError}
                  aria-describedby={mtlsCertError ? `${idPrefix}-mtls-cert-error` : undefined}
                />
                {mtlsCertError && <FormFieldError id={`${idPrefix}-mtls-cert-error`} title={mtlsCertError} />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-mtls-key`}>Client Private Key</Label>
                <Textarea
                  id={`${idPrefix}-mtls-key`}
                  value={webhookConfig.mtls?.key || ''}
                  onChange={(event) => updateWebhookConfig({
                    mtls: { cert: webhookConfig.mtls?.cert || '', key: event.target.value },
                  })}
                  placeholder="PEM private key or backend-accessible path"
                  className="min-h-32 font-mono text-xs"
                  aria-invalid={!!mtlsKeyError}
                  aria-describedby={mtlsKeyError ? `${idPrefix}-mtls-key-error` : undefined}
                />
                {mtlsKeyError && <FormFieldError id={`${idPrefix}-mtls-key-error`} title={mtlsKeyError} />}
              </div>
            </div>
          ) : null}
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
