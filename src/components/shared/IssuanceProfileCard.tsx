'use client';

import React, { useState } from 'react';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Edit, Trash2, Braces, Users, MoreVertical,
  Clock, KeyRound, Shield, User, FileText, Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ApiSigningProfile } from '@/lib/ca-data';
import { parseDurationToSeconds } from '@/lib/duration';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_SECONDS = 24 * 60 * 60;
const YEAR_SECONDS = 365 * DAY_SECONDS;

function plural(n: number, unit: string) {
  return `${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`;
}

/** Headline validity plus an optional secondary hint, e.g. "1 year" / "365 days". */
function getValidity(profile: ApiSigningProfile): { label: string; hint?: string } {
  if (!profile.validity) return { label: "—" };
  switch (profile.validity.type) {
    case 'Duration': {
      const raw = profile.validity.duration;
      if (!raw) return { label: "—" };
      const seconds = parseDurationToSeconds(raw);
      if (seconds === null || seconds === 0) return { label: raw };
      if (seconds % YEAR_SECONDS === 0) {
        return { label: plural(seconds / YEAR_SECONDS, 'year'), hint: plural(seconds / DAY_SECONDS, 'day') };
      }
      if (seconds % DAY_SECONDS === 0) return { label: plural(seconds / DAY_SECONDS, 'day') };
      if (seconds % 3600 === 0) return { label: plural(seconds / 3600, 'hour') };
      return { label: raw };
    }
    case 'Date':
      if (profile.validity.time?.startsWith('9999-12-31')) return { label: "No expiry" };
      return profile.validity.time
        ? { label: `Until ${new Date(profile.validity.time).toLocaleDateString()}`, hint: "Fixed expiration date" }
        : { label: "—" };
    case 'Indefinite': return { label: "No expiry" };
    default: return { label: "—" };
  }
}

