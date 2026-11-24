'use client';

import React from 'react';
import {
  Edit, FileInput, Lock, MoreVertical, ScrollText, ShieldCheck, Trash2, Users,
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
import { EngineIconBox } from '@/components/ca/EngineIconBox';
import { CardField, ChipList, humanizeUsage, type UsageChip } from '@/components/shared/CardSpecParts';
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

/** ["CN=device", "O=Acme"] from the pinned subject; empty when nothing is set. */
function getSubjectParts(profile: ApiSigningProfile): string[] {
  const s = profile.subject;
  if (!s) return [];
  return [
    s.common_name && `CN=${s.common_name}`,
    s.organization && `O=${s.organization}`,
    s.organization_unit && `OU=${s.organization_unit}`,
    s.locality && `L=${s.locality}`,
    s.state && `ST=${s.state}`,
    s.country && `C=${s.country}`,
  ].filter((part): part is string => Boolean(part));
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

const MAX_USAGE_CHIPS = 5;

/** Key usages and extended key usages the profile enforces, as one chip list; fields taken from the CSR are left out. */
function getUsageChips(profile: ApiSigningProfile): UsageChip[] {
  const chips: UsageChip[] = [];
  if (!profile.honor_key_usage) {
    chips.push(...(profile.key_usage ?? []).map(u => ({ key: `ku-${u}`, label: humanizeUsage(u), kind: 'ku' as const })));
  }
  if (!profile.honor_extended_key_usages) {
    chips.push(...(profile.extended_key_usages ?? []).map(u => ({ key: `eku-${u}`, label: humanizeUsage(u), kind: 'eku' as const })));
  }
  return chips;
}

/** Validity and allowed key algorithms, shown beside the profile name. */
function ValidityAndKeys({ profile }: Readonly<{ profile: ApiSigningProfile }>) {
  const validity = getValidity(profile);
  const cryptoTokens = getCryptoRules(profile);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6">
      <CardField label="Validity">
        <p className="text-base font-semibold leading-tight tracking-tight tabular-nums">{validity.label}</p>
        {validity.hint && <p className="text-[11px] text-muted-foreground tabular-nums">{validity.hint}</p>}
      </CardField>
      <CardField label="Key algorithms">
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
      </CardField>
    </div>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

/** "Overrides CSR · Key usage, Extensions" / "From CSR · Subject" */
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

function ProfileBody({ profile }: Readonly<{ profile: ApiSigningProfile }>) {
  const subjectParts = profile.honor_subject ? [] : getSubjectParts(profile);
  const showUsages = !profile.honor_key_usage || !profile.honor_extended_key_usages;
  const sources = [
    { name: 'Subject', honors: profile.honor_subject },
    { name: 'Key usage', honors: profile.honor_key_usage },
    { name: 'EKU', honors: profile.honor_extended_key_usages },
    { name: 'Extensions', honors: profile.honor_extensions },
  ];
  const overridden = sources.filter(s => !s.honors).map(s => s.name);
  const fromCsr = sources.filter(s => s.honors).map(s => s.name);

  return (
    <>
      {(showUsages || subjectParts.length > 0) && (
        <div className="flex flex-1 flex-col gap-3 px-3 pb-3">
          {showUsages && (
            <CardField label="Usages">
              <ChipList chips={getUsageChips(profile)} max={MAX_USAGE_CHIPS} variant="default" />
            </CardField>
          )}
          {subjectParts.length > 0 && (
            <CardField label="Subject">
              <div className="flex flex-wrap gap-1" title={subjectParts.join(', ')}>
                {subjectParts.map(part => (
                  <Badge key={part} size="xs" variant="default" className="max-w-full font-mono">
                    <span className="truncate">{part}</span>
                  </Badge>
                ))}
              </div>
            </CardField>
          )}
        </div>
      )}
      <div className="mt-auto flex min-w-0 items-center gap-4 bg-muted/40 px-3 py-2 text-[11px]">
        <SourceLine icon={Lock} label="Overrides CSR" fields={overridden} className="text-primary" />
        <SourceLine icon={FileInput} label="From CSR" fields={fromCsr} className="text-amber-700 dark:text-amber-400" />
      </div>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IssuanceProfileCardProps {
  profile: ApiSigningProfile;
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
  profile, className, onEdit, onDelete, onViewUsage,
}: Readonly<IssuanceProfileCardProps>) {
  const hasMenu = Boolean(onEdit || onDelete || onViewUsage);
  const Body = onEdit ? 'button' : 'div';

  return (
    <div
      className={cn(
        '@container/profile group relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm ring-1 ring-foreground/[0.06] transition-[box-shadow,background-color]',
        onEdit && 'hover:bg-muted/30 hover:shadow-md hover:ring-ring/40 focus-within:ring-ring/40',
        className,
      )}
    >
      <Body
        {...(onEdit ? { type: 'button' as const, onClick: onEdit, title: `Open ${profile.name}` } : {})}
        className="flex flex-1 flex-col text-left focus-visible:outline-none"
      >
        {/* ── Identity, with validity & key algorithms on the right when the card is wide enough ── */}
        <div className="grid gap-3 p-3 @lg/profile:grid-cols-[minmax(0,1fr)_auto] @lg/profile:items-center">
          <div className={cn('flex min-w-0 items-center gap-3', hasMenu && 'pr-8 @lg/profile:pr-0')}>
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
          <div className={cn(hasMenu && '@lg/profile:pr-8')}>
            <ValidityAndKeys profile={profile} />
          </div>
        </div>

        <ProfileBody profile={profile} />
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
