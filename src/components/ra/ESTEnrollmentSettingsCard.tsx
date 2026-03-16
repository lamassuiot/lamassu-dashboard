
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Globe, Settings, PackageCheck, PlusCircle, X, HelpCircle, Loader2 } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import type { CA } from '@/lib/ca-data';
import type { ApiSigningProfile } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Key } from "lucide-react";
import { SettingsCard } from './SettingsCard';

interface ESTEnrollmentSettingsCardProps {
  enrollmentCa: CA | null;
  onSelectEnrollmentCa: () => void;
  isLoadingDependencies: boolean;
  authLoading: boolean;
  allCryptoEngines: ApiCryptoEngine[];
  availableProfiles: ApiSigningProfile[];
  issuanceProfileId: string | null;
  setIssuanceProfileId: (id: string | null) => void;
  selectedProfileForDisplay: ApiSigningProfile | undefined;
  enrollmentCaDefaultProfile: ApiSigningProfile | undefined;
  allowOverrideEnrollment: boolean;
  setAllowOverrideEnrollment: (v: boolean) => void;
  verifyCsrSignature: boolean;
  setVerifyCsrSignature: (v: boolean) => void;
  authMode: string;
  setAuthMode: (v: string) => void;
  validationCAs: CA[];
  onRemoveValidationCa: (id: string) => void;
  onAddValidationCa: () => void;
  allowExpiredAuth: boolean;
  setAllowExpiredAuth: (v: boolean) => void;
  chainValidationLevel: number;
  setChainValidationLevel: (v: number) => void;
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
}

