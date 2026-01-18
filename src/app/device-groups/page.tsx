'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Search, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { getDeviceGroups, deleteDeviceGroup } from '@/lib/device-groups-api';
import type { DeviceGroup } from '@/types/device-group';
import { DeviceGroupsList } from '@/components/device-groups/DeviceGroupsList';
import { buildDeviceGroupTree } from '@/lib/device-groups-utils';

export default function DeviceGroupsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAllGroups = async () => {
    if (!user?.access_token) return;

    try {
      setIsLoading(true);
      setError(null);
      
      let allGroups: DeviceGroup[] = [];
      let bookmark: string | undefined = undefined;
      
      // Fetch all groups by following pagination
      do {
        const response = await getDeviceGroups(user.access_token, {
          pageSize: 100,
          bookmark,
          sortBy: 'name',
          sortMode: 'asc',
        });
        
        allGroups = [...allGroups, ...response.list];
        bookmark = response.next || undefined;
      } while (bookmark);

      setGroups(allGroups);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch device groups';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchAllGroups();
  };

  useEffect(() => {
    if (user?.access_token) {
      fetchAllGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.access_token]);

  const handleDelete = async (groupId: string) => {
    if (!user?.access_token) return;

    try {
      await deleteDeviceGroup(user.access_token, groupId);
      
      // Update UI after successful deletion
      setGroups(prev => prev.filter(g => g.id !== groupId));
      toast({
        title: 'Success',
        description: 'Device group deleted successfully',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete device group';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      // Refresh the list to restore UI state
      fetchAllGroups();
    }
  };

  // Filter groups based on search query (filter the flat list before building tree)
  const filteredFlatGroups = searchQuery
    ? groups.filter(group =>
        group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : groups;
  
  // Build tree from filtered groups for display
  const filteredHierarchicalGroups = buildDeviceGroupTree(filteredFlatGroups);

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <div className={cn("p-1.5 rounded-md inline-flex items-center justify-center")} style={{ backgroundColor: '#F0F8FF' }}>
            <Users className={cn("h-5 w-5")} style={{ color: '#0f67ff' }} />
          </div>
          <h1 className="text-2xl font-headline font-semibold">Device Groups</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </Button>
          <Button asChild disabled={isLoading}>
            <Link href="/device-groups/new">
              <Plus className="mr-2 h-4 w-4" />
              Create New Group
            </Link>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Organize devices with dynamic filter-based groups and hierarchical structures.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div className="space-y-1">
          <Label htmlFor="searchTermInput">Search Term</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              id="searchTermInput"
              type="text"
              placeholder="Filter by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10"
              disabled={isLoading}
            />
          </div>
        </div>

      </div>

      {isLoading && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading device groups...</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Fetching Device Groups</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && groups.length > 0 && (
        <div className={cn("overflow-x-auto transition-opacity duration-300", isLoading && "opacity-50 pointer-events-none")}>
          <DeviceGroupsList
            groups={filteredHierarchicalGroups}
            onDelete={handleDelete}
          />
        </div>
      )}

      {!error && !isLoading && groups.length === 0 && (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">
            No Device Groups Yet
          </h3>
          <p className="text-sm text-muted-foreground">
            There are no device groups registered in the system yet.
          </p>
          <Button asChild className="mt-4">
            <Link href="/device-groups/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Device Group
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
