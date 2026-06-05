// src/app/updates/packs/page.tsx
"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Plus, ArrowLeft, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { fetchUpdatePacks } from '@/lib/iot-api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteUpdatePackApi } from '@/lib/iot-api';
import type { UpdatePack } from '@/types/iot';

export default function UpdatePacksPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { availableDms } = useDms();
  const queryClient = useQueryClient();
  const [packToDelete, setPackToDelete] = React.useState<(UpdatePack & { groupId: string; groupName: string }) | null>(null);

  // Fetch all update packs from all DMS instances
  const { data: allUpdatePacks = [], isLoading, error } = useQuery<(UpdatePack & { groupId: string; groupName: string })[], Error>({
    queryKey: ['allUpdatePacks'],
    queryFn: async ({ signal }) => {
      if (!user?.access_token || availableDms.length === 0) return [];

      const allPacksPromises = availableDms.map(dms =>
        fetchUpdatePacks({ groupId: dms.id, accessToken: user.access_token! }, { pageSize: 50 }, { signal })
          .then(response => response.list.map(pack => ({ ...pack, groupId: dms.id, groupName: dms.name })))
          .catch(() => []) // Return empty array on error for this DMS
      );

      const packsArrays = await Promise.all(allPacksPromises);
      return packsArrays.flat();
    },
    enabled: !!user?.access_token && availableDms.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (pack: UpdatePack & { groupId: string; groupName: string }) => 
      deleteUpdatePackApi({ groupId: pack.groupId, packName: pack.name, accessToken: user!.access_token! }),
    onSuccess: (data, pack) => {
      toast({
        title: "Update Pack Deleted",
        description: `Pack "${pack.name}" has been successfully deleted. ${data?.message || ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['allUpdatePacks'] });
    },
    onError: (error: Error, pack) => {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: `Could not delete pack "${pack.name}". ${error.message}`,
      });
    },
    onSettled: () => {
      setPackToDelete(null);
    }
  });

  const handlePackClick = (pack: UpdatePack & { groupId: string; groupName: string }) => {
    router.push(`/updates/pack-details?packName=${encodeURIComponent(pack.name)}&groupId=${pack.groupId}`);
  };

  const handleRowClick = (pack: UpdatePack & { groupId: string; groupName: string }) => {
    router.push(`/updates?packName=${encodeURIComponent(pack.name)}&groupId=${pack.groupId}`);
  };

  const handleDeleteConfirm = () => {
    if (packToDelete) {
      deleteMutation.mutate(packToDelete);
    }
  };

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/updates')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-8 w-8 text-primary" />
              Update Packs
            </h1>
            <p className="text-muted-foreground mt-1">
              Browse and manage all available firmware update packs.
            </p>
          </div>
        </div>
        <Button onClick={() => router.push('/updates/create_update')} className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Create New Update Pack
        </Button>
      </div>

      {/* Update Packs Table */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">All Update Packs</h2>
          <p className="text-muted-foreground">
            A list of all firmware update packs across all Device Groups.
          </p>
        </div>
        {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <p className="text-destructive flex items-center justify-center gap-2">
                Error loading update packs
              </p>
              <p className="text-destructive-foreground mb-2">{error.message}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead>Name & Version</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>SWU Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUpdatePacks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No update packs found. Create your first update pack to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    allUpdatePacks.map((pack) => (
                      <TableRow
                        key={`${pack.groupId}-${pack.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(pack)}
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{pack.groupName}</span>
                            <span className="text-xs text-muted-foreground">{pack.groupId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span 
                              className="font-medium cursor-pointer hover:underline text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePackClick(pack);
                              }}
                            >
                              {pack.name}
                            </span>
                            <span className="text-sm text-muted-foreground">v{pack.version}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {pack.type === 'rawfile' ? 'Raw firmware file' :
                             pack.type === 'firmware' ? 'Firmware update' :
                             `${pack.type} update`}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {pack.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pack.uri ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">Generated</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-destructive">
                              <XCircle className="h-4 w-4" />
                              <span className="text-xs">
                                {pack.generationError || `Error creating Version ${pack.version}, please create a new version`}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {pack.createdAt ? new Date(pack.createdAt).toLocaleDateString() : 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPackToDelete(pack);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
    </div>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={!!packToDelete} onOpenChange={() => setPackToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Update Pack</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the update pack "{packToDelete?.name}"? 
            This action cannot be undone and will remove the pack from the system.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDeleteConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}