'use client';

import React from 'react';
import {
  Edit, FileInput, FileText, KeyRound, Lock, MoreVertical, ScrollText, Shield, ShieldCheck, Trash2, User, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EngineIconBox } from '@/components/ca/EngineIconBox';
import type { ApiSigningProfile } from '@/lib/ca-data';
import { DAY_SECONDS, HOUR_SECONDS, YEAR_SECONDS, parseDurationToSeconds } from '@/lib/duration';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function plural(n: number, unit: string) {
  return `${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`;
}

/** Headline validity plus an optional secondary hint, e.g. "1 year" / "364 days" (backend years are 52 weeks). */
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
      if (seconds % HOUR_SECONDS === 0) return { label: plural(seconds / HOUR_SECONDS, 'hour') };
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

// ─── Shared pieces ────────────────────────────────────────────────────────────

const MAX_USAGE_CHIPS = 5;

type ChipKind = 'ku' | 'eku' | 'csr';

const chipClass: Record<ChipKind, string> = {
  ku: 'border-border bg-muted text-foreground',
  eku: 'border-primary/20 bg-primary/10 text-primary',
  csr: 'border-dashed border-amber-500/50 bg-transparent text-amber-700 dark:text-amber-400',
};

interface UsageChip {
  key: string;
  label: string;
  kind: ChipKind;
}

/** Key usages and extended key usages as one chip list; a field taken from the CSR becomes a single dashed chip. */
function getUsageChips(profile: ApiSigningProfile): UsageChip[] {
  const chips: UsageChip[] = [];
  if (profile.honor_key_usage) {
    chips.push({ key: 'ku-csr', label: 'Key usage from CSR', kind: 'csr' });
  } else {
    chips.push(...(profile.key_usage ?? []).map(u => ({ key: `ku-${u}`, label: humanizeUsage(u), kind: 'ku' as const })));
  }
  if (profile.honor_extended_key_usages) {
    chips.push({ key: 'eku-csr', label: 'EKU from CSR', kind: 'csr' });
  } else {
    chips.push(...(profile.extended_key_usages ?? []).map(u => ({ key: `eku-${u}`, label: humanizeUsage(u), kind: 'eku' as const })));
  }
  return chips;
}

