
'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, FileText, ShieldCheck, PlusCircle, HelpCircle, Loader2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import type { CA } from '@/lib/ca-data';
import type { ApiSigningProfile } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { CertificateData } from '@/types/certificate';
import { SettingsCard } from './SettingsCard';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

interface CMPEnrollmentSettingsCardProps {
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
  cmpConfirmationMode: string;
  setCmpConfirmationMode: (v: string) => void;
  cmpConfirmationTimeout: string;
  setCmpConfirmationTimeout: (v: string) => void;
  cmpApprovalTimeout: string;
  setCmpApprovalTimeout: (v: string) => void;
  cmpValidationCAs: CA[];
  onRemoveCmpValidationCa: (id: string) => void;
  onAddCmpValidationCa: () => void;
  cmpAllowExpiredAuth: boolean;
  setCmpAllowExpiredAuth: (v: boolean) => void;
  cmpChainValidationLevel: number;
  setCmpChainValidationLevel: (v: number) => void;
  cmpProtectionCertificate: CertificateData | null;
  cmpProtectionCertificateId?: string | null;
  onSelectCmpProtectionCertificate: () => void;
  onClearCmpProtectionCertificate: () => void;
  cmpEnforcePopo: boolean;
  setCmpEnforcePopo: (v: boolean) => void;
  cmpExpectedAuthenticator: string;
  setCmpExpectedAuthenticator: (v: string) => void;
  cmpServerKeyGenEnabled: boolean;
  setCmpServerKeyGenEnabled: (v: boolean) => void;
  cmpWorkflow: string;
  setCmpWorkflow: (v: string) => void;
  cmpAuthMode: string;
  setCmpAuthMode: (v: string) => void;
  cmpWebhookName: string;
  setCmpWebhookName: (v: string) => void;
  cmpWebhookUrl: string;
  setCmpWebhookUrl: (v: string) => void;
  cmpWebhookLogLevel: string;
  setCmpWebhookLogLevel: (v: string) => void;
  cmpWebhookAuthMode: string;
  setCmpWebhookAuthMode: (v: string) => void;
  cmpWebhookApiKey: string;
  setCmpWebhookApiKey: (v: string) => void;
  cmpOidcClientId: string;
  setCmpOidcClientId: (v: string) => void;
  cmpOidcClientSecret: string;
  setCmpOidcClientSecret: (v: string) => void;
  cmpOidcWellKnownUrl: string;
  setCmpOidcWellKnownUrl: (v: string) => void;
}

function getCertificateName(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/CN=([^,]+)/);
  return match ? match[1] : value;
}

function getCaIdReference(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^CA_ID:(.+)$/);
  return match ? match[1] : null;
}

const confirmationModeOptions = [
  {
    value: 'EXPLICIT',
    title: 'Explicit (default)',
    description: 'Require the client to send a certConf within the configured timeout. Transactions otherwise expire and the certificate is revoked.',
  },
  {
    value: 'IMPLICIT',
    title: 'Implicit',
    description: 'Skip the certConf round-trip when the client requests implicit confirmation (id-it-implicitConfirm). The certificate is considered confirmed on delivery.',
  },
] as const;

const workflowOptions = [
  {
    value: 'direct',
    title: 'Direct (synchronous)',
    description: 'Issue and return the certificate inline in response to the enrollment request.',
  },
  {
    value: 'phased',
    title: 'Phased (admin-approved)',
    description: 'Defer issuance until an administrator approves the request. The device receives a "waiting" response and polls for the certificate.',
  },
] as const;

