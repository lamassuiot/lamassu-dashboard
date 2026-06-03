'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Edit,
  Trash2,
  FolderTree,
  ArrowLeft,
  Loader2,
  Monitor,
  RefreshCw,
  Info,
  Users,
  Copy,
  Check,
  Tag,
} from 'lucide-react';
import { getDeviceGroupByID, deleteDeviceGroup } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { FilterCriteriaDisplay } from '@/components/device-groups/FilterCriteriaDisplay';
import { CompactGroupStats } from '@/components/device-groups/CompactGroupStats';
import { GroupMembersList } from '@/components/device-groups/GroupMembersList';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDisplayDateFormat } from '@/lib/config';

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
  const [copiedId, setCopiedId] = useState(false);
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
      <div className="w-full flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading device group details...</p>
      </div>
    );
  }

  if (error || !groupId) {
    return (
      <div className="w-full space-y-4">
        <Button variant="secondary" onClick={() => router.push('/device-groups')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Device Groups
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Device Group</AlertTitle>
          <AlertDescription>{error || 'Missing group ID'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="w-full space-y-4">
        <Button variant="secondary" onClick={() => router.push('/device-groups')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Device Groups
        </Button>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Device Group Not Found</AlertTitle>
          <AlertDescription>The device group with ID &quot;{groupId}&quot; could not be found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const filterCount = group.criteria?.length ?? 0;
  const dateFormat = getDisplayDateFormat(); // used by DateDisplay

  return (
    <div className="w-full space-y-5">
      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Device Groups', href: '/device-groups' },
          { label: 'Details' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={fetchGroupData} disabled={isLoading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/device-groups/edit?groupId=${group.id}`)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button
              variant="secondary"
             
              className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </div>
        }
      />

      {/* Hero */}
      <div className="pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/5">
            <Users className="h-6 w-6 text-primary" />
          </div>

          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">ID</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono truncate max-w-[360px]">
                  {group.id}
                </code>
                <Button
                  variant="ghost"
                 
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(group.id);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }}
                >
                  {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                {filterCount > 0 ? 'Dynamic Group' : 'Catch-All Group'}
              </span>
              {parentGroup ? (
                <button
                  className="inline-flex h-6 items-center gap-1 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  onClick={() => router.push(`/device-groups/details?groupId=${parentGroup.id}`)}
                >
                  <FolderTree className="h-3 w-3 shrink-0" />
                  {parentGroup.name}
                </button>
              ) : (
                <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                  Root Level
                </span>
              )}
              {group.description && (
                <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                  <Tag className="h-3 w-3 shrink-0" />
                  {group.description}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

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
                      <DateDisplay date={group.created_at} formatString={dateFormat} showRelative className="text-sm font-medium" />
                    </div>
                  </div>
                  <div className="py-3 last:pb-0">
                    <p className="text-xs font-medium text-muted-foreground">Last Updated</p>
                    <div className="mt-1">
                      <DateDisplay date={group.updated_at} formatString={dateFormat} showRelative className="text-sm font-medium" />
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
            {(group.criteria?.length > 0 || group.inherited_criteria?.length > 0) && (
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
    </div>
  );
}
