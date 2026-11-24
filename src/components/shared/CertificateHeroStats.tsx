'use client';

import React from 'react';
import Link from '@/components/shared/RouterLink';
import { differenceInDays, isPast, parseISO } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { DetailHeroStat } from '@/components/shared/DetailHero';
import { cn } from '@/lib/utils';

type DnPart = { label: string; value: string };

/** The CN, when present, always leads; the other parts keep their order. */
const cnFirst = (parts: DnPart[]): DnPart[] => [
  ...parts.filter(part => part.label === 'CN'),
  ...parts.filter(part => part.label !== 'CN'),
];

const DN_CHIP_CLASS = 'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground';

interface IssuerStatProps {
  /** Parsed issuer DN parts (see `parseDistinguishedName`). */
  parts: DnPart[];
  /** Fallback shown when no DN parts are available. */
  displayName: string;
  /** Issuer CA details page, when the issuer is a known CA. */
  href?: string;
}

/** Hero strip cell showing the issuer DN as labelled chips, with a link to the issuing CA. */
export function IssuerStat({ parts, displayName, href }: Readonly<IssuerStatProps>) {
  const fallback = href
    ? <Link href={href} className="text-primary hover:underline">{displayName}</Link>
    : <p>{displayName}</p>;

  return (
    <DetailHeroStat
      label="Issuer"
      aside={href && (
        <Link href={href} className="text-xs font-medium text-primary hover:underline">
          View CA
        </Link>
      )}
    >
      {parts.length > 0 ? (
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {cnFirst(parts).map(({ label, value }) => (
            <div key={`${label}=${value}`} className="flex min-w-0 items-baseline gap-2">
              <dt className={DN_CHIP_CLASS}>{label}</dt>
              <dd className="truncate" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      ) : fallback}
    </DetailHeroStat>
  );
}

export interface DistinguishedNameRow {
  /** Full name, shown as the tooltip of `shortLabel`. */
  label: string;
  /** Abbreviation leading the row, such as "Iss". */
  shortLabel: string;
  parts: DnPart[];
  /** Shown when no DN parts are available. */
  fallback: React.ReactNode;
  /** Right-aligned at the end of the row, such as a "View CA" link. */
  aside?: React.ReactNode;
}

/**
 * Hero strip cell stacking several DNs (e.g. issuer, then subject), one row of chips each. Each
 * row is led by a short inline label instead of a heading, to keep the cell compact.
 */
export function DistinguishedNamesStat({ rows }: Readonly<{ rows: DistinguishedNameRow[] }>) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5 py-3 lg:px-6 lg:first:pl-0 lg:last:pr-1">
      {rows.map(({ label, shortLabel, parts, fallback, aside }) => (
        <div key={label} className="flex min-w-0 items-baseline gap-2 text-sm text-foreground">
          <abbr
            title={label}
            className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground no-underline"
          >
            {shortLabel}
          </abbr>
          <div className="min-w-0 flex-1">
            {parts.length > 0 ? (
              <dl aria-label={label} className="flex min-w-0 flex-wrap gap-x-3 gap-y-1.5">
                {cnFirst(parts).map(({ label: partLabel, value }) => (
                  <div key={`${partLabel}=${value}`} className="flex min-w-0 max-w-full items-baseline gap-1.5">
                    <dt className={DN_CHIP_CLASS}>{partLabel}</dt>
                    <dd className="truncate" title={value}>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : fallback}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      ))}
    </div>
  );
}

interface ValidityStatProps {
  validFrom?: string;
  validTo?: string;
  /** Used in the progress bar's accessible label, e.g. "certificate". */
  subject?: string;
  /** Cell label; defaults to "Validity period". */
  label?: string;
  /** Labels of the start and end dates; default to "Issued" and "Expires". */
  fromLabel?: string;
  toLabel?: string;
  /** The remaining time turns red when this many days or fewer are left; defaults to 30. */
  warnWithinDays?: number;
}

function remainingLabel({ expired, daysLeft }: { expired: boolean; daysLeft: number }): string {
  if (expired) return 'Expired';
  if (daysLeft === 0) return 'Expires today';
  return `${daysLeft}d remaining`;
}

function computeValidity(validFrom?: string, validTo?: string) {
  if (!validFrom || !validTo) return null;
  try {
    const from = parseISO(validFrom).getTime();
    const to = parseISO(validTo).getTime();
    const total = to - from;
    const elapsed = Date.now() - from;
    const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0;
    return {
      percent,
      daysLeft: differenceInDays(to, Date.now()),
      expired: isPast(parseISO(validTo)),
    };
  } catch {
    return null;
  }
}

/** Hero strip cell with a validity progress bar, remaining days and issued/expires dates. */
export function ValidityStat({
  validFrom,
  validTo,
  subject = 'certificate',
  label = 'Validity period',
  fromLabel = 'Issued',
  toLabel = 'Expires',
  warnWithinDays = 30,
}: Readonly<ValidityStatProps>) {
  const validity = computeValidity(validFrom, validTo);

  if (!validity || !validFrom || !validTo) {
    return (
      <DetailHeroStat label={label}>
        <span className="text-muted-foreground">Unavailable</span>
      </DetailHeroStat>
    );
  }

  return (
    <DetailHeroStat
      label={label}
      aside={
        <span className={cn(
          'text-xs font-medium tabular-nums',
          validity.expired || validity.daysLeft <= warnWithinDays ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {remainingLabel(validity)}
        </span>
      }
    >
      <div className="space-y-2 pt-1">
        <Progress
          value={validity.percent}
          className={cn('h-1.5 rounded-sm', validity.expired && '[&_[data-slot=progress-indicator]]:bg-destructive')}
          aria-label={`${validity.percent}% of the ${subject} validity period elapsed`}
        />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{fromLabel}</p>
            <DateDisplay date={validFrom} className="text-xs" />
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{toLabel}</p>
            <DateDisplay date={validTo} highlightExpired className="items-end text-xs" />
          </div>
        </div>
      </div>
    </DetailHeroStat>
  );
}
