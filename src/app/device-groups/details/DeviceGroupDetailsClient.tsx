'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Edit,
  Trash2,
  Calendar,
  FolderTree,
  ArrowLeft,
  Loader2,
  Monitor,
  RefreshCw,
  Info,
  Users,
  Filter,
  Settings,
  Copy,
  Check,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getDeviceGroupByID, deleteDeviceGroup } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { FilterCriteriaDisplay } from '@/components/device-groups/FilterCriteriaDisplay';
import { CompactGroupStats } from '@/components/device-groups/CompactGroupStats';
import { GroupMembersList } from '@/components/device-groups/GroupMembersList';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { SectionHeader } from '@/components/shared/FormComponents';

export default function DeviceGroupDetailsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
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
    if (!user?.access_token || !groupId) {
      setIsLoading(false);
      setError('Missing group ID');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await getDeviceGroupByID(user.access_token, groupId);
      setGroup(data);

      if (data.parent_id) {
        try {
          const parent = await getDeviceGroupByID(user.access_token, data.parent_id);
          setParentGroup(parent);
        } catch (err) {
          console.error('Failed to fetch parent group:', err);
          setParentGroup(null);
        }
      } else {
        setParentGroup(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch device group';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, user?.access_token]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  const handleDelete = async () => {
    if (!user?.access_token || !group) return;

    try {
      setIsDeleting(true);
      await deleteDeviceGroup(user.access_token, group.id);
      sileo.success({
        title: 'Success',
        description: `Device group "${group.name}" deleted successfully`,
      });
      router.push('/device-groups');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete device group';
      sileo.error({ title: 'Error', description: errorMessage });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleRefresh = () => {
    fetchGroupData();
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
        <Button variant="outline" onClick={() => router.push('/device-groups')}>
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
        <Button variant="outline" onClick={() => router.push('/device-groups')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Device Groups
        </Button>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Device Group Not Found</AlertTitle>
          <AlertDescription>
            The device group with ID &quot;{groupId}&quot; could not be found.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const filterCount = group.criteria?.length ?? 0;

  return (
    <div className="w-full space-y-5">
      {/* Breadcrumb + actions row */}
      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Device Groups', href: '/device-groups' },
          {
            label: (
              <Badge variant="default" className="text-xs">
                {group.name}
              </Badge>
            ),
          },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="px-2.5">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleRefresh} disabled={isLoading}>
                  <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                  Refresh
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push(`/device-groups/edit?groupId=${group.id}`)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Hero header card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Accent bar */}
        <div className="h-1 w-full bg-primary" />

        <div className="p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            {/* Left: identity */}
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
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(group.id);
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 2000);
                      }}
                    >
                      {copiedId ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {filterCount > 0 ? 'Dynamic Group' : 'Catch-All Group'}
                  </Badge>

                  {parentGroup ? (
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        router.push(`/device-groups/details?groupId=${parentGroup.id}`)
                      }
                    >
                      <FolderTree className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{parentGroup.name}</span>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Root Level
                    </Badge>
                  )}
                </div>

                {group.description && (
                  <p className="text-sm text-muted-foreground">{group.description}</p>
                )}
              </div>
            </div>

            {/* Right: stats */}
            <div className="flex items-start gap-0 divide-x xl:shrink-0">
              {/* Filter Rules */}
              <div className="px-4 first:pl-0 xl:first:pl-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filter Rules</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">{filterCount}</p>
                <p className="text-xs text-muted-foreground">{filterCount === 1 ? 'Active criterion' : 'Active criteria'}</p>
              </div>

              {/* Hierarchy */}
              <div className="px-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hierarchy</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">{parentGroup ? 'Child' : 'Root'}</p>
                <p className="text-xs text-muted-foreground">{parentGroup ? `Under ${parentGroup.name}` : 'Top-level group'}</p>
              </div>


              {/* Device Statistics */}
              <div className="px-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Device Statistics</p>
                <CompactGroupStats groupId={group.id} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            {(
              [
                { value: 'members', icon: Monitor, label: 'Devices' },
                { value: 'info', icon: Info, label: 'Information' },
              ] as { value: string; icon: React.ElementType; label: string }[]
            ).map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
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
            <div className="space-y-6">
              <Card className="overflow-hidden rounded-xl shadow-sm">
                <SectionHeader
                  icon={Users}
                  title="Group Information"
                  description="Basic metadata and hierarchy details"
                />
                <CardContent className="p-6">
                  <div className="divide-y">
                    <div className="py-3 first:pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                          Group ID
                        </p>
                        <code className="font-mono text-sm break-all">{group.id}</code>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                          Parent Group
                        </p>
                        {parentGroup ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-sm"
                            onClick={() =>
                              router.push(`/device-groups/details?groupId=${parentGroup.id}`)
                            }
                          >
                            <FolderTree className="h-4 w-4 mr-1" />
                            {parentGroup.name}
                          </Button>
                        ) : (
                          <Badge variant="outline">Root Level</Badge>
                        )}
                      </div>
                    </div>

                    <div className="py-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Created
                        </p>
                        <p className="text-sm font-medium">
                          {formatDistanceToNow(new Date(group.created_at), { addSuffix: true })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(group.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Last Updated
                        </p>
                        <p className="text-sm font-medium">
                          {formatDistanceToNow(new Date(group.updated_at), { addSuffix: true })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(group.updated_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {group.description && (
                      <div className="py-3 last:pb-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                          Description
                        </p>
                        <p className="text-sm">{group.description}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <FilterCriteriaDisplay
                criteria={group.criteria}
                inheritedCriteria={group.inherited_criteria}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{group.name}&quot;? This action cannot be
              undone. Devices will not be deleted, only the group definition will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
