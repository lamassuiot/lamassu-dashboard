'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldCheck, Edit, Trash2, Braces, Users, MoreVertical, ScrollText, Landmark } from "lucide-react";
import type { ApiSigningProfile } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getValidityLabel(profile: ApiSigningProfile) {
  if (!profile.validity) return "—";
  switch (profile.validity.type) {
    case 'Duration': return profile.validity.duration || "—";
    case 'Date':
      if (profile.validity.time?.startsWith('9999-12-31')) return "No expiry";
      return profile.validity.time ? new Date(profile.validity.time).toLocaleDateString() : "—";
    case 'Indefinite': return "No expiry";
    default: return "—";
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

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Whether a field is taken from the CSR or pinned by the profile. */
const SourceTag: React.FC<{ honors: boolean }> = ({ honors }) => (
  <span className={cn(
    "shrink-0 rounded-sm border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider",
    honors
      ? "border-primary/25 bg-primary/5 text-primary"
      : "border-border bg-muted/60 text-muted-foreground"
  )}>
    {honors ? "From CSR" : "Enforced"}
  </span>
);

const Token: React.FC<React.PropsWithChildren<{ mono?: boolean }>> = ({ children, mono }) => (
  <span className={cn(
    "inline-flex h-5 items-center rounded-sm border border-border bg-muted/50 px-1.5 text-[11px] leading-none text-foreground/80",
    mono && "font-mono"
  )}>
    {children}
  </span>
);

/** Wrapping token list that collapses the tail into a "+N" chip with a tooltip. */
const TokenList: React.FC<{ items: string[]; max?: number; mono?: boolean; empty?: string }> = ({
  items, max = 3, mono, empty = "None",
}) => {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">{empty}</span>;
  }
  const shown = items.slice(0, max);
  const overflow = items.slice(max);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map(item => <Token key={item} mono={mono}>{item}</Token>)}
      {overflow.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-5 cursor-default items-center rounded-sm border border-dashed border-border px-1.5 text-[11px] leading-none text-muted-foreground">
                +{overflow.length}
              </span>
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

/** One row of the spec grid: micro-caps label on a fixed rail, value on the right. */
const SpecRow: React.FC<{ label: string; children: React.ReactNode; aside?: React.ReactNode }> = ({
  label, children, aside,
}) => (
  <div className="grid grid-cols-[6.5rem_1fr] items-start gap-3 px-4 py-2.5">
    <span className="pt-px text-[10px] font-semibold uppercase leading-4 tracking-wider text-muted-foreground">
      {label}
    </span>
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0 text-xs leading-5 text-foreground/90">{children}</div>
      {aside && <div className="shrink-0 pt-px">{aside}</div>}
    </div>
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

  const validityLabel = getValidityLabel(profile);
  const cryptoTokens = getCryptoRules(profile);
  const keyUsages = (profile.key_usage ?? []).map(humanizeUsage);
  const extendedKeyUsages = (profile.extended_key_usages ?? []).map(humanizeUsage);
  const hasActions = Boolean(onEdit || onDelete || onViewUsage);

  return (
    <>
      <Card
        className={cn(
          "group/profile h-full gap-0 py-0 transition-shadow duration-200",
          hasActions && "hover:shadow-md",
          className
        )}
      >
        {/* ── Identity ── */}
        <CardHeader className="gap-0 border-b bg-muted/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-px shrink-0 rounded-md border border-primary/20 bg-primary/10 p-1.5">
              {profile.sign_as_ca
                ? <Landmark className="h-4 w-4 text-primary" />
                : <ScrollText className="h-4 w-4 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold leading-5 tracking-tight" title={profile.name}>
                {profile.name}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">
                {profile.description || 'No description'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge
                variant="outline"
                className="h-5 rounded-sm bg-card px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {profile.sign_as_ca ? 'CA' : 'End entity'}
              </Badge>
              {hasActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="-mr-1.5 h-7 w-7" title="Profile actions">
                      <MoreVertical className="h-4 w-4" />
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
            </div>
          </div>
        </CardHeader>

        {/* ── Specification ── */}
        <CardContent className="flex-1 divide-y divide-border/60 px-0 py-0">
          <SpecRow label="Validity">
            <span className="font-mono">{validityLabel}</span>
          </SpecRow>

          <SpecRow label="Subject" aside={<SourceTag honors={profile.honor_subject} />}>
            {profile.honor_subject
              ? 'Copied verbatim from the request'
              : 'Replaced by profile values'}
          </SpecRow>

          <SpecRow label="Key usage" aside={<SourceTag honors={profile.honor_key_usage} />}>
            {profile.honor_key_usage
              ? <span className="text-muted-foreground">Taken from the request</span>
              : <TokenList items={keyUsages} />}
          </SpecRow>

          <SpecRow label="Ext. usage" aside={<SourceTag honors={profile.honor_extended_key_usages} />}>
            {profile.honor_extended_key_usages
              ? <span className="text-muted-foreground">Taken from the request</span>
              : <TokenList items={extendedKeyUsages} />}
          </SpecRow>

          <SpecRow
            label="Key policy"
            aside={cryptoTokens ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-primary/25 bg-primary/5 px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-primary">
                <ShieldCheck className="h-3 w-3" /> Enforced
              </span>
            ) : undefined}
          >
            {cryptoTokens
              ? <TokenList items={cryptoTokens} mono empty="No algorithms allowed" />
              : <span className="text-muted-foreground">Any algorithm accepted</span>}
          </SpecRow>
        </CardContent>

        {/* ── Identifier / quick actions ── */}
        <CardFooter className="justify-between gap-3 border-t bg-muted/20 px-4 py-2">
          <span className="truncate font-mono text-[11px] text-muted-foreground" title={profile.id}>
            {profile.id}
          </span>
          {hasActions && onEdit && (
            <Button variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={onEdit}>
              <Edit className="mr-1.5 h-3 w-3" /> Edit
            </Button>
          )}
        </CardFooter>
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
