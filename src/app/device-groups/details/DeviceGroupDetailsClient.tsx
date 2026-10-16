'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from '@/lib/router';
import Link from '@/components/shared/RouterLink';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { sileo } from '@/lib/toast';
import { AlertCircle, Edit, Trash2, FolderTree, FolderPlus, Loader2, Monitor, RefreshCw, Info, Layers, ListFilter } from 'lucide-react';
import { fetchAllDeviceGroups, getDeviceGroupByID, deleteDeviceGroup } from '@/lib/device-groups-api';
import { getAncestorChain, getDescendantIds } from '@/lib/device-groups-utils';
import type { DeviceGroup } from '@/types/device-group';
import { GroupMembersList } from '@/components/device-groups/GroupMembersList';
import { MembershipRulesView } from '@/components/device-groups/MembershipRulesView';
import { GroupHierarchyTree } from '@/components/device-groups/GroupHierarchyTree';
import { DeviceGroupStatusBar } from '@/components/device-groups/DeviceGroupStatusBar';
import { DeleteDeviceGroupDialog } from '@/components/device-groups/DeleteDeviceGroupDialog';
import { useDeviceGroupStats } from '@/hooks/useDeviceGroupStats';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DetailHero, DetailHeroActionsMenu, DetailHeroStat } from '@/components/shared/DetailHero';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { Badge } from '@/components/ui/badge';

const DEVICE_GROUP_CRUMBS = [
  { label: 'Home', href: '/' },
  { label: 'Device Groups', href: '/device-groups' },
];

type DetailTab = 'members' | 'rules' | 'hierarchy';

function parseTab(value: string | null): DetailTab {
  if (value === 'rules' || value === 'info') return 'rules';
  if (value === 'hierarchy') return 'hierarchy';
  return 'members';
}

function HeroDeviceStat({ groupId, refreshKey }: Readonly<{ groupId: string; refreshKey: number }>) {
  const { stats, isLoading, error } = useDeviceGroupStats(groupId, refreshKey);
  return (
    <DetailHeroStat label="Devices">
      {isLoading ? (
        <Skeleton className="h-9 w-32" />
      ) : error || !stats ? (
        <span className="text-muted-foreground">Unavailable</span>
      ) : (
        <div className="space-y-1.5">
          <p className="font-medium tabular-nums">{stats.total.toLocaleString()}</p>
          <DeviceGroupStatusBar stats={stats} className="max-w-[180px]" />
        </div>
      )}
    </DetailHeroStat>
  );
}

