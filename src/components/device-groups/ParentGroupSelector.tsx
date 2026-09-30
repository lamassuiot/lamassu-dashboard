'use client';

import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, FolderTree, Layers } from 'lucide-react';
import { buildDeviceGroupTree, getDescendantIds, type DeviceGroupNode } from '@/lib/device-groups-utils';
import type { DeviceGroup } from '@/types/device-group';
import { FormFieldError } from '@/components/shared/FormValidationSummary';

const NO_PARENT = '__none__';

interface ParentGroupSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  groups: DeviceGroup[];
  isLoading: boolean;
  loadError: string | null;
  /** Group being edited: it and its descendants cannot become its parent. */
  excludeGroupId?: string;
  error?: string;
}

export function ParentGroupSelector({
  value,
  onChange,
  groups,
  isLoading,
  loadError,
  excludeGroupId,
  error,
}: Readonly<ParentGroupSelectorProps>) {
  const options = useMemo(() => {
    const excluded = excludeGroupId ? new Set([excludeGroupId, ...getDescendantIds(groups, excludeGroupId)]) : new Set<string>();
    const flat: DeviceGroupNode[] = [];
    const walk = (node: DeviceGroupNode) => {
      if (excluded.has(node.id)) return;
      flat.push(node);
      node.children.forEach(walk);
    };
    buildDeviceGroupTree(groups).forEach(walk);
    return flat;
  }, [groups, excludeGroupId]);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Label>Parent group</Label>
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-1.5">
        <Label>Parent group</Label>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="parent-group">Parent group</Label>
      <Select value={value || NO_PARENT} onValueChange={(val) => onChange(val === NO_PARENT ? null : val)}>
        <SelectTrigger id="parent-group" className="w-full" aria-invalid={!!error} aria-describedby={error ? 'parent-group-error' : 'parent-group-help'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={NO_PARENT}>
            <Layers className="text-muted-foreground" />
            <span>None (top-level group)</span>
          </SelectItem>
          {options.length > 0 && <SelectSeparator />}
          {options.map((group) => (
            <SelectItem key={group.id} value={group.id} style={{ paddingLeft: `${8 + group.level * 16}px` }}>
              <FolderTree className="text-muted-foreground" />
              <span className="truncate">{group.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <FormFieldError id="parent-group-error" title={`${error}.`} />}
      <p id="parent-group-help" className="text-xs text-muted-foreground">
        A subgroup contains only devices that also match every rule of its parent groups.
      </p>
    </div>
  );
}