/** Wrapping chip list; with `max`, the tail collapses into a "+N" chip with a tooltip. */
function ChipList({ chips, max, empty = 'None' }: Readonly<{ chips: UsageChip[]; max?: number; empty?: string }>) {
  if (chips.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  const shown = max === undefined ? chips : chips.slice(0, max);
  const hidden = max === undefined ? [] : chips.slice(max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(chip => (
        <span
          key={chip.key}
          className={cn('inline-flex h-5 items-center rounded border px-1.5 text-[11px]', chipClass[chip.kind])}
        >
          {chip.label}
        </span>
      ))}
      {hidden.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-5 cursor-default items-center rounded border px-1.5 text-[11px] text-muted-foreground">
                +{hidden.length}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              {hidden.map(c => c.label).join(', ')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/** Validity and allowed key algorithms, shown at the top of both variants. */
function ValidityAndKeys({ profile }: Readonly<{ profile: ApiSigningProfile }>) {
  const validity = getValidity(profile);
  const cryptoTokens = getCryptoRules(profile);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6">
      <Field label="Validity">
        <p className="text-base font-semibold leading-tight tracking-tight tabular-nums">{validity.label}</p>
        {validity.hint && <p className="text-[11px] text-muted-foreground tabular-nums">{validity.hint}</p>}
      </Field>
      <Field label="Key algorithms">
        {cryptoTokens && cryptoTokens.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {cryptoTokens.map(t => (
              <Badge key={t} size="xs" variant="muted" className="font-mono text-foreground">{t}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-tight text-muted-foreground">
            {cryptoTokens ? 'None allowed' : 'Any algorithm'}
          </p>
        )}
      </Field>
    </div>
  );
}

/** Whether a field is pinned by the profile or copied from the CSR. */
function SourceTag({ honors }: Readonly<{ honors: boolean }>) {
  return (
    <Badge size="xs" variant={honors ? 'warning' : 'default'}>
      {honors ? <FileInput /> : <Lock />}
      {honors ? 'From CSR' : 'Enforced'}
    </Badge>
  );
}

// ─── Variant bodies ───────────────────────────────────────────────────────────

/** "Pinned · Key usage, Extensions" / "From CSR · Subject" */
function SourceLine({ icon: Icon, label, fields, className }: Readonly<{
  icon: LucideIcon; label: string; fields: string[]; className: string;
}>) {
  if (fields.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`${label}: ${fields.join(', ')}`}>
      <Icon className={cn('size-3 shrink-0', className)} />
      <span className={cn('shrink-0 font-medium', className)}>{label}</span>
      <span className="truncate text-muted-foreground">{fields.join(', ')}</span>
    </span>
  );
}

function CompactBody({ profile }: Readonly<{ profile: ApiSigningProfile }>) {
  const subjectSummary = getSubjectSummary(profile);
  const sources = [
    { name: 'Subject', honors: profile.honor_subject },
    { name: 'Key usage', honors: profile.honor_key_usage },
    { name: 'EKU', honors: profile.honor_extended_key_usages },
    { name: 'Extensions', honors: profile.honor_extensions },
  ];
  const pinned = sources.filter(s => !s.honors).map(s => s.name);
  const fromCsr = sources.filter(s => s.honors).map(s => s.name);

  return (
    <>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <ValidityAndKeys profile={profile} />
        <Field label="Usages">
          <ChipList chips={getUsageChips(profile)} max={MAX_USAGE_CHIPS} />
        </Field>
        {!profile.honor_subject && subjectSummary && (
          <Field label="Subject">
            <p className="truncate font-mono text-xs" title={subjectSummary}>{subjectSummary}</p>
          </Field>
        )}
      </div>
      <div className="mt-auto flex min-w-0 items-center gap-4 border-t bg-muted/40 px-3 py-2 text-[11px]">
        <SourceLine icon={Lock} label="Pinned" fields={pinned} className="text-primary" />
        <SourceLine icon={FileInput} label="From CSR" fields={fromCsr} className="text-amber-700 dark:text-amber-400" />
      </div>
    </>
  );
}

/** One ruled cell: icon + label with its Enforced / From CSR tag on the right, value underneath. */
function SpecCell({ icon: Icon, title, honors, children }: Readonly<{
  icon: LucideIcon; title: string; honors: boolean; children: React.ReactNode;
}>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3 shrink-0" />
          <span className="truncate">{title}</span>
        </span>
        <SourceTag honors={honors} />
      </div>
      <div className="min-w-0 text-xs text-foreground">{children}</div>
    </div>
  );
}

const fromRequest = <span className="text-muted-foreground">Taken from the request</span>;

function ExtendedBody({ profile }: Readonly<{ profile: ApiSigningProfile }>) {
  const subjectSummary = getSubjectSummary(profile);
  const keyUsages = (profile.key_usage ?? []).map(u => ({ key: u, label: humanizeUsage(u), kind: 'ku' as const }));
  const extendedKeyUsages = (profile.extended_key_usages ?? []).map(u => ({ key: u, label: humanizeUsage(u), kind: 'eku' as const }));

  return (
    <>
      <div className="p-3">
        <ValidityAndKeys profile={profile} />
      </div>
      <div className="mt-auto grid grid-cols-1 gap-px border-t bg-border @md/profile:grid-cols-2">
        <SpecCell icon={KeyRound} title="Key usage" honors={profile.honor_key_usage}>
          {profile.honor_key_usage ? fromRequest : <ChipList chips={keyUsages} />}
        </SpecCell>
        <SpecCell icon={Shield} title="Extended key usage" honors={profile.honor_extended_key_usages}>
          {profile.honor_extended_key_usages ? fromRequest : <ChipList chips={extendedKeyUsages} />}
        </SpecCell>
        <SpecCell icon={User} title="Subject" honors={profile.honor_subject}>
          {profile.honor_subject
            ? <span className="text-muted-foreground">Copied from the request</span>
            : 'Replaced by profile values'}
          {!profile.honor_subject && subjectSummary && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={subjectSummary}>
              {subjectSummary}
            </p>
          )}
        </SpecCell>
        <SpecCell icon={FileText} title="Extensions" honors={profile.honor_extensions}>
          {profile.honor_extensions ? fromRequest : 'Request extensions ignored'}
        </SpecCell>
      </div>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IssuanceProfileCardProps {
  profile: ApiSigningProfile;
  /** `compact` for lists (usages as one chip row, one-line source legend); `extended` adds a per-field breakdown. */
  variant?: 'compact' | 'extended';
  className?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewUsage?: () => void;
}

/**
 * Issuance-profile card in the style of the CA hierarchy card. With `onEdit` the card is
 * clickable and opens the profile.
 */
export function IssuanceProfileCard({
  profile, variant = 'extended', className, onEdit, onDelete, onViewUsage,
}: Readonly<IssuanceProfileCardProps>) {
  const hasMenu = Boolean(onEdit || onDelete || onViewUsage);
  const extended = variant === 'extended';
  const Body = onEdit ? 'button' : 'div';

  return (
    <div
      className={cn(
        '@container/profile group relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs transition-colors',
        onEdit && 'hover:border-ring/40 hover:bg-muted/30 focus-within:border-ring/40',
        className,
      )}
    >
      <Body
        {...(onEdit ? { type: 'button' as const, onClick: onEdit, title: `Open ${profile.name}` } : {})}
        className="flex flex-1 flex-col text-left focus-visible:outline-none"
      >
        {/* ── Identity ── */}
        <div className={cn('flex items-center gap-3 px-3 pt-3', hasMenu && 'pr-10')}>
          <EngineIconBox fallback={profile.sign_as_ca ? ShieldCheck : ScrollText} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium leading-tight">{profile.name}</p>
              <Badge size="xs" variant={profile.sign_as_ca ? 'default' : 'secondary'}>
                {profile.sign_as_ca ? 'CA' : 'End entity'}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground" title={profile.description || undefined}>
              {profile.description || 'No description'}
            </p>
          </div>
        </div>

        {extended ? <ExtendedBody profile={profile} /> : <CompactBody profile={profile} />}
      </Body>

      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="absolute right-1.5 top-2.5" title="Profile actions">
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
  );
}
