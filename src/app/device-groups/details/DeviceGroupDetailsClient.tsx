'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getDeviceGroupByID, deleteDeviceGroup } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { FilterCriteriaDisplay } from '@/components/device-groups/FilterCriteriaDisplay';
import { CompactGroupStats } from '@/components/device-groups/CompactGroupStats';
import { GroupMembersList } from '@/components/device-groups/GroupMembersList';

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

  useEffect(() => {
    const fetchGroup = async () => {
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

        // Fetch parent group if exists
        if (data.parent_id) {
          try {
            const parent = await getDeviceGroupByID(user.access_token, data.parent_id);
            setParentGroup(parent);
          } catch (err) {
            console.error('Failed to fetch parent group:', err);
            // Non-critical error, continue without parent info
            setParentGroup(null);
          }
        } else {
          // Reset parent group if current group has no parent
          setParentGroup(null);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch device group';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroup();
  }, [groupId, user?.access_token]);

  const handleDelete = async () => {
    if (!user?.access_token || !group) return;

    try {
      setIsDeleting(true);
      await deleteDeviceGroup(user.access_token, group.id);
      sileo.success({
        title: 'Success',
        description: `Device group "${group.name}" deleted successfully`
      });
      router.push('/device-groups');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete device group';
      sileo.error({
        title: 'Error',
        description: errorMessage
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading device group details...</p>
      </div>
    );
  }

  if (error || !groupId) {
    return (
      <div className="w-full space-y-4 p-4">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
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
      <div className="w-full space-y-4 p-4">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Device Group Not Found</AlertTitle>
          <AlertDescription>The device group with ID &quot;{groupId || 'Unknown'}&quot; could not be found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleRefresh = () => {
    if (user?.access_token && groupId) {
      // Fetch group data again
      const fetchGroup = async () => {
        try {
          setIsLoading(true);
          const data = await getDeviceGroupByID(user.access_token!, groupId);
          setGroup(data);

          if (data.parent_id) {
            try {
              const parent = await getDeviceGroupByID(user.access_token!, data.parent_id);
              setParentGroup(parent);
            } catch (err) {
              console.error('Failed to fetch parent group:', err);
              setParentGroup(null);
            }
          } else {
            // Reset parent group if current group has no parent
            setParentGroup(null);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to refresh device group';
          sileo.error({
            title: 'Error',
            description: errorMessage
          });
        } finally {
          setIsLoading(false);
        }
      };
      fetchGroup();
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <CompactGroupStats groupId={group.id} />
      </div>

      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center space-x-3">
            <div className={cn("p-1.5 rounded-md inline-flex items-center justify-center")} style={{ backgroundColor: '#F0F8FF' }}>
              <Monitor className={cn("h-5 w-5")} style={{ color: '#0f67ff' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{group.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {group.description || 'No description provided'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/device-groups/edit?groupId=${group.id}`)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={isDeleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
        {parentGroup && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Parent Group:</span>
            <Button
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => router.push(`/device-groups/details?groupId=${parentGroup.id}`)}
            >
              <FolderTree className="h-4 w-4 mr-1" />
              {parentGroup.name}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="members" className="w-full">
        <TabsList>
          <TabsTrigger value="members"><Monitor className="mr-2 h-4 w-4" />Devices</TabsTrigger>
          <TabsTrigger value="info"><Info className="mr-2 h-4 w-4" />Information</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <GroupMembersList groupId={group.id} />
        </TabsContent>

        <TabsContent value="info">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Group Information</CardTitle>
                <CardDescription>Basic metadata and hierarchy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Group ID</div>
                    <div className="font-mono text-sm">{group.id}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Parent Group</div>
                    {parentGroup ? (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-sm"
                        onClick={() => router.push(`/device-groups/details?groupId=${parentGroup.id}`)}
                      >
                        <FolderTree className="h-4 w-4 mr-1" />
                        {parentGroup.name}
                      </Button>
                    ) : (
                      <Badge variant="outline">Root Level</Badge>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Created
                    </div>
                    <div className="text-sm">
                      {formatDistanceToNow(new Date(group.created_at), { addSuffix: true })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(group.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Last Updated
                    </div>
                    <div className="text-sm">
                      {formatDistanceToNow(new Date(group.updated_at), { addSuffix: true })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(group.updated_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <FilterCriteriaDisplay 
              criteria={group.criteria} 
              inheritedCriteria={group.inherited_criteria}
            />
          </div>
        </TabsContent>
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
