
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PackageCheck, AlertTriangle, PlusCircle, X, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { DurationInput } from '@/components/shared/DurationInput';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { SettingsCard } from './SettingsCard';

interface ESTReEnrollmentSettingsCardProps {
  authMode: string;
  setAuthMode: (v: string) => void;
  webhookName: string;
  setWebhookName: (v: string) => void;
  webhookUrl: string;
  setWebhookUrl: (v: string) => void;
  webhookLogLevel: string;
  setWebhookLogLevel: (v: string) => void;
  webhookAuthMode: string;
  setWebhookAuthMode: (v: string) => void;
  webhookApiKey: string;
  setWebhookApiKey: (v: string) => void;
  oidcClientId: string;
  setOidcClientId: (v: string) => void;
  oidcClientSecret: string;
  setOidcClientSecret: (v: string) => void;
  oidcWellKnownUrl: string;
  setOidcWellKnownUrl: (v: string) => void;
  revokeOnReEnroll: boolean;
  setRevokeOnReEnroll: (v: boolean) => void;
  allowExpiredRenewal: boolean;
  setAllowExpiredRenewal: (v: boolean) => void;
  allowedRenewalDelta: string;
  setAllowedRenewalDelta: (v: string) => void;
  preventiveRenewalDelta: string;
  setPreventiveRenewalDelta: (v: string) => void;
  criticalRenewalDelta: string;
  setCriticalRenewalDelta: (v: string) => void;
  additionalValidationCAs: CA[];
  onRemoveAdditionalValidationCa: (id: string) => void;
  onAddAdditionalValidationCa: () => void;
  allCryptoEngines: ApiCryptoEngine[];
}

