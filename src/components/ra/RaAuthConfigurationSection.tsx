import React from 'react';
import { HelpCircle, PlusCircle, Server, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { RaAuthFormValues, UiRaAuthMode, UiWebhookAuthMode } from '@/types/ra-auth';

type RaAuthConfigField = keyof RaAuthFormValues;

interface RaAuthConfigurationSectionProps {
  inputIdPrefix: string;
  authModeLabel: string;
  clientCertTitle: string;
  webhookTitle: string;
  values: RaAuthFormValues;
  validationCAs: CA[];
  allCryptoEngines: ApiCryptoEngine[];
  onValuesChange: (patch: Partial<RaAuthFormValues>) => void;
  onAddValidationCaClick: () => void;
  onRemoveValidationCa: (caId: string) => void;
}

const authModeOptions: UiRaAuthMode[] = [
  'Client Certificate',
  'External Webhook',
  'Client Certificate + Webhook',
  'No Auth',
];

const webhookAuthModeOptions: UiWebhookAuthMode[] = ['No Auth', 'OIDC', 'API Key'];

export function RaAuthConfigurationSection({
  inputIdPrefix,
  authModeLabel,
  clientCertTitle,
  webhookTitle,
  values,
  validationCAs,
  allCryptoEngines,
  onValuesChange,
  onAddValidationCaClick,
  onRemoveValidationCa,
}: Readonly<RaAuthConfigurationSectionProps>) {
  const setField = <T extends RaAuthConfigField>(field: T, value: RaAuthFormValues[T]) => {
    onValuesChange({ [field]: value });
  };

  const usesClientCert = values.authMode === 'Client Certificate' || values.authMode === 'Client Certificate + Webhook';
  const usesWebhook = values.authMode === 'External Webhook' || values.authMode === 'Client Certificate + Webhook';

  return (
    <>
      <div>
        <Label htmlFor={`${inputIdPrefix}-auth-mode`}>{authModeLabel}</Label>
        <Select value={values.authMode} onValueChange={(mode: UiRaAuthMode) => setField('authMode', mode)}>
          <SelectTrigger id={`${inputIdPrefix}-auth-mode`} className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {authModeOptions.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {usesClientCert && (
        <div className="space-y-4 pt-2 border-t mt-4">
          <h4 className="font-medium text-md text-muted-foreground pt-2">{clientCertTitle}</h4>
          <div>
            <Label htmlFor={`${inputIdPrefix}-validation-cas`}>Validation CAs</Label>
            <div className="mt-2 space-y-2" id={`${inputIdPrefix}-validation-cas`}>
              {validationCAs.length > 0 ? (
                validationCAs.map((ca) => (
                  <div key={ca.id} className="flex items-center gap-2 group">
                    <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => onRemoveValidationCa(ca.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic text-center p-2">No validation CAs selected.</p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onAddValidationCaClick} className="mt-2">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Validation CA
            </Button>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <Switch id={`${inputIdPrefix}-allow-expired-auth`} checked={values.allowExpiredAuth} onCheckedChange={(checked) => setField('allowExpiredAuth', checked)} />
            <Label htmlFor={`${inputIdPrefix}-allow-expired-auth`}>Allow Authenticating Expired Certificates</Label>
          </div>
          <div>
            <Label htmlFor={`${inputIdPrefix}-chain-validation-level`} className="flex items-center">
              Chain Validation Level
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger>
                  <TooltipContent><p>-1 equals full chain validation.</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input id={`${inputIdPrefix}-chain-validation-level`} type="number" value={values.chainValidationLevel} onChange={(e) => setField('chainValidationLevel', Number.parseInt(e.target.value, 10))} className="mt-1" />
          </div>
        </div>
      )}

      {usesWebhook && (
        <div className="space-y-4 pt-2 border-t mt-4">
          <h4 className="font-medium text-md text-muted-foreground pt-2">{webhookTitle}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`${inputIdPrefix}-webhook-name`}>Webhook Name</Label>
              <Input id={`${inputIdPrefix}-webhook-name`} value={values.webhookName} onChange={(e) => setField('webhookName', e.target.value)} placeholder="e.g., ValidationWebhook" className="mt-1" />
            </div>
            <div>
              <Label htmlFor={`${inputIdPrefix}-webhook-url`}>Webhook URL</Label>
              <Input id={`${inputIdPrefix}-webhook-url`} value={values.webhookUrl} onChange={(e) => setField('webhookUrl', e.target.value)} placeholder="http://localhost:8080/verify" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`${inputIdPrefix}-webhook-method`}>HTTP Method</Label>
              <Select value={values.webhookMethod} onValueChange={(v: 'POST' | 'PUT') => setField('webhookMethod', v)}>
                <SelectTrigger id={`${inputIdPrefix}-webhook-method`} className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${inputIdPrefix}-webhook-log-level`}>Log Level</Label>
              <Select value={values.webhookLogLevel} onValueChange={(v: 'Info' | 'Debug' | 'Warn' | 'Error') => setField('webhookLogLevel', v)}>
                <SelectTrigger id={`${inputIdPrefix}-webhook-log-level`} className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Info">Info</SelectItem>
                  <SelectItem value="Debug">Debug</SelectItem>
                  <SelectItem value="Warn">Warn</SelectItem>
                  <SelectItem value="Error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
            <div className="space-y-0.5">
              <Label htmlFor={`${inputIdPrefix}-webhook-validate-server-cert`} className="flex items-center">
                <Server className="mr-2 h-4 w-4 text-muted-foreground" />
                Validate Server Certificate
              </Label>
              <p className="text-sm text-muted-foreground">Verify the TLS certificate of the webhook endpoint.</p>
            </div>
            <Switch id={`${inputIdPrefix}-webhook-validate-server-cert`} checked={values.webhookValidateServerCert} onCheckedChange={(checked) => setField('webhookValidateServerCert', checked)} />
          </div>
          <div>
            <Label htmlFor={`${inputIdPrefix}-webhook-auth-mode`}>Auth Mode</Label>
            <Select value={values.webhookAuthMode} onValueChange={(v: UiWebhookAuthMode) => setField('webhookAuthMode', v)}>
              <SelectTrigger id={`${inputIdPrefix}-webhook-auth-mode`} className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {webhookAuthModeOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {values.webhookAuthMode === 'API Key' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`${inputIdPrefix}-webhook-api-key`}>API Key</Label>
                <Input id={`${inputIdPrefix}-webhook-api-key`} type="password" value={values.webhookApiKey} onChange={(e) => setField('webhookApiKey', e.target.value)} placeholder="Enter API Key" className="mt-1" />
              </div>
              <div>
                <Label htmlFor={`${inputIdPrefix}-webhook-api-key-header`}>Header Name</Label>
                <Input id={`${inputIdPrefix}-webhook-api-key-header`} value={values.webhookApiKeyHeader} onChange={(e) => setField('webhookApiKeyHeader', e.target.value)} placeholder="X-API-Key" className="mt-1" />
              </div>
            </div>
          )}

          {values.webhookAuthMode === 'OIDC' && (
            <div className="space-y-4 pt-2 border-t mt-4">
              <h5 className="font-medium text-sm text-muted-foreground pt-2">OIDC Settings</h5>
              <div>
                <Label htmlFor={`${inputIdPrefix}-oidc-client-id`}>Client ID</Label>
                <Input id={`${inputIdPrefix}-oidc-client-id`} value={values.oidcClientId} onChange={(e) => setField('oidcClientId', e.target.value)} placeholder="Enter OIDC Client ID" className="mt-1" />
              </div>
              <div>
                <Label htmlFor={`${inputIdPrefix}-oidc-client-secret`}>Client Secret</Label>
                <Input id={`${inputIdPrefix}-oidc-client-secret`} type="password" value={values.oidcClientSecret} onChange={(e) => setField('oidcClientSecret', e.target.value)} placeholder="Enter OIDC Client Secret" className="mt-1" />
              </div>
              <div>
                <Label htmlFor={`${inputIdPrefix}-oidc-well-known-url`}>Well-Known URL</Label>
                <Input id={`${inputIdPrefix}-oidc-well-known-url`} value={values.oidcWellKnownUrl} onChange={(e) => setField('oidcWellKnownUrl', e.target.value)} placeholder="https://your-issuer.com/.well-known/openid-configuration" className="mt-1" />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