/** "OCSPSigning" → "OCSP Signing", "DigitalSignature" → "Digital Signature" */
function humanizeUsage(usage: string) {
  return usage
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function getCryptoRules(profile: ApiSigningProfile) {
  if (!profile.crypto_enforcement?.enabled) return null;
  const { crypto_enforcement: ce } = profile;
  const tokens: string[] = [];
  if (ce.allow_rsa_keys) {
    const sizes = ce.allowed_rsa_key_sizes ?? [];
    tokens.push(...(sizes.length > 0 ? sizes.map(s => `RSA ${s}`) : ['RSA']));
  }
  if (ce.allow_ecdsa_keys) {
    const sizes = ce.allowed_ecdsa_key_sizes ?? [];
    tokens.push(...(sizes.length > 0 ? sizes.map(s => `EC P-${s}`) : ['ECDSA']));
  }
  return tokens;
}

/** "CN=device, O=Acme" from the pinned subject, or null when nothing is set. */
function getSubjectSummary(profile: ApiSigningProfile) {
  const s = profile.subject;
  if (!s) return null;
  const parts = [
    s.common_name && `CN=${s.common_name}`,
    s.organization && `O=${s.organization}`,
    s.organization_unit && `OU=${s.organization_unit}`,
    s.locality && `L=${s.locality}`,
    s.state && `ST=${s.state}`,
    s.country && `C=${s.country}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Whether a field is taken from the CSR (caller-controlled) or pinned by the profile. */
const SourceTag: React.FC<{ honors: boolean }> = ({ honors }) => (
  <Badge variant={honors ? 'warning' : 'default'}>{honors ? "From CSR" : "Enforced"}</Badge>
);

/** Wrapping chip list that collapses the tail into a "+N" chip with a tooltip. */
const TokenList: React.FC<{
  items: string[]; max?: number; mono?: boolean; empty?: string; variant?: 'default' | 'secondary';
}> = ({ items, max = 3, mono, empty = "None", variant = 'secondary' }) => {
  if (items.length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }
  const shown = items.slice(0, max);
  const overflow = items.slice(max);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map(item => (
        <Badge
          key={item}
          variant={variant}
          className={cn(variant === 'secondary' && "text-foreground", mono && "font-mono")}
        >
          {item}
        </Badge>
      ))}
      {overflow.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default">
                +{overflow.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              {overflow.join(', ')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

/** Small muted field label with its icon. */
const FieldLabel: React.FC<{ icon: LucideIcon; title: string }> = ({ icon: Icon, title }) => (
  <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
    <Icon className="size-3.5 shrink-0" />
    <span className="truncate">{title}</span>
  </span>
);

/** One cell of the ruled grid: label with its CSR/Enforced source on the right, value underneath. */
const SpecCell: React.FC<{ icon: LucideIcon; title: string; honors: boolean; children: React.ReactNode }> = ({
  icon, title, honors, children,
}) => (
  <div className="flex min-w-0 flex-col gap-1.5 bg-card px-5 py-3.5">
    <div className="flex items-center justify-between gap-2">
      <FieldLabel icon={icon} title={title} />
      <SourceTag honors={honors} />
    </div>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────────

interface IssuanceProfileCardProps {
  profile: ApiSigningProfile;
  className?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewUsage?: () => void;
}

export const IssuanceProfileCard: React.FC<IssuanceProfileCardProps> = ({
  profile, className, onEdit, onDelete, onViewUsage,
}) => {
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const validity = getValidity(profile);
  const cryptoTokens = getCryptoRules(profile);
  const subjectSummary = getSubjectSummary(profile);
  const keyUsages = (profile.key_usage ?? []).map(humanizeUsage);
  const extendedKeyUsages = (profile.extended_key_usages ?? []).map(humanizeUsage);
  const hasActions = Boolean(onEdit || onDelete || onViewUsage);

  return (
    <>
      <Card
        className={cn(
          "@container/profile h-full gap-0 py-0 transition-shadow",
          hasActions && "hover:shadow-md",
          className
        )}
      >
        {/* ── Identity ── */}
        <CardHeader className="gap-0.5 border-b bg-muted/40 py-3 [.border-b]:pb-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <CardTitle className="truncate text-sm font-semibold text-primary" title={profile.name}>
              {profile.name}
            </CardTitle>
            <span className="truncate font-mono text-xs text-muted-foreground" title={profile.id}>
              {profile.id}
            </span>
          </div>
          <CardDescription className="line-clamp-1 text-xs">
            {profile.description || 'No description'}
          </CardDescription>
          <CardAction className="-my-0.5 flex items-center gap-1">
            <Badge variant="muted">{profile.sign_as_ca ? 'CA' : 'End entity'}</Badge>
            {hasActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="-mr-2" title="Profile actions">
                    <MoreVertical />
                    <span className="sr-only">Profile actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Edit className="mr-2 h-4 w-4" /> Edit profile
                    </DropdownMenuItem>
                  )}
                  {onViewUsage && (
                    <DropdownMenuItem onClick={onViewUsage}>
                      <Users className="mr-2 h-4 w-4" /> Show usage
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setIsDetailsModalOpen(true)}>
                    <Braces className="mr-2 h-4 w-4" /> View raw JSON
                  </DropdownMenuItem>
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </CardAction>
        </CardHeader>

        {/* ── Specification: profile-wide summary rail + ruled 2×2 of certificate fields ── */}
        <div className="grid flex-1 grid-cols-1 gap-px bg-border @xl/profile:grid-cols-[12.5rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 bg-card px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <FieldLabel icon={Clock} title="Validity" />
              <span className="mt-1 text-xl font-semibold leading-tight tracking-tight tabular-nums">
                {validity.label}
              </span>
              {validity.hint && (
                <span className="text-xs text-muted-foreground tabular-nums">{validity.hint}</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={Layers} title="Key policy" />
              {cryptoTokens
                ? <TokenList items={cryptoTokens} mono max={4} variant="default" empty="No algorithms allowed" />
                : <span className="text-sm">Any algorithm accepted</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-px @xl/profile:grid-cols-2">
            <SpecCell icon={KeyRound} title="Key usage" honors={profile.honor_key_usage}>
              {profile.honor_key_usage
                ? <span className="text-muted-foreground">Taken from the request</span>
                : <TokenList items={keyUsages} />}
            </SpecCell>

            <SpecCell icon={Shield} title="Extended key usage" honors={profile.honor_extended_key_usages}>
              {profile.honor_extended_key_usages
                ? <span className="text-muted-foreground">Taken from the request</span>
                : <TokenList items={extendedKeyUsages} />}
            </SpecCell>

            <SpecCell icon={User} title="Subject" honors={profile.honor_subject}>
              {profile.honor_subject
                ? <span className="text-muted-foreground">Copied from the request</span>
                : 'Replaced by profile values'}
              {!profile.honor_subject && subjectSummary && (
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={subjectSummary}>
                  {subjectSummary}
                </p>
              )}
            </SpecCell>

            <SpecCell icon={FileText} title="Extensions" honors={profile.honor_extensions}>
              {profile.honor_extensions
                ? <span className="text-muted-foreground">Taken from the request</span>
                : 'Request extensions ignored'}
            </SpecCell>
          </div>
        </div>

        {/* ── Quick actions ── */}
        {hasActions && (
          <CardFooter className="justify-between gap-2 border-t py-3 [.border-t]:pt-3">
            <div>
              {onViewUsage && (
                <Button variant="ghost" size="sm" className="-ml-3 text-muted-foreground" onClick={onViewUsage}>
                  <Users data-icon="inline-start" /> Show usage
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit data-icon="inline-start" /> Edit
                </Button>
              )}
              {onDelete && (
                <Button variant="destructive" size="sm" onClick={onDelete}>
                  <Trash2 data-icon="inline-start" /> Delete
                </Button>
              )}
            </div>
          </CardFooter>
        )}
      </Card>

      <Sheet open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <SheetContent side="right" className="!w-[33vw] sm:!max-w-none flex flex-col p-0">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Raw Profile Data</SheetTitle>
            <SheetDescription>{profile.name}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-6 py-4">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">{JSON.stringify(profile, null, 2)}</pre>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
};