export function ESTReEnrollmentSettingsCard({
  authMode,
  setAuthMode,
  webhookName,
  setWebhookName,
  webhookUrl,
  setWebhookUrl,
  webhookLogLevel,
  setWebhookLogLevel,
  webhookAuthMode,
  setWebhookAuthMode,
  webhookApiKey,
  setWebhookApiKey,
  oidcClientId,
  setOidcClientId,
  oidcClientSecret,
  setOidcClientSecret,
  oidcWellKnownUrl,
  setOidcWellKnownUrl,
  revokeOnReEnroll,
  setRevokeOnReEnroll,
  allowExpiredRenewal,
  setAllowExpiredRenewal,
  allowedRenewalDelta,
  setAllowedRenewalDelta,
  preventiveRenewalDelta,
  setPreventiveRenewalDelta,
  criticalRenewalDelta,
  setCriticalRenewalDelta,
  additionalValidationCAs,
  onRemoveAdditionalValidationCa,
  onAddAdditionalValidationCa,
  allCryptoEngines,
}: ESTReEnrollmentSettingsCardProps) {
  return (
    <SettingsCard
      icon={PackageCheck}
      title="Re-Enrollment Settings"
      description="Set certificate replacement, renewal windows, and additional trust requirements for re-enrollment."
    >
      <div className="space-y-4 pt-2 border-t first:border-t-0 first:pt-0">
        <h4 className="font-medium text-sm text-muted-foreground pt-2 first:pt-0">Authentication</h4>
        <div>
          <Label htmlFor="reenrollAuthMode" className="flex items-center">
            Authentication Mode
            <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-xs"><p>Governs re-enrollment requests independently from the initial enrollment auth mode above. <strong>Client Certificate</strong> validates the presented certificate against the enrollment CA and the Additional Validation CAs below. Leaving this unconfigured is rejected — it is not treated as No Auth.</p></TooltipContent></Tooltip></TooltipProvider>
          </Label>
          <Select value={authMode} onValueChange={setAuthMode}>
            <SelectTrigger id="reenrollAuthMode" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Client Certificate">Client Certificate</SelectItem>
              <SelectItem value="External Webhook">External Webhook</SelectItem>
              <SelectItem value="No Auth">No Auth</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {authMode === 'External Webhook' && (
          <div className="space-y-4 pt-2 border-t">
            <h5 className="font-medium text-sm text-muted-foreground pt-2">Webhook Settings</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reenrollWebhookName">Webhook Name</Label>
                <Input id="reenrollWebhookName" value={webhookName} onChange={(e) => setWebhookName(e.target.value)} placeholder="e.g., MyValidationFunc" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="reenrollWebhookUrl">Webhook URL</Label>
                <Input id="reenrollWebhookUrl" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="http://localhost:8080/verify" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reenrollWebhookLogLevel">Webhook Log Level</Label>
                <Select value={webhookLogLevel} onValueChange={setWebhookLogLevel}>
                  <SelectTrigger id="reenrollWebhookLogLevel" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Info">Info</SelectItem>
                    <SelectItem value="Debug">Debug</SelectItem>
                    <SelectItem value="Warn">Warn</SelectItem>
                    <SelectItem value="Error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="reenrollWebhookAuthMode">Webhook Auth Mode</Label>
                <Select value={webhookAuthMode} onValueChange={setWebhookAuthMode}>
                  <SelectTrigger id="reenrollWebhookAuthMode" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="No Auth">No Auth</SelectItem>
                    <SelectItem value="OIDC">OIDC</SelectItem>
                    <SelectItem value="API Key">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {webhookAuthMode === 'API Key' && (
              <div>
                <Label htmlFor="reenrollWebhookApiKey">API Key</Label>
                <Input id="reenrollWebhookApiKey" type="password" value={webhookApiKey} onChange={e => setWebhookApiKey(e.target.value)} placeholder="Enter API Key" className="mt-1" />
              </div>
            )}
            {webhookAuthMode === 'OIDC' && (
              <div className="space-y-4 pt-2 border-t">
                <h5 className="font-medium text-sm text-muted-foreground pt-2">OIDC Settings</h5>
                <div>
                  <Label htmlFor="reenrollOidcClientId">OIDC Client ID</Label>
                  <Input id="reenrollOidcClientId" value={oidcClientId} onChange={e => setOidcClientId(e.target.value)} placeholder="Enter OIDC Client ID" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="reenrollOidcClientSecret">OIDC Client Secret</Label>
                  <Input id="reenrollOidcClientSecret" type="password" value={oidcClientSecret} onChange={e => setOidcClientSecret(e.target.value)} placeholder="Enter OIDC Client Secret" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="reenrollOidcWellKnownUrl">OIDC Well Known URL</Label>
                  <Input id="reenrollOidcWellKnownUrl" value={oidcWellKnownUrl} onChange={e => setOidcWellKnownUrl(e.target.value)} placeholder="https://your-issuer.com/.well-known/openid-configuration" className="mt-1" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="revokeOnReEnroll" className="flex items-center">
            <PackageCheck className="mr-2 h-4 w-4 text-muted-foreground" />
            Revoke On Re-Enroll
          </Label>
          <p className="text-sm text-muted-foreground">
            Automatically revoke the old certificate when a new one is issued during re-enrollment.
          </p>
        </div>
        <Switch id="revokeOnReEnroll" checked={revokeOnReEnroll} onCheckedChange={setRevokeOnReEnroll} />
      </div>
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="allowExpiredRenewal" className="flex items-center">
            <AlertTriangle className="mr-2 h-4 w-4 text-muted-foreground" />
            Allow Expired Renewal
          </Label>
          <p className="text-sm text-muted-foreground">
            Permit renewal of certificates that have already expired.
          </p>
        </div>
        <Switch id="allowExpiredRenewal" checked={allowExpiredRenewal} onCheckedChange={setAllowExpiredRenewal} />
      </div>
      <DurationInput id="allowedRenewalDelta" label="Allowed Renewal Delta" value={allowedRenewalDelta} onChange={setAllowedRenewalDelta} placeholder="e.g., 100d" description="Max time after expiry a cert can be renewed."/>
      <DurationInput id="preventiveRenewalDelta" label="Preventive Renewal Delta" value={preventiveRenewalDelta} onChange={setPreventiveRenewalDelta} placeholder="e.g., 31d" description="Time before expiry to start allowing renewals."/>
      <DurationInput id="criticalRenewalDelta" label="Critical Renewal Delta" value={criticalRenewalDelta} onChange={setCriticalRenewalDelta} placeholder="e.g., 7d" description="Time before expiry when renewal is critical."/>
      <div>
        <Label htmlFor="additionalValidationCAs">Additional Validation CAs (for re-enrollment)</Label>
        <div className="mt-2 space-y-2">
          {additionalValidationCAs.length > 0 ? (
            additionalValidationCAs.map(ca => (
              <div key={ca.id} className="flex items-center gap-2 group">
                <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => onRemoveAdditionalValidationCa(ca.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic text-center p-2">No additional validation CAs selected.</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddAdditionalValidationCa} className="mt-2">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Additional Validation CA
        </Button>
      </div>
    </SettingsCard>
  );
}