export function ESTEnrollmentSettingsCard({
  enrollmentCa,
  onSelectEnrollmentCa,
  isLoadingDependencies,
  authLoading,
  allCryptoEngines,
  availableProfiles,
  issuanceProfileId,
  setIssuanceProfileId,
  selectedProfileForDisplay,
  enrollmentCaDefaultProfile,
  allowOverrideEnrollment,
  setAllowOverrideEnrollment,
  verifyCsrSignature,
  setVerifyCsrSignature,
  authMode,
  setAuthMode,
  validationCAs,
  onRemoveValidationCa,
  onAddValidationCa,
  allowExpiredAuth,
  setAllowExpiredAuth,
  chainValidationLevel,
  setChainValidationLevel,
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
}: ESTEnrollmentSettingsCardProps) {
  return (
    <SettingsCard
      icon={Key}
      title="Enrollment Settings"
      description="Configure the enrollment CA, authentication method, and CSR handling."
    >
      <div>
        <Label htmlFor="enrollmentCa">Enrollment CA</Label>
        <Button type="button" variant="outline" onClick={onSelectEnrollmentCa} className="w-full justify-start text-left font-normal mt-1" disabled={isLoadingDependencies || authLoading}>
          {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enrollmentCa ? enrollmentCa.name : "Select Enrollment CA..."}
        </Button>
        {enrollmentCa &&
          <div className="mt-2 space-y-3">
            <CaVisualizerCard ca={enrollmentCa} className="shadow-none border-border" allCryptoEngines={allCryptoEngines} />
            <div className='pl-2 space-y-2'>
              <Label>Issuance Profile (Optional)</Label>
              <Select value={issuanceProfileId || "ca-default"} onValueChange={(v) => setIssuanceProfileId(v === "ca-default" ? null : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select an issuance profile..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ca-default">Use Enrollment CA's Default</SelectItem>
                  {availableProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedProfileForDisplay ? (
                <div className="pt-2">
                  <IssuanceProfileCard profile={selectedProfileForDisplay} />
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4"/>
                    <AlertTitle>Using Default</AlertTitle>
                    <AlertDescription>
                      No profile selected. The Enrollment CA's default issuance profile will be used to sign certificates.
                    </AlertDescription>
                  </Alert>
                  {enrollmentCaDefaultProfile && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">CA Default Profile:</p>
                      <IssuanceProfileCard profile={enrollmentCaDefaultProfile} />
                    </div>
                  )}
                  {!enrollmentCaDefaultProfile && enrollmentCa && (
                    <Alert variant="warning">
                      <AlertTriangle className="h-4 w-4"/>
                      <AlertTitle>Warning</AlertTitle>
                      <AlertDescription>
                        The selected Enrollment CA does not have a default profile configured.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </div>
        }
      </div>
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="allowOverrideEnrollment" className="flex items-center">
            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
            Allow Override Enrollment
          </Label>
          <p className="text-sm text-muted-foreground">
            Allow clients to override the default enrollment certificate during enrollment.
          </p>
        </div>
        <Switch id="allowOverrideEnrollment" checked={allowOverrideEnrollment} onCheckedChange={setAllowOverrideEnrollment} />
      </div>
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="verifyCsrSignature" className="flex items-center">
            <PackageCheck className="mr-2 h-4 w-4 text-muted-foreground" />
            Verify CSR Signature
          </Label>
          <p className="text-sm text-muted-foreground">
            Verify the cryptographic signature of Certificate Signing Requests during enrollment.
          </p>
        </div>
        <Switch id="verifyCsrSignature" checked={verifyCsrSignature} onCheckedChange={setVerifyCsrSignature} />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-2.5">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">EST Authentication</span>
          <Badge variant="outline" className="ml-auto text-xs">RFC 7030</Badge>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label htmlFor="authMode">Authentication Mode</Label>
            <Select value={authMode} onValueChange={setAuthMode}>
              <SelectTrigger id="authMode" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Client Certificate">Client Certificate</SelectItem>
                <SelectItem value="External Webhook">External Webhook</SelectItem>
                <SelectItem value="No Auth">No Auth</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {authMode === 'Client Certificate' && (
            <div className="space-y-4 pt-2 border-t">
              <h4 className="font-medium text-sm text-muted-foreground pt-2">Client Certificate Auth Settings</h4>
              <div>
                <Label>Validation CAs</Label>
                <div className="mt-2 space-y-2">
                  {validationCAs.length > 0 ? (
                    validationCAs.map(ca => (
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
                <Button type="button" variant="outline" size="sm" onClick={onAddValidationCa} className="mt-2">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Validation CA
                </Button>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Switch id="allowExpiredAuth" checked={allowExpiredAuth} onCheckedChange={setAllowExpiredAuth} />
                <Label htmlFor="allowExpiredAuth">Allow Authenticating Expired Certificates</Label>
              </div>
              <div>
                <Label htmlFor="chainValidationLevel" className="flex items-center">
                  Chain Validation Level
                  <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent><p>-1 equals full chain validation.</p></TooltipContent></Tooltip></TooltipProvider>
                </Label>
                <Input id="chainValidationLevel" type="number" value={chainValidationLevel} onChange={(e) => setChainValidationLevel(Number.parseInt(e.target.value))} className="mt-1" />
              </div>
            </div>
          )}

          {authMode === 'External Webhook' && (
            <div className="space-y-4 pt-2 border-t">
              <h4 className="font-medium text-sm text-muted-foreground pt-2">Webhook Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="webhookName">Webhook Name</Label>
                  <Input id="webhookName" value={webhookName} onChange={(e) => setWebhookName(e.target.value)} placeholder="e.g., MyValidationFunc" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                  <Input id="webhookUrl" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="http://localhost:8080/verify" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="webhookLogLevel">Webhook Log Level</Label>
                  <Select value={webhookLogLevel} onValueChange={setWebhookLogLevel}>
                    <SelectTrigger id="webhookLogLevel" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Info">Info</SelectItem>
                      <SelectItem value="Debug">Debug</SelectItem>
                      <SelectItem value="Warn">Warn</SelectItem>
                      <SelectItem value="Error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="webhookAuthMode">Webhook Auth Mode</Label>
                  <Select value={webhookAuthMode} onValueChange={setWebhookAuthMode}>
                    <SelectTrigger id="webhookAuthMode" className="mt-1"><SelectValue /></SelectTrigger>
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
                  <Label htmlFor="webhookApiKey">API Key</Label>
                  <Input id="webhookApiKey" type="password" value={webhookApiKey} onChange={e => setWebhookApiKey(e.target.value)} placeholder="Enter API Key" className="mt-1"/>
                </div>
              )}
              {webhookAuthMode === 'OIDC' && (
                <div className="space-y-4 pt-2 border-t">
                  <h5 className="font-medium text-sm text-muted-foreground pt-2">OIDC Settings</h5>
                  <div>
                    <Label htmlFor="oidcClientId">OIDC Client ID</Label>
                    <Input id="oidcClientId" value={oidcClientId} onChange={e => setOidcClientId(e.target.value)} placeholder="Enter OIDC Client ID" className="mt-1"/>
                  </div>
                  <div>
                    <Label htmlFor="oidcClientSecret">OIDC Client Secret</Label>
                    <Input id="oidcClientSecret" type="password" value={oidcClientSecret} onChange={e => setOidcClientSecret(e.target.value)} placeholder="Enter OIDC Client Secret" className="mt-1"/>
                  </div>
                  <div>
                    <Label htmlFor="oidcWellKnownUrl">OIDC Well Known URL</Label>
                    <Input id="oidcWellKnownUrl" value={oidcWellKnownUrl} onChange={e => setOidcWellKnownUrl(e.target.value)} placeholder="https://your-issuer.com/.well-known/openid-configuration" className="mt-1"/>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
