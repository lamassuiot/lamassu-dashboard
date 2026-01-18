'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Filter, ArrowDown } from 'lucide-react';
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
  
  if (!hasDirectCriteria && !hasInheritedCriteria) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter Criteria
          </CardTitle>
          <CardDescription>Dynamic membership rules</CardDescription>
        </CardHeader>
        <CardContent>
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
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filter Criteria
        </CardTitle>
        <CardDescription>
          {hasDirectCriteria && (
            <span>{normalizedCriteria.length} direct filter{normalizedCriteria.length !== 1 ? 's' : ''}</span>
          )}
          {hasDirectCriteria && hasInheritedCriteria && <span> • </span>}
          {hasInheritedCriteria && (
            <span>{normalizedInheritedCriteria.length} inherited filter{normalizedInheritedCriteria.length !== 1 ? 's' : ''}</span>
          )}
          {' '}combined with AND logic
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