export function CMPEnrollmentSettingsCard({
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
  cmpConfirmationMode,
  setCmpConfirmationMode,
  cmpConfirmationTimeout,
  setCmpConfirmationTimeout,
  cmpApprovalTimeout,
  setCmpApprovalTimeout,
  cmpValidationCAs,
  onRemoveCmpValidationCa,
  onAddCmpValidationCa,
  cmpAllowExpiredAuth,
  setCmpAllowExpiredAuth,
  cmpChainValidationLevel,
  setCmpChainValidationLevel,
  cmpProtectionCertificate,
  cmpProtectionCertificateId,
  onSelectCmpProtectionCertificate,
  onClearCmpProtectionCertificate,
  cmpEnforcePopo,
  setCmpEnforcePopo,
  cmpExpectedAuthenticator,
  setCmpExpectedAuthenticator,
  cmpServerKeyGenEnabled,
  setCmpServerKeyGenEnabled,
  cmpWorkflow,
  setCmpWorkflow,
  cmpAuthMode,
  setCmpAuthMode,
  cmpWebhookName,
  setCmpWebhookName,
  cmpWebhookUrl,
  setCmpWebhookUrl,
  cmpWebhookLogLevel,
  setCmpWebhookLogLevel,
  cmpWebhookAuthMode,
  setCmpWebhookAuthMode,
  cmpWebhookApiKey,
  setCmpWebhookApiKey,
  cmpOidcClientId,
  setCmpOidcClientId,
  cmpOidcClientSecret,
  setCmpOidcClientSecret,
  cmpOidcWellKnownUrl,
  setCmpOidcWellKnownUrl,
}: CMPEnrollmentSettingsCardProps) {
  const protectionCertificateSerial = cmpProtectionCertificate?.serialNumber || cmpProtectionCertificateId || '';
  const protectionCertificateName = getCertificateName(cmpProtectionCertificate?.subject) || 'Protection certificate';
  const protectionCertificateIssuer = getCertificateName(cmpProtectionCertificate?.issuer);
  const protectionCertificateIssuerCaId = cmpProtectionCertificate?.issuerCaId || getCaIdReference(cmpProtectionCertificate?.issuer);
  const selectedConfirmationMode = confirmationModeOptions.find((option) => option.value === (cmpConfirmationMode || 'EXPLICIT'));
  const selectedWorkflow = workflowOptions.find((option) => option.value === (cmpWorkflow || 'direct'));

  return (
    <SettingsCard
      icon={ShieldCheck}
      title="CMP Enrollment Settings"
      description="Configure the enrollment CA, confirmation behavior, and client certificate authentication for CMP (RFC 9483 / LWC)."
    >
      <div>
        <Label>Enrollment CA</Label>
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

      <div>
        <Label htmlFor="cmpWorkflow">Enrollment Workflow</Label>
        <p className="text-xs text-muted-foreground mb-1">Controls whether certificates are issued automatically or only after administrator approval.</p>
        <Select value={cmpWorkflow || 'direct'} onValueChange={setCmpWorkflow}>
          <SelectTrigger id="cmpWorkflow" className="mt-1">
            <SelectValue>{selectedWorkflow?.title}</SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[320px]">
            {workflowOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} textValue={option.title} className="items-start py-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none">{option.title}</p>
                  <p className="text-xs leading-snug text-muted-foreground">{option.description}</p>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cmpWorkflow === 'phased' && (
          <div className="mt-3">
            <Label htmlFor="cmpApprovalTimeout">Approval Timeout</Label>
            <p className="text-xs text-muted-foreground mb-1">How long a PENDING transaction waits for an administrator to approve or reject it. Leave empty to use the server default (7 days).</p>
            <Input id="cmpApprovalTimeout" value={cmpApprovalTimeout} onChange={(e) => setCmpApprovalTimeout(e.target.value)} placeholder="e.g., 7d, 24h, 30m" className="mt-1" />
          </div>
        )}
      </div>

      <div>
        <Label>Protection Certificate</Label>
        <p className="text-xs text-muted-foreground mb-2">Certificate used to sign CMP response messages. Leave empty to send responses unprotected.</p>
        {(cmpProtectionCertificate || cmpProtectionCertificateId) ? (
          <div className="rounded-md border bg-muted/20">
            <div className="flex items-start gap-3 p-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-1">
                {protectionCertificateSerial ? (
                  <Button variant="link" className="h-auto min-w-0 justify-start truncate p-0 text-left text-sm font-medium" asChild>
                    <Link
                      href={`/certificates/details?certificateId=${encodeURIComponent(protectionCertificateSerial)}`}
                      title={cmpProtectionCertificate?.subject || `View certificate ${protectionCertificateSerial}`}
                    >
                      {protectionCertificateName}
                    </Link>
                  </Button>
                ) : (
                  <p className="truncate text-sm font-medium text-foreground" title={cmpProtectionCertificate?.subject || protectionCertificateSerial}>
                    {protectionCertificateName}
                  </p>
                )}
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[72px_minmax(0,1fr)]">
                  {protectionCertificateSerial && (
                    <>
                      <span className="text-muted-foreground/80">Serial</span>
                      <IdentifierDisplay value={protectionCertificateSerial} className="min-w-0 truncate font-mono text-xs text-muted-foreground" />
                    </>
                  )}
                  {protectionCertificateIssuer && (
                    <>
                      <span className="text-muted-foreground/80">Issuer</span>
                      {protectionCertificateIssuerCaId ? (
                        <Button variant="link" size="sm" className="h-auto min-w-0 justify-start truncate p-0 text-xs font-normal" asChild>
                          <Link
                            href={`/certificate-authorities/details?caId=${encodeURIComponent(protectionCertificateIssuerCaId)}`}
                            title={`View CA ${protectionCertificateIssuerCaId}`}
                          >
                            {protectionCertificateIssuerCaId}
                          </Link>
                        </Button>
                      ) : (
                        <span className="min-w-0 truncate" title={cmpProtectionCertificate?.issuer}>{protectionCertificateIssuer}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onClearCmpProtectionCertificate} disabled={isLoadingDependencies || authLoading} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
                <span className="sr-only">Clear protection certificate</span>
              </Button>
            </div>
            <div className="border-t px-3 py-2">
              <Button type="button" variant="secondary" size="sm" onClick={onSelectCmpProtectionCertificate} disabled={isLoadingDependencies || authLoading}>
                Change certificate
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={onSelectCmpProtectionCertificate} className="w-full justify-start text-left font-normal" disabled={isLoadingDependencies || authLoading}>
            {isLoadingDependencies || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Select Protection Certificate..."}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="cmpConfirmationMode">Confirmation Mode</Label>
          <Select value={cmpConfirmationMode || 'EXPLICIT'} onValueChange={setCmpConfirmationMode}>
            <SelectTrigger id="cmpConfirmationMode" className="mt-1">
              <SelectValue>{selectedConfirmationMode?.title}</SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[320px]">
              {confirmationModeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} textValue={option.title} className="items-start py-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-none">{option.title}</p>
                    <p className="text-xs leading-snug text-muted-foreground">{option.description}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {cmpConfirmationMode === 'EXPLICIT' && (
          <div>
            <Label htmlFor="cmpConfirmationTimeout">Confirmation Timeout</Label>
            <Input id="cmpConfirmationTimeout" value={cmpConfirmationTimeout} onChange={(e) => setCmpConfirmationTimeout(e.target.value)} placeholder="e.g., 30s, 2m" className="mt-1" />
          </div>
        )}
      </div>

      <div className="space-y-4 pt-2 border-t">
        <h4 className="font-medium text-sm text-muted-foreground pt-2">Security Enforcement</h4>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Switch id="cmpEnforcePopo" checked={cmpEnforcePopo} onCheckedChange={setCmpEnforcePopo} />
            <Label htmlFor="cmpEnforcePopo">Enforce Proof-of-Possession (POPO)</Label>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-xs"><p>When enabled, the CRMF CertReqMsg MUST contain a valid POPO signature proving private key ownership. Required by RFC 9483 §4.1.</p></TooltipContent></Tooltip></TooltipProvider>
          </div>
          {!cmpEnforcePopo && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Security Warning</AlertTitle>
              <AlertDescription>
                Disabling POPO enforcement should only be done for testing purposes or when another mechanism (e.g. mTLS) already proves private key possession.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center space-x-2">
            <Switch id="cmpServerKeyGenEnabled" checked={cmpServerKeyGenEnabled} onCheckedChange={setCmpServerKeyGenEnabled} />
            <Label htmlFor="cmpServerKeyGenEnabled">Allow Server Key Generation (CKG)</Label>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-xs"><p>RFC 9483 §4.1.6 central key generation: an enrollment request with an empty public key asks the server to generate the key pair and return it wrapped in the response. When disabled (default), such requests are rejected.</p></TooltipContent></Tooltip></TooltipProvider>
          </div>
          <div>
            <Label htmlFor="cmpExpectedAuthenticator" className="flex items-center">
              Expected Authenticator (Optional)
              <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-xs"><p>Pre-shared answer validated against the RFC 4211 §6.2 id-regCtrl-authenticator control (e.g. a security-question answer). Leave empty to accept the control unvalidated.</p></TooltipContent></Tooltip></TooltipProvider>
            </Label>
            <Input id="cmpExpectedAuthenticator" value={cmpExpectedAuthenticator} onChange={(e) => setCmpExpectedAuthenticator(e.target.value)} placeholder="Leave empty to skip validation" className="mt-1" />
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-2 border-t">
        <h4 className="font-medium text-sm text-muted-foreground pt-2">Authentication</h4>
        <div>
          <Label htmlFor="cmpAuthMode" className="flex items-center">
            Authentication Mode
            <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-xs"><p>Single source of truth for CMP request authorization. <strong>Client Certificate / Combined</strong> require the message to be signature-protected (RFC 9483 §3.2) and validate the signer cert against the Validation CAs — unprotected requests are rejected at the wire layer. <strong>No Auth / External Webhook</strong> accept unsigned messages; authorization is either none or delegated entirely to the webhook.</p></TooltipContent></Tooltip></TooltipProvider>
          </Label>
          <Select value={cmpAuthMode} onValueChange={setCmpAuthMode}>
            <SelectTrigger id="cmpAuthMode" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Client Certificate">Client Certificate</SelectItem>
              <SelectItem value="External Webhook">External Webhook</SelectItem>
              <SelectItem value="No Auth">No Auth</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {cmpAuthMode === 'Client Certificate' && (
        <div className="space-y-4 pt-2 border-t">
          <h4 className="font-medium text-sm text-muted-foreground pt-2">Client Certificate Auth Settings</h4>
          <div>
            <Label>Validation CAs</Label>
            <div className="mt-2 space-y-2">
              {cmpValidationCAs.length > 0 ? (
                cmpValidationCAs.map(ca => (
                  <div key={ca.id} className="flex items-center gap-2 group">
                    <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="flex-grow shadow-none border-border" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100" onClick={() => onRemoveCmpValidationCa(ca.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic text-center p-2">No validation CAs selected.</p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onAddCmpValidationCa} className="mt-2">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Validation CA
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="cmpAllowExpiredAuth" checked={cmpAllowExpiredAuth} onCheckedChange={setCmpAllowExpiredAuth} />
            <Label htmlFor="cmpAllowExpiredAuth">Allow Expired Client Certificates</Label>
          </div>
          <div>
            <Label htmlFor="cmpChainValidationLevel" className="flex items-center">
              Chain Validation Level
              <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent><p>0 = leaf only, 1 = one intermediate, etc.</p></TooltipContent></Tooltip></TooltipProvider>
            </Label>
            <Input id="cmpChainValidationLevel" type="number" min={0} value={cmpChainValidationLevel} onChange={(e) => setCmpChainValidationLevel(Number.parseInt(e.target.value) || 0)} className="mt-1" />
          </div>
        </div>
      )}

      {cmpAuthMode === 'External Webhook' && (
        <div className="space-y-4 pt-2 border-t">
          <h4 className="font-medium text-sm text-muted-foreground pt-2">Webhook Settings</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cmpWebhookName">Webhook Name</Label>
              <Input id="cmpWebhookName" value={cmpWebhookName} onChange={(e) => setCmpWebhookName(e.target.value)} placeholder="e.g., MyValidationFunc" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cmpWebhookUrl">Webhook URL</Label>
              <Input id="cmpWebhookUrl" value={cmpWebhookUrl} onChange={(e) => setCmpWebhookUrl(e.target.value)} placeholder="http://localhost:8080/verify" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cmpWebhookLogLevel">Webhook Log Level</Label>
              <Select value={cmpWebhookLogLevel} onValueChange={setCmpWebhookLogLevel}>
                <SelectTrigger id="cmpWebhookLogLevel" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Info">Info</SelectItem>
                  <SelectItem value="Debug">Debug</SelectItem>
                  <SelectItem value="Warn">Warn</SelectItem>
                  <SelectItem value="Error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cmpWebhookAuthMode">Webhook Auth Mode</Label>
              <Select value={cmpWebhookAuthMode} onValueChange={setCmpWebhookAuthMode}>
                <SelectTrigger id="cmpWebhookAuthMode" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="No Auth">No Auth</SelectItem>
                  <SelectItem value="OIDC">OIDC</SelectItem>
                  <SelectItem value="API Key">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {cmpWebhookAuthMode === 'API Key' && (
            <div>
              <Label htmlFor="cmpWebhookApiKey">API Key</Label>
              <Input id="cmpWebhookApiKey" type="password" value={cmpWebhookApiKey} onChange={e => setCmpWebhookApiKey(e.target.value)} placeholder="Enter API Key" className="mt-1" />
            </div>
          )}
          {cmpWebhookAuthMode === 'OIDC' && (
            <div className="space-y-4 pt-2 border-t">
              <h5 className="font-medium text-sm text-muted-foreground pt-2">OIDC Settings</h5>
              <div>
                <Label htmlFor="cmpOidcClientId">OIDC Client ID</Label>
                <Input id="cmpOidcClientId" value={cmpOidcClientId} onChange={e => setCmpOidcClientId(e.target.value)} placeholder="Enter OIDC Client ID" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="cmpOidcClientSecret">OIDC Client Secret</Label>
                <Input id="cmpOidcClientSecret" type="password" value={cmpOidcClientSecret} onChange={e => setCmpOidcClientSecret(e.target.value)} placeholder="Enter OIDC Client Secret" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="cmpOidcWellKnownUrl">OIDC Well Known URL</Label>
                <Input id="cmpOidcWellKnownUrl" value={cmpOidcWellKnownUrl} onChange={e => setCmpOidcWellKnownUrl(e.target.value)} placeholder="https://your-issuer.com/.well-known/openid-configuration" className="mt-1" />
              </div>
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
