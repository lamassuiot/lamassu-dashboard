'use client';

import { cn } from '@/lib/utils';
import { getFieldLabel, getFilterOperationLabel, normalizeFilterCriteria } from '@/lib/device-groups-utils';
import type { DeviceGroupFilterOption } from '@/types/device-group';

interface CriteriaRuleListProps {
  criteria: DeviceGroupFilterOption[];
  /** Inherited rules render dashed and muted to set them apart from the group's own rules. */
  inherited?: boolean;
  /** Adds a leading AND connector before the first rule (used when this list continues a previous one). */
  continues?: boolean;
  className?: string;
}

export function AndConnector({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn('flex items-center gap-2 py-1 pl-4', className)} aria-hidden>
      <span className="h-3 w-px bg-border" />
      <span className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
        AND
      </span>
    </div>
  );
}

/** Read-only rendering of filter rules as `Field operator value` rows joined by AND connectors. */
export function CriteriaRuleList({ criteria, inherited = false, continues = false, className }: Readonly<CriteriaRuleListProps>) {
  const rules = normalizeFilterCriteria(criteria);

  return (
    <ol className={cn('list-none', className)}>
      {rules.map((rule, index) => (
        <li key={`${rule.field}-${rule.operand}-${rule.value}-${index}`}>
          {(index > 0 || continues) && <AndConnector />}
          <div
            className={cn(
              'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-sm',
              inherited ? 'border-dashed bg-muted/30 text-muted-foreground' : 'bg-background',
            )}
          >
            <span className={cn('font-medium', !inherited && 'text-foreground')}>{getFieldLabel(rule.field)}</span>
            <span className="text-muted-foreground">{getFilterOperationLabel(rule.operand)}</span>
            <code className="min-w-0 break-all rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {rule.value || '(empty)'}
            </code>
          </div>
        </li>
      ))}
    </ol>
  );
}
