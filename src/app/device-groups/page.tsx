'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { sileo } from '@/lib/toast';
import { Layers, Plus, Search, AlertCircle, RefreshCw, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchAllDeviceGroups, deleteDeviceGroup } from '@/lib/device-groups-api';
import { getDescendantIds } from '@/lib/device-groups-utils';
import type { DeviceGroup } from '@/types/device-group';
import { DeviceGroupsList } from '@/components/device-groups/DeviceGroupsList';
import { DeleteDeviceGroupDialog } from '@/components/device-groups/DeleteDeviceGroupDialog';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { ExpandCollapseAllButton } from '@/components/shared/TreeTable';
import { useTreeCollapse } from '@/hooks/useTreeCollapse';

export default function DeviceGroupsPage() {
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [groupToDelete, setGroupToDelete] = useState<DeviceGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAllGroups = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setGroups(await fetchAllDeviceGroups());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch device groups');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllGroups();
  }, [fetchAllGroups]);

  const handleRefresh = () => {
    setStatsRefreshKey((key) => key + 1);
    fetchAllGroups();
  };

  const parentIds = useMemo(() => new Set(groups.map((g) => g.parent_id).filter((id): id is string => Boolean(id))), [groups]);
  const rootCount = groups.filter((g) => !g.parent_id).length;
  const { collapsedIds, toggle: toggleCollapsed, allCollapsed, toggleAll } = useTreeCollapse(parentIds);

  const descendantsToDelete = useMemo(() => {
    if (!groupToDelete) return [];
    const ids = getDescendantIds(groups, groupToDelete.id);
    return groups.filter((g) => ids.has(g.id));
  }, [groups, groupToDelete]);

  const handleDelete = async () => {
    if (!groupToDelete) return;
    const removedIds = new Set([groupToDelete.id, ...descendantsToDelete.map((g) => g.id)]);
    try {
      setIsDeleting(true);
      await deleteDeviceGroup(groupToDelete.id);
      setGroups((prev) => prev.filter((g) => !removedIds.has(g.id)));
      sileo.success({ title: 'Success', description: `Device group "${groupToDelete.name}" deleted successfully` });
    } catch (err) {
      sileo.error({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete device group' });
      fetchAllGroups();
    } finally {
      setIsDeleting(false);
      setGroupToDelete(null);
    }
  };

  return (
    <BreadcrumbPage className="space-y-6 pb-8" items={[{ label: 'Home', href: '/' }, { label: 'Device Groups' }]}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <Layers className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Device Groups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organize devices with dynamic, rule-based groups. Subgroups inherit every rule of their parents.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <Button onClick={handleRefresh} variant="secondary" disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
          <Button asChild>
            <Link href="/device-groups/new">
              <Plus className="mr-2 h-4 w-4" />
              Create New Group
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Fetching Device Groups</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <Button variant="link" onClick={handleRefresh} className="h-auto p-0">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading && groups.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading device groups...</p>
        </div>
      )}

      {!error && groups.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                aria-label="Search device groups"
                placeholder="Search by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {groups.length} group{groups.length === 1 ? '' : 's'}
                {rootCount !== groups.length && <> · {rootCount} top-level</>}
              </p>
              {parentIds.size > 0 && (
                <ExpandCollapseAllButton allCollapsed={allCollapsed} onToggle={toggleAll} disabled={Boolean(searchQuery.trim())} />
              )}
            </div>
          </div>

          <div className={cn('overflow-x-auto transition-opacity duration-300', isLoading && 'opacity-50 pointer-events-none')}>
            <DeviceGroupsList
              groups={groups}
              searchQuery={searchQuery}
              collapsedIds={collapsedIds}
              onToggleCollapsed={toggleCollapsed}
              onDelete={setGroupToDelete}
              statsRefreshKey={statsRefreshKey}
            />
          </div>
        </div>
      )}

      {!error && !isLoading && groups.length === 0 && (
        <div className="p-10 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Layers className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No device groups yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Groups collect devices automatically based on rules such as tags, status or metadata.
          </p>
          <Button asChild className="mt-4">
            <Link href="/device-groups/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Device Group
            </Link>
          </Button>
        </div>
      )}

      <DeleteDeviceGroupDialog
        group={groupToDelete}
        descendants={descendantsToDelete}
        open={groupToDelete !== null}
        onOpenChange={(open) => !open && !isDeleting && setGroupToDelete(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </BreadcrumbPage>
  );
}
