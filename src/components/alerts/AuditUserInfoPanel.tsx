'use client';

import React, { useMemo } from 'react';
import { UserRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
type ParsedAuthClaims = Record<string, unknown> | null;

export interface AuditEventSummary {
  type: string;
  payload: object;
}

interface AuditUserInfoPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  event: AuditEventSummary | null;
}

const formatEpoch = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toLocaleString();
  }

  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return new Date(Number(value) * 1000).toLocaleString();
  }

  return 'Not present';
};

const parseAuthClaims = (rawValue: unknown): ParsedAuthClaims => {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return rawValue as Record<string, unknown>;
  }

  if (typeof rawValue !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const asText = (value: unknown): string => {
  if (value === undefined || value === null || value === '') {
    return 'Not present';
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'Not present';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return 'Not present';
    }
  }

  return String(value);
};

const decodeCertificateClaim = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.includes('-----BEGIN CERTIFICATE-----')) {
    return trimmed;
  }

  try {
    const decoded = atob(trimmed);
    if (decoded.includes('-----BEGIN CERTIFICATE-----')) {
      return decoded;
    }

    return decoded;
  } catch {
    return null;
  }
};

export function AuditUserInfoPanel({ isOpen, onOpenChange, event }: AuditUserInfoPanelProps) {
  const { authid, authtype, authclaims, parsedClaims, rawClaimsIsPresent } = useMemo(() => {
    const payload = (event?.payload ?? {}) as Record<string, unknown>;
    const authidValue = payload.authid;
    const authtypeValue = payload.authtype;
    const authclaimsValue = payload.authclaims;

    return {
      authid: authidValue,
      authtype: authtypeValue,
      authclaims: authclaimsValue,
      parsedClaims: parseAuthClaims(authclaimsValue),
      rawClaimsIsPresent: authclaimsValue !== undefined && authclaimsValue !== null && authclaimsValue !== '',
    };
  }, [event]);

  const claims = parsedClaims ?? {};
  const isCertificateAuth = String(authtype ?? '').toLowerCase() === 'crt';
  const certificatePem = decodeCertificateClaim((claims as Record<string, unknown>).crt);
  const realmRoles = ((claims.realm_access as { roles?: unknown[] } | undefined)?.roles ?? []) as unknown[];
  const accountRoles = ((claims.resource_access as { account?: { roles?: unknown[] } } | undefined)?.account?.roles ?? []) as unknown[];

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex flex-col">
        <SheetHeader className="border-b px-6 py-5 text-left">
          <SheetTitle>Audit Event User Info</SheetTitle>
          <SheetDescription>User identity details extracted from this audit event.</SheetDescription>
          {event && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-normal">{event.type}</Badge>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserRound className="h-4 w-4 text-primary" />
            Authentication Fields
          </div>
          <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
              <span className="text-muted-foreground">authid</span>
              <span className="break-all">{asText(authid)}</span>
            </div>
            <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
              <span className="text-muted-foreground">authtype</span>
              <span className="break-all">{asText(authtype)}</span>
            </div>
            {!isCertificateAuth && (
              <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
                <span className="text-muted-foreground">authclaims</span>
                <span>{rawClaimsIsPresent ? 'Present' : 'Not present'}</span>
              </div>
            )}
          </div>
        </section>

        {isCertificateAuth && (
          <>
            <Separator />

            <section className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Certificate Claims (CRT)
              </div>
              <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
                  <span className="text-muted-foreground">authid</span>
                  <span className="break-all">{asText(authid)}</span>
                </div>
              </div>

              {certificatePem && (
                <pre className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words">
                  {certificatePem}
                </pre>
              )}
            </section>
          </>
        )}

        {!isCertificateAuth && (
          <>
            <Separator />

            <section className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Parsed Claims (easy read)
              </div>

              {!parsedClaims ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Claims are not present or could not be parsed.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">name</span><span>{asText(claims.name)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">given_name</span><span>{asText(claims.given_name)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">family_name</span><span>{asText(claims.family_name)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">preferred_username</span><span>{asText(claims.preferred_username)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">email</span><span className="break-all">{asText(claims.email)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">sub</span><span className="break-all">{asText(claims.sub)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">iss</span><span className="break-all">{asText(claims.iss)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">aud</span><span>{asText(claims.aud)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">acr</span><span>{asText(claims.acr)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">scope</span><span>{asText(claims.scope)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">auth_time</span><span>{formatEpoch(claims.auth_time)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">iat</span><span>{formatEpoch(claims.iat)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2"><span className="text-muted-foreground">exp</span><span>{formatEpoch(claims.exp)}</span></div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
                    <span className="text-muted-foreground">realm roles</span>
                    <span>{asText(realmRoles)}</span>
                  </div>
                  <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
                    <span className="text-muted-foreground">account roles</span>
                    <span>{asText(accountRoles)}</span>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <Separator />

        <section className="space-y-2">
          <p className="text-sm font-medium">Raw authclaims</p>
          <pre className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words">
            {rawClaimsIsPresent ? asText(authclaims) : 'Not present'}
          </pre>
        </section>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
