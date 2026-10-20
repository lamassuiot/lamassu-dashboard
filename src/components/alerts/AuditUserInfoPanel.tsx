'use client';

import React, { useMemo } from 'react';
import { UserRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AlertEvent } from '@/app/alerts/page';

type ParsedAuthClaims = Record<string, unknown> | null;

interface AuditUserInfoPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  event: AlertEvent | null;
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

  const claimRows: { label: string; value: string; breakAll?: boolean }[] = [
    { label: 'name', value: asText(claims.name) },
    { label: 'given_name', value: asText(claims.given_name) },
    { label: 'family_name', value: asText(claims.family_name) },
    { label: 'preferred_username', value: asText(claims.preferred_username) },
    { label: 'email', value: asText(claims.email), breakAll: true },
    { label: 'sub', value: asText(claims.sub), breakAll: true },
    { label: 'iss', value: asText(claims.iss), breakAll: true },
    { label: 'aud', value: asText(claims.aud) },
    { label: 'acr', value: asText(claims.acr) },
    { label: 'scope', value: asText(claims.scope) },
    { label: 'auth_time', value: formatEpoch(claims.auth_time) },
    { label: 'iat', value: formatEpoch(claims.iat) },
    { label: 'exp', value: formatEpoch(claims.exp) },
    { label: 'realm roles', value: asText(realmRoles) },
    { label: 'account roles', value: asText(accountRoles) },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 data-[side=right]:w-full data-[side=right]:sm:w-2/3 data-[side=right]:lg:w-1/2 data-[side=right]:xl:w-1/3 data-[side=right]:sm:max-w-none"
      >
        <SheetHeader className="border-b px-6 py-5 pr-14 text-left">
          <SheetTitle>Audit Event User Info</SheetTitle>
          <SheetDescription>User identity details extracted from this audit event.</SheetDescription>
          {event && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">{event.type}</Badge>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <section className="space-y-2">
            <SectionTitle icon={UserRound}>Authentication Fields</SectionTitle>
            <InfoGrid>
              <InfoRow label="authid" value={asText(authid)} breakAll />
              <InfoRow label="authtype" value={asText(authtype)} breakAll />
              {!isCertificateAuth && <InfoRow label="authclaims" value={rawClaimsIsPresent ? 'Present' : 'Not present'} />}
            </InfoGrid>
          </section>

          <Separator />

          {isCertificateAuth ? (
            <section className="space-y-2">
              <SectionTitle icon={ShieldCheck}>Certificate Claims (CRT)</SectionTitle>
              <InfoGrid>
                <InfoRow label="authid" value={asText(authid)} breakAll />
              </InfoGrid>
              {certificatePem && <CodeBox>{certificatePem}</CodeBox>}
            </section>
          ) : (
            <section className="space-y-2">
              <SectionTitle icon={ShieldCheck}>Parsed Claims</SectionTitle>
              {parsedClaims ? (
                <InfoGrid>
                  {claimRows.map((row) => (
                    <InfoRow key={row.label} label={row.label} value={row.value} breakAll={row.breakAll} />
                  ))}
                </InfoGrid>
              ) : (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Claims are not present or could not be parsed.
                </div>
              )}
            </section>
          )}

          <Separator />

          <section className="space-y-2">
            <p className="text-sm font-medium">Raw authclaims</p>
            <CodeBox>{rawClaimsIsPresent ? asText(authclaims) : 'Not present'}</CodeBox>
          </section>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const SectionTitle: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-2 text-sm font-medium">
    <Icon className="h-4 w-4 text-primary" />
    {children}
  </div>
);

const InfoGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 text-sm">{children}</dl>
);

const InfoRow: React.FC<{ label: string; value: string; breakAll?: boolean }> = ({ label, value, breakAll }) => (
  <div className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-2">
    <dt className="truncate text-muted-foreground" title={label}>{label}</dt>
    <dd className={cn('min-w-0', breakAll ? 'break-all' : 'break-words')}>{value}</dd>
  </div>
);

const CodeBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs">
    {children}
  </pre>
);
