'use client';

import { Badge } from '@/components/ui/badge';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeviceGroupFilterOption } from '@/types/device-group';
import { formatFilterCriteria, normalizeFilterCriteria } from '@/lib/device-groups-utils';

interface FilterCriteriaDisplayProps {
  criteria: DeviceGroupFilterOption[] | any[];
  inheritedCriteria?: DeviceGroupFilterOption[] | any[];
  className?: string;
}

export function FilterCriteriaDisplay({ criteria, inheritedCriteria, className }: FilterCriteriaDisplayProps) {
  const normalizedCriteria = normalizeFilterCriteria(criteria || []);
  const normalizedInheritedCriteria = normalizeFilterCriteria(inheritedCriteria || []);
  const hasDirectCriteria = normalizedCriteria.length > 0;
  const hasInheritedCriteria = normalizedInheritedCriteria.length > 0;

  if (!hasDirectCriteria && !hasInheritedCriteria) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No filters defined. This group matches all devices in the system.
      </p>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {hasDirectCriteria && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Direct Filters</p>
          {normalizedCriteria.map((filter, index) => (
            <div key={`direct-${index}`} className="flex items-start gap-3">
              {index > 0 && (
                <Badge variant="secondary" className="text-xs shrink-0 mt-2.5">AND</Badge>
              )}
              <div className={cn('flex-1 rounded-lg border bg-muted/50 px-3 py-2.5 space-y-1', index > 0 && 'ml-0')}>
                <p className="text-sm font-medium">
                  {formatFilterCriteria(filter.field, filter.operand, filter.value)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Field: <code className="px-1 py-0.5 bg-background rounded">{filter.field}</code>
                  {' · '}
                  Operation: <code className="px-1 py-0.5 bg-background rounded">{filter.operand}</code>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasInheritedCriteria && (
        <div className="space-y-2">
          {hasDirectCriteria && (
            <div className="flex items-center gap-2 py-1">
              <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
              <Badge variant="secondary" className="text-xs">AND</Badge>
              <span className="text-xs text-muted-foreground">Inherited from parent groups</span>
            </div>
          )}
          <p className="text-xs font-medium text-muted-foreground">Inherited Filters</p>
          {normalizedInheritedCriteria.map((filter, index) => (
            <div key={`inherited-${index}`} className="flex items-start gap-3">
              {index > 0 && (
                <Badge variant="secondary" className="text-xs shrink-0 mt-2.5">AND</Badge>
              )}
              <div className="flex-1 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {formatFilterCriteria(filter.field, filter.operand, filter.value)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Field: <code className="px-1 py-0.5 bg-background rounded">{filter.field}</code>
                  {' · '}
                  Operation: <code className="px-1 py-0.5 bg-background rounded">{filter.operand}</code>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
