'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, FolderTree } from 'lucide-react';
import { getDeviceGroups } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';

interface ParentGroupSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  excludeGroupId?: string; // Exclude this group to prevent self-selection
  error?: string;
}

export function ParentGroupSelector({
  value,
  onChange,
  excludeGroupId,
  error,
}: ParentGroupSelectorProps) {
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGroups = async () => {
      
      try {
        setIsLoading(true);
        setLoadError(null);
        const response = await getDeviceGroups({
          pageSize: 100,
          sortBy: 'name',
          sortMode: 'asc',
        });

        // Filter out the current group to prevent self-selection
        const availableGroups = excludeGroupId
          ? response.list.filter((g) => g.id !== excludeGroupId)
          : response.list;

        setGroups(availableGroups);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch groups';
        setLoadError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroups();
  }, [excludeGroupId]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Parent Group (Optional)</Label>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-2">
        <Label>Parent Group (Optional)</Label>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="parent-group">Parent Group (Optional)</Label>
      <Select
        value={value || 'none'}
        onValueChange={(val) => onChange(val === 'none' ? null : val)}
      >
        <SelectTrigger id="parent-group" className={error ? 'border-destructive' : ''}>
          <SelectValue placeholder="Select parent group or leave as root" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-muted-foreground" />
              <span>No Parent (Root Level)</span>
            </div>
          </SelectItem>
          {groups.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Available Groups
              </div>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <span>{group.name}</span>
                    {group.description && (
                      <span className="text-xs text-muted-foreground truncate max-w-xs">
                        - {group.description}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Select a parent group to create a hierarchical structure, or leave empty for a root-level
        group.
      </p>
    </div>
  );
}
