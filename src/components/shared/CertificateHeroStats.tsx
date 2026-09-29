'use client';

import React from 'react';
import Link from 'next/link';
import { differenceInDays, isPast, parseISO } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { DetailHeroStat } from '@/components/shared/DetailHero';
import { cn } from '@/lib/utils';

interface IssuerStatProps {
  /** Parsed issuer DN parts (see `parseDistinguishedName`). */
  parts: { label: string; value: string }[];
  /** Fallback shown when no DN parts are available. */
  displayName: string;
  /** Issuer CA details page, when the issuer is a known CA. */
  href?: string;
}

/** Hero strip cell showing the issuer DN as labelled chips, with a link to the issuing CA. */
export function IssuerStat({ parts, displayName, href }: IssuerStatProps) {
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
          {parts.map(({ label, value }) => (
            <div key={label} className="flex min-w-0 items-baseline gap-2">
              <dt className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground">{label}</dt>
              <dd className="truncate" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      ) : href ? (
        <Link href={href} className="text-primary hover:underline">{displayName}</Link>
      ) : (
        <p>{displayName}</p>
      )}
    </DetailHeroStat>
  );
}

interface ValidityStatProps {
  validFrom?: string;
  validTo?: string;
  /** Used in the progress bar's accessible label, e.g. "certificate". */
  subject?: string;
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
export function ValidityStat({ validFrom, validTo, subject = 'certificate' }: ValidityStatProps) {
  const validity = computeValidity(validFrom, validTo);

  if (!validity || !validFrom || !validTo) {
    return (
      <DetailHeroStat label="Validity period">
        <span className="text-muted-foreground">Unavailable</span>
      </DetailHeroStat>
    );
  }

  return (
    <DetailHeroStat
      label="Validity period"
      aside={
        <span className={cn(
          'text-xs font-medium tabular-nums',
          validity.expired || validity.daysLeft <= 30 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {validity.expired
            ? 'Expired'
            : validity.daysLeft === 0
            ? 'Expires today'
            : `${validity.daysLeft}d remaining`}
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
            <p className="text-xs text-muted-foreground">Issued</p>
            <DateDisplay date={validFrom} className="text-xs" />
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Expires</p>
            <DateDisplay date={validTo} highlightExpired className="items-end text-xs" />
          </div>
        </div>
      </div>
    </DetailHeroStat>
  );
}
