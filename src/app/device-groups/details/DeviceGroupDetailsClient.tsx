'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { sileo } from '@/lib/toast';
import {
  AlertCircle,
  Edit,
  Trash2,
  FolderTree,
  Loader2,
  Monitor,
  RefreshCw,
  Info,
  Users,
} from 'lucide-react';
import { getDeviceGroupByID, deleteDeviceGroup } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { FilterCriteriaDisplay } from '@/components/device-groups/FilterCriteriaDisplay';
import { CompactGroupStats } from '@/components/device-groups/CompactGroupStats';
import { GroupMembersList } from '@/components/device-groups/GroupMembersList';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DetailHero, DetailHeroActionsMenu, DetailHeroStat } from '@/components/shared/DetailHero';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { Badge } from '@/components/ui/badge';

const DEVICE_GROUP_CRUMBS = [
  { label: 'Home', href: '/' },
  { label: 'Device Groups', href: '/device-groups' },
];

export default function DeviceGroupDetailsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupId = searchParams.get('groupId');

  const [group, setGroup] = useState<DeviceGroup | null>(null);
  const [parentGroup, setParentGroup] = useState<DeviceGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const tabFromQuery = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(tabFromQuery || 'members');

  const fetchGroupData = useCallback(async () => {
    if (!groupId) {
      setIsLoading(false);
      setError('Missing group ID');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await getDeviceGroupByID(groupId);
      setGroup(data);
      if (data.parent_id) {
        try {
          const parent = await getDeviceGroupByID(data.parent_id);
          setParentGroup(parent);
        } catch {
          setParentGroup(null);
        }
      } else {
        setParentGroup(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch device group');
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => { fetchGroupData(); }, [fetchGroupData]);

  const handleDelete = async () => {
    if (!group) return;
    try {
      setIsDeleting(true);
      await deleteDeviceGroup(group.id);
      sileo.success({ title: 'Success', description: `Device group "${group.name}" deleted successfully` });
      router.push('/device-groups');
    } catch (err) {
      sileo.error({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete device group' });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
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

  const filterCount = group.criteria?.length ?? 0;
  const inheritedCount = group.inherited_criteria?.length ?? 0;

  return (
    <BreadcrumbPage
      className="space-y-5"
      items={[
        ...DEVICE_GROUP_CRUMBS,
        ...(parentGroup ? [{ label: parentGroup.name, href: `/device-groups/details?groupId=${parentGroup.id}` }] : []),
        { label: <Badge className="max-w-[320px] truncate">{group.name}</Badge> },
      ]}
    >
      <DetailHero
        icon={Users}
        title={group.name}
        idLabel="Group ID"
        id={group.id}
        meta={
          <Badge variant="secondary">
            {filterCount > 0 ? 'Dynamic Group' : 'Catch-All Group'}
          </Badge>
        }
        description={group.description || undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push(`/device-groups/edit?groupId=${group.id}`)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <DetailHeroActionsMenu ariaLabel="Device group actions">
              <DropdownMenuItem onClick={fetchGroupData} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
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
            <DetailHeroStat label="Parent group">
              {parentGroup ? (
                <Link
                  href={`/device-groups/details?groupId=${parentGroup.id}`}
                  className="flex min-w-0 items-center gap-1 text-primary hover:underline"
                >
                  <FolderTree className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{parentGroup.name}</span>
                </Link>
              ) : (
                <span className="text-muted-foreground">None (root level)</span>
              )}
            </DetailHeroStat>
            <DetailHeroStat label="Filter rules">
              {filterCount === 0 ? 'None (catch-all)' : `${filterCount} rule${filterCount !== 1 ? 's' : ''}`}
              {inheritedCount > 0 && (
                <span className="text-muted-foreground"> + {inheritedCount} inherited</span>
              )}
            </DetailHeroStat>
            <DetailHeroStat label="Created">
              <DateDisplay date={group.created_at} className="text-sm" />
            </DetailHeroStat>
            <DetailHeroStat label="Last updated">
              <DateDisplay date={group.updated_at} className="text-sm" />
            </DetailHeroStat>
          </>
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={pageTabsListClass}>
            {([
              { value: 'members', icon: Monitor, label: 'Devices' },
              { value: 'info', icon: Info, label: 'Information' },
            ] as { value: string; icon: React.ElementType; label: string }[]).map(({ value, icon: Icon, label }) => (
              <TabsTrigger key={value} value={value} className={pageTabsTriggerClass}>
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6 pb-6">
          <TabsContent value="members" className="mt-0">
            <GroupMembersList groupId={group.id} />
          </TabsContent>

          <TabsContent value="info" className="mt-0">
            {/* Section: General */}
            <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
              <div>
                <p className="font-semibold">General Information</p>
                <p className="mt-1 text-sm text-muted-foreground">Identity and lifecycle details for this group.</p>
              </div>
              <div className="lg:col-span-2">
                <div className="divide-y">
                  <div className="py-3 first:pt-0">
                    <p className="text-xs font-medium text-muted-foreground">Group ID</p>
                    <p className="mt-1 text-sm font-medium font-mono break-all">{group.id}</p>
                  </div>
                  <div className="py-3">
                    <p className="text-xs font-medium text-muted-foreground">Name</p>
                    <p className="mt-1 text-sm font-medium">{group.name}</p>
                  </div>
                  {group.description && (
                    <div className="py-3">
                      <p className="text-xs font-medium text-muted-foreground">Description</p>
                      <p className="mt-1 text-sm font-medium">{group.description}</p>
                    </div>
                  )}
                  <div className="py-3">
                    <p className="text-xs font-medium text-muted-foreground">Type</p>
                    <p className="mt-1 text-sm font-medium">{filterCount > 0 ? 'Dynamic Group' : 'Catch-All Group'}</p>
                  </div>
                  <div className="py-3">
                    <p className="text-xs font-medium text-muted-foreground">Created</p>
                    <div className="mt-1">
                      <DateDisplay date={group.created_at} showRelative className="text-sm font-medium" />
                    </div>
                  </div>
                  <div className="py-3 last:pb-0">
                    <p className="text-xs font-medium text-muted-foreground">Last Updated</p>
                    <div className="mt-1">
                      <DateDisplay date={group.updated_at} showRelative className="text-sm font-medium" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section: Hierarchy & Stats */}
            <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
              <div>
                <p className="font-semibold">Hierarchy & Statistics</p>
                <p className="mt-1 text-sm text-muted-foreground">Group placement and device membership counts.</p>
              </div>
              <div className="lg:col-span-2">
                <div className="divide-y">
                  <div className="py-3 first:pt-0">
                    <p className="text-xs font-medium text-muted-foreground">Level</p>
                    <p className="mt-1 text-sm font-medium">{parentGroup ? 'Child Group' : 'Root Group'}</p>
                  </div>
                  <div className="py-3">
                    <p className="text-xs font-medium text-muted-foreground">Parent Group</p>
                    {parentGroup ? (
                      <button
                        className="mt-1 text-sm font-medium text-primary hover:underline flex items-center gap-1"
                        onClick={() => router.push(`/device-groups/details?groupId=${parentGroup.id}`)}
                      >
                        <FolderTree className="h-3.5 w-3.5" />
                        {parentGroup.name}
                      </button>
                    ) : (
                      <p className="mt-1 text-sm font-medium text-muted-foreground">None (root level)</p>
                    )}
                  </div>
                  <div className="py-3">
                    <p className="text-xs font-medium text-muted-foreground">Filter Rules</p>
                    <p className="mt-1 text-sm font-medium">
                      {filterCount === 0 ? 'None (catch-all)' : `${filterCount} rule${filterCount !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="py-3 last:pb-0">
                    <p className="text-xs font-medium text-muted-foreground">Device Statistics</p>
                    <div className="mt-3">
                      <CompactGroupStats groupId={group.id} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Criteria */}
            {(filterCount > 0 || inheritedCount > 0) && (
              <>
                <Separator />
                <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                  <div>
                    <p className="font-semibold">Filter Criteria</p>
                    <p className="mt-1 text-sm text-muted-foreground">Rules that determine dynamic membership for this group.</p>
                  </div>
                  <div className="lg:col-span-2">
                    <FilterCriteriaDisplay
                      criteria={group.criteria}
                      inheritedCriteria={group.inherited_criteria}
                    />
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{group.name}&quot;? This action cannot be undone. Devices will not be deleted, only the group definition will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
