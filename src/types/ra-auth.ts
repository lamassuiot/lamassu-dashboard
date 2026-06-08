export type UiRaAuthMode = 'Client Certificate' | 'External Webhook' | 'Client Certificate + Webhook' | 'No Auth';

export type UiWebhookAuthMode = 'No Auth' | 'OIDC' | 'API Key';

export interface RaAuthFormValues {
  authMode: UiRaAuthMode;
  validationCaIds: string[];
  allowExpiredAuth: boolean;
  chainValidationLevel: number;
  webhookName: string;
  webhookUrl: string;
  webhookMethod: 'POST' | 'PUT';
  webhookValidateServerCert: boolean;
  webhookLogLevel: 'Info' | 'Debug' | 'Warn' | 'Error';
  webhookAuthMode: UiWebhookAuthMode;
  webhookApiKey: string;
  webhookApiKeyHeader: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcWellKnownUrl: string;
}
