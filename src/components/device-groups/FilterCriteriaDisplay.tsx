'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Filter, ArrowDown } from 'lucide-react';
import { SectionHeader } from '@/components/shared/FormComponents';
import { cn } from '@/lib/utils';
import type { DeviceGroupFilterOption } from '@/types/device-group';
import { formatFilterCriteria, normalizeFilterCriteria } from '@/lib/device-groups-utils';

interface FilterCriteriaDisplayProps {
  criteria: DeviceGroupFilterOption[] | any[];
  inheritedCriteria?: DeviceGroupFilterOption[] | any[];
  className?: string;
}

export function FilterCriteriaDisplay({ criteria, inheritedCriteria, className }: FilterCriteriaDisplayProps) {
  // Normalize criteria to handle backend PascalCase properties
  const normalizedCriteria = normalizeFilterCriteria(criteria || []);
  const normalizedInheritedCriteria = normalizeFilterCriteria(inheritedCriteria || []);
  const hasDirectCriteria = normalizedCriteria.length > 0;
  const hasInheritedCriteria = normalizedInheritedCriteria.length > 0;
  
  const descriptionParts: string[] = [];
  if (hasDirectCriteria) descriptionParts.push(`${normalizedCriteria.length} direct filter${normalizedCriteria.length !== 1 ? 's' : ''}`);
  if (hasInheritedCriteria) descriptionParts.push(`${normalizedInheritedCriteria.length} inherited filter${normalizedInheritedCriteria.length !== 1 ? 's' : ''}`);
  const description = descriptionParts.length > 0 ? `${descriptionParts.join(' • ')} combined with AND logic` : 'Dynamic membership rules';

  if (!hasDirectCriteria && !hasInheritedCriteria) {
    return (
      <Card className={cn('overflow-hidden rounded-xl shadow-sm', className)}>
        <SectionHeader icon={Filter} title="Filter Criteria" description="Dynamic membership rules" />
        <CardContent className="p-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No filters defined. This group matches all devices in the system.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden rounded-xl shadow-sm', className)}>
      <SectionHeader icon={Filter} title="Filter Criteria" description={description} />
      <CardContent className="p-6 space-y-4">
        {/* Direct Criteria */}
        {hasDirectCriteria && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">Direct Filters</div>
            {normalizedCriteria.map((filter, index) => (
              <div
                key={`direct-${index}`}
                className="flex items-start gap-3 p-3 bg-muted rounded-lg border border-border"
              >
                {index > 0 && (
                  <div className="flex-shrink-0 mt-1">
                    <Badge variant="outline" className="text-xs">
                      AND
                    </Badge>
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-medium">
                    {formatFilterCriteria(filter.field, filter.operand, filter.value)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Field: <code className="px-1 py-0.5 bg-background rounded">{filter.field}</code>
                    {' • '}
                    Operation: <code className="px-1 py-0.5 bg-background rounded">{filter.operand}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inherited Criteria */}
        {hasInheritedCriteria && (
          <div className="space-y-2">
            {hasDirectCriteria && (
              <div className="flex items-center gap-2 py-2">
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline" className="text-xs">AND</Badge>
                <span className="text-xs text-muted-foreground">Filters inherited from parent groups</span>
              </div>
            )}
            <div className="text-sm font-semibold text-foreground">Inherited Filters</div>
            {normalizedInheritedCriteria.map((filter, index) => (
              <div
                key={`inherited-${index}`}
                className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-dashed border-border"
              >
                {index > 0 && (
                  <div className="flex-shrink-0 mt-1">
                    <Badge variant="outline" className="text-xs">
                      AND
                    </Badge>
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    {formatFilterCriteria(filter.field, filter.operand, filter.value)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Field: <code className="px-1 py-0.5 bg-background rounded">{filter.field}</code>
                    {' • '}
                    Operation: <code className="px-1 py-0.5 bg-background rounded">{filter.operand}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            <strong>Note:</strong> Devices are automatically included when they match all filter
            criteria. Group membership updates in real-time as device attributes change.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