export default function DeviceGroupDetailsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupId = searchParams.get('groupId');

  const [group, setGroup] = useState<DeviceGroup | null>(null);
  const [allGroups, setAllGroups] = useState<DeviceGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>(parseTab(searchParams.get('tab')));

  const fetchGroupData = useCallback(async () => {
    if (!groupId) {
      setIsLoading(false);
      setError('Missing group ID');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const [data, groups] = await Promise.all([
        getDeviceGroupByID(groupId),
        // Hierarchy context is best-effort: the page still works without it.
        fetchAllDeviceGroups().catch(() => [] as DeviceGroup[]),
      ]);
      setGroup(data);
      setAllGroups(groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch device group');
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => { fetchGroupData(); }, [fetchGroupData]);

  // Reset to the default tab when navigating between groups (e.g. via the hierarchy tree).
  useEffect(() => { setActiveTab(parseTab(searchParams.get('tab'))); }, [groupId, searchParams]);

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1);
    fetchGroupData();
  };

  const groupsById = useMemo(() => new Map(allGroups.map((g) => [g.id, g])), [allGroups]);
  const ancestors = useMemo(() => (group ? getAncestorChain(group, groupsById) : []), [group, groupsById]);
  const descendants = useMemo(() => {
    if (!group) return [];
    const ids = getDescendantIds(allGroups, group.id);
    return allGroups.filter((g) => ids.has(g.id));
  }, [group, allGroups]);
  const directChildCount = descendants.filter((g) => g.parent_id === group?.id).length;

  const handleDelete = async () => {
    if (!group) return;
    try {
      setIsDeleting(true);
      await deleteDeviceGroup(group.id);
      sileo.success({ title: 'Success', description: `Device group "${group.name}" deleted successfully` });
      router.push('/device-groups');
    } catch (err) {
      sileo.error({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete device group' });
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading && !group) {
    return (
      <BreadcrumbPage items={DEVICE_GROUP_CRUMBS}>
        <div className="w-full flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading device group details...</p>
        </div>
      </BreadcrumbPage>
    );
  }

  if (error || !groupId) {
    return (
      <BreadcrumbPage className="space-y-4" items={DEVICE_GROUP_CRUMBS}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Device Group</AlertTitle>
          <AlertDescription>{error || 'Missing group ID'}</AlertDescription>
        </Alert>
      </BreadcrumbPage>
    );
  }

  if (!group) {
    return (
      <BreadcrumbPage className="space-y-4" items={DEVICE_GROUP_CRUMBS}>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Device Group Not Found</AlertTitle>
          <AlertDescription>The device group with ID &quot;{groupId}&quot; could not be found.</AlertDescription>
        </Alert>
      </BreadcrumbPage>
    );
  }

  const ownRuleCount = group.criteria?.length ?? 0;
  const inheritedCount = group.inherited_criteria?.length ?? 0;
  const parentGroup = ancestors.at(-1) ?? null;
  const isCatchAll = ownRuleCount + inheritedCount === 0;

  const tabs: { value: DetailTab; icon: React.ElementType; label: string; count?: number }[] = [
    { value: 'members', icon: Monitor, label: 'Devices' },
    { value: 'rules', icon: ListFilter, label: 'Membership Rules', count: ownRuleCount + inheritedCount },
    { value: 'hierarchy', icon: FolderTree, label: 'Hierarchy', count: descendants.length || undefined },
  ];

  return (
    <BreadcrumbPage
      className="space-y-5"
      items={[
        ...DEVICE_GROUP_CRUMBS,
        ...ancestors.map((ancestor) => ({ label: ancestor.name, href: `/device-groups/details?groupId=${ancestor.id}` })),
        { label: <Badge className="max-w-[320px] truncate">{group.name}</Badge> },
      ]}
    >
      <DetailHero
        icon={Layers}
        title={group.name}
        idLabel="Group ID"
        id={group.id}
        meta={
          <>
            <Badge variant="secondary">{isCatchAll ? 'Catch-all group' : 'Dynamic group'}</Badge>
            <Badge variant="secondary">{ancestors.length === 0 ? 'Top-level' : `Level ${ancestors.length + 1}`}</Badge>
            <span className="text-xs text-muted-foreground">
              Created <DateDisplay date={group.created_at} showRelative={false} className="text-xs" />
            </span>
          </>
        }
        description={group.description || undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push(`/device-groups/edit?groupId=${group.id}`)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <DetailHeroActionsMenu ariaLabel="Device group actions">
              <DropdownMenuItem onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/device-groups/new?parentId=${group.id}`}>
                  <FolderPlus className="mr-2 h-4 w-4" /> Add Subgroup
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete Group
              </DropdownMenuItem>
            </DetailHeroActionsMenu>
          </>
        }
        stats={
          <>
            <HeroDeviceStat groupId={group.id} refreshKey={refreshKey} />
            <DetailHeroStat
              label="Membership rules"
              aside={activeTab !== 'rules' && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setActiveTab('rules')}>View</button>
              )}
            >
              {isCatchAll ? (
                <span className="text-muted-foreground">None (matches all devices)</span>
              ) : (
                <>
                  {ownRuleCount} own
                  {inheritedCount > 0 && <span className="text-muted-foreground"> + {inheritedCount} inherited</span>}
                </>
              )}
            </DetailHeroStat>
            <DetailHeroStat label="Parent group">
              {parentGroup ? (
                <Link
                  href={`/device-groups/details?groupId=${parentGroup.id}`}
                  className="flex min-w-0 items-center gap-1 text-primary hover:underline"
                >
                  <FolderTree className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{parentGroup.name}</span>
                </Link>
              ) : group.parent_id ? (
                <Link href={`/device-groups/details?groupId=${group.parent_id}`} className="text-primary hover:underline">View parent</Link>
              ) : (
                <span className="text-muted-foreground">None (top-level)</span>
              )}
            </DetailHeroStat>
            <DetailHeroStat
              label="Subgroups"
              aside={descendants.length > 0 && activeTab !== 'hierarchy' && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setActiveTab('hierarchy')}>View</button>
              )}
            >
              {descendants.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                <>
                  {directChildCount} direct
                  {descendants.length > directChildCount && (
                    <span className="text-muted-foreground"> · {descendants.length} total</span>
                  )}
                </>
              )}
            </DetailHeroStat>
            <DetailHeroStat label="Last updated">
              <DateDisplay date={group.updated_at} className="text-sm" />
            </DetailHeroStat>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DetailTab)} className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={pageTabsListClass}>
            {tabs.map(({ value, icon: Icon, label, count }) => (
              <TabsTrigger key={value} value={value} className={pageTabsTriggerClass}>
                <Icon className="h-4 w-4" />
                {label}
                {count !== undefined && count > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6 pb-6">
          <TabsContent value="members" className="mt-0">
            <GroupMembersList groupId={group.id} refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="rules" className="mt-0">
            <MembershipRulesView group={group} ancestors={ancestors} />
          </TabsContent>

          <TabsContent value="hierarchy" className="mt-0">
            <GroupHierarchyTree group={group} ancestors={ancestors} descendants={descendants} refreshKey={refreshKey} />
          </TabsContent>
        </div>
      </Tabs>

      <DeleteDeviceGroupDialog
        group={group}
        descendants={descendants}
        open={deleteDialogOpen}
        onOpenChange={(open) => !isDeleting && setDeleteDialogOpen(open)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </BreadcrumbPage>
  );
}
