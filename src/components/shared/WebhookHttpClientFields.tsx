'use client';

import React, { useState } from 'react';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DurationInput } from '@/components/shared/DurationInput';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import type { ApiWebhookHttpClient } from '@/lib/dms-api';
import type { WebhookAuthField, WebhookFieldError } from '@/lib/webhook-config';

export const WEBHOOK_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

const DEFAULT_TIMEOUT = '10s';
const DEFAULT_API_KEY_HEADER = 'X-API-Key';

interface WebhookHttpClientFieldsProps {
  idPrefix: string;
  value: ApiWebhookHttpClient;
  onChange: (value: ApiWebhookHttpClient) => void;
  errors?: readonly WebhookFieldError[];
  timeoutError?: string | null;
  url?: string;
  /** Alert channels always verify the server certificate, so they hide the switch. */
  showInsecureSkipVerify?: boolean;
}

/**
 * Shared form for the webhook `http_client` configuration accepted by the
 * backend since lamassuiot#810: log level, call timeout, TLS verification and
 * the per-auth-mode credential options (apikey/jwt/mtls).
 */
export const WebhookHttpClientFields: React.FC<WebhookHttpClientFieldsProps> = ({
  idPrefix,
  value,
  onChange,
  errors = [],
  timeoutError,
  url,
  showInsecureSkipVerify = true,
}) => {
  const [isPrivateKeyVisible, setIsPrivateKeyVisible] = useState(false);
  const patch = (partial: Partial<ApiWebhookHttpClient>) => onChange({ ...value, ...partial });

  const isPlainHttpUrl = (() => {
    try {
      return new URL(url ?? '').protocol === 'http:';
    } catch {
      return false;
    }
  })();

  const fieldError = (field: WebhookAuthField) => errors.find((error) => error.field === field)?.message ?? null;
  const apiKeyValueError = fieldError('apikeyKey');
  const apiKeyHeaderError = fieldError('apikeyHeader');
  const oidcClientIdError = fieldError('oidcClientId');
  const oidcClientSecretError = fieldError('oidcClientSecret');
  const oidcWellKnownError = fieldError('oidcWellKnown');
  const mtlsCertError = fieldError('mtlsCert');
  const mtlsKeyError = fieldError('mtlsKey');
  const privateKey = value.mtls_options?.key_content || '';

  const updateApiKeyOptions = (key: string, header: string) =>
    patch({ apikey_options: { key, header } });

  const updateJwtOptions = (patched: Partial<NonNullable<ApiWebhookHttpClient['jwt_options']>>) =>
    patch({
      jwt_options: {
        oidc_client_id: value.jwt_options?.oidc_client_id || '',
        oidc_client_secret: value.jwt_options?.oidc_client_secret || '',
        oidc_well_known: value.jwt_options?.oidc_well_known || '',
        ...patched,
      },
    });

  const updateMtlsOptions = (patched: Partial<NonNullable<ApiWebhookHttpClient['mtls_options']>>) =>
    patch({
      mtls_options: {
        cert_content: value.mtls_options?.cert_content || '',
        key_content: value.mtls_options?.key_content || '',
        ...patched,
      },
    });

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-log-level`}>Log Level</Label>
          <Select value={value.log_level || 'info'} onValueChange={(logLevel) => patch({ log_level: logLevel })}>
            <SelectTrigger id={`${idPrefix}-log-level`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEBHOOK_LOG_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>{level === 'warn' ? 'Warn' : level.charAt(0).toUpperCase() + level.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <DurationInput
            id={`${idPrefix}-timeout`}
            label="Call Timeout"
            value={value.call_timeout ?? DEFAULT_TIMEOUT}
            onChange={(callTimeout) => patch({ call_timeout: callTimeout })}
            placeholder="e.g., 10s"
            error={timeoutError || undefined}
          />
        </div>
      </div>
      {showInsecureSkipVerify && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor={`${idPrefix}-insecure-skip-verify`}>Skip TLS Verification</Label>
            <p className="mt-1 text-xs text-muted-foreground">Skip TLS verification for this webhook. Credentials are safer with it disabled.</p>
          </div>
          <Switch
            id={`${idPrefix}-insecure-skip-verify`}
            checked={value.insecure_skip_verify}
            onCheckedChange={(checked) => patch({ insecure_skip_verify: checked })}
          />
        </div>
      )}
      {showInsecureSkipVerify && value.insecure_skip_verify && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Skipping TLS verification</AlertTitle>
          <AlertDescription>
            The server certificate is not verified, so the endpoint cannot be authenticated. Only use this for local testing.
          </AlertDescription>
        </Alert>
      )}
      {isPlainHttpUrl && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unencrypted HTTP connection</AlertTitle>
          <AlertDescription>
            The webhook URL uses plain HTTP, so credentials and payloads travel unencrypted. Use an HTTPS URL whenever possible.
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-auth-mode`}>HTTP Authentication</Label>
        <Select
          value={value.auth_mode}
          onValueChange={(authMode) => patch({ auth_mode: authMode as ApiWebhookHttpClient['auth_mode'] })}
        >
          <SelectTrigger id={`${idPrefix}-auth-mode`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="noauth">No Authentication</SelectItem>
            <SelectItem value="jwt">OIDC Client Credentials</SelectItem>
            <SelectItem value="apikey">API Key</SelectItem>
            <SelectItem value="mtls">Mutual TLS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.auth_mode === 'apikey' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-api-key`}>API Key</Label>
            <Input
              id={`${idPrefix}-api-key`}
              type="password"
              value={value.apikey_options?.key || ''}
              onChange={(event) => updateApiKeyOptions(event.target.value, value.apikey_options?.header || DEFAULT_API_KEY_HEADER)}
              aria-invalid={!!apiKeyValueError}
              aria-describedby={apiKeyValueError ? `${idPrefix}-api-key-error` : undefined}
            />
            {apiKeyValueError && <FormFieldError id={`${idPrefix}-api-key-error`} title={apiKeyValueError} />}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-api-key-header`}>Header Name</Label>
            <Input
              id={`${idPrefix}-api-key-header`}
              value={value.apikey_options?.header || DEFAULT_API_KEY_HEADER}
              onChange={(event) => updateApiKeyOptions(value.apikey_options?.key || '', event.target.value)}
              aria-invalid={!!apiKeyHeaderError}
              aria-describedby={apiKeyHeaderError ? `${idPrefix}-api-key-header-error` : undefined}
            />
            {apiKeyHeaderError && <FormFieldError id={`${idPrefix}-api-key-header-error`} title={apiKeyHeaderError} />}
          </div>
        </div>
      ) : null}

      {value.auth_mode === 'jwt' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-oidc-client-id`}>Client ID</Label>
              <Input
                id={`${idPrefix}-oidc-client-id`}
                value={value.jwt_options?.oidc_client_id || ''}
                onChange={(event) => updateJwtOptions({ oidc_client_id: event.target.value })}
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
                value={value.jwt_options?.oidc_client_secret || ''}
                onChange={(event) => updateJwtOptions({ oidc_client_secret: event.target.value })}
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
              value={value.jwt_options?.oidc_well_known || ''}
              onChange={(event) => updateJwtOptions({ oidc_well_known: event.target.value })}
              placeholder="https://issuer.example.com/.well-known/openid-configuration"
              aria-invalid={!!oidcWellKnownError}
              aria-describedby={oidcWellKnownError ? `${idPrefix}-oidc-well-known-error` : undefined}
            />
            {oidcWellKnownError && <FormFieldError id={`${idPrefix}-oidc-well-known-error`} title={oidcWellKnownError} />}
          </div>
        </div>
      ) : null}

      {value.auth_mode === 'mtls' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-mtls-cert`}>Client Certificate</Label>
            <CertificatePemTextarea
              id={`${idPrefix}-mtls-cert`}
              value={value.mtls_options?.cert_content || ''}
              onValueChange={(cert) => updateMtlsOptions({ cert_content: cert })}
              placeholder="PEM certificate (paste or drop a PEM/DER file)"
              className="min-h-32 font-mono text-xs"
              aria-invalid={!!mtlsCertError}
              aria-describedby={mtlsCertError ? `${idPrefix}-mtls-cert-error` : undefined}
            />
            {mtlsCertError && <FormFieldError id={`${idPrefix}-mtls-cert-error`} title={mtlsCertError} />}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${idPrefix}-mtls-key`}>Client Private Key</Label>
              {privateKey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setIsPrivateKeyVisible((visible) => !visible)}
                  aria-controls={`${idPrefix}-mtls-key`}
                >
                  {isPrivateKeyVisible ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                  {isPrivateKeyVisible ? 'Hide' : 'Show'}
                </Button>
              )}
            </div>
            {privateKey && !isPrivateKeyVisible ? (
              // A stored key is not rendered until revealed, like the other secret inputs.
              <div
                id={`${idPrefix}-mtls-key`}
                className="flex min-h-32 items-center justify-center rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground"
                aria-invalid={!!mtlsKeyError}
                aria-describedby={mtlsKeyError ? `${idPrefix}-mtls-key-error` : undefined}
              >
                Private key set and hidden. Select Show to view or replace it.
              </div>
            ) : (
              <Textarea
                id={`${idPrefix}-mtls-key`}
                value={privateKey}
                onChange={(event) => {
                  setIsPrivateKeyVisible(true);
                  updateMtlsOptions({ key_content: event.target.value });
                }}
                placeholder="PEM private key"
                className="min-h-32 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!mtlsKeyError}
                aria-describedby={mtlsKeyError ? `${idPrefix}-mtls-key-error` : undefined}
              />
            )}
            {mtlsKeyError && <FormFieldError id={`${idPrefix}-mtls-key-error`} title={mtlsKeyError} />}
          </div>
        </div>
      ) : null}
    </>
  );
};
