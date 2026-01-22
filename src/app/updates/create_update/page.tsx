// src/app/updates/create_update/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Package, GitFork, Trash2, PlusCircle, RefreshCw, PackagePlus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import type { UpdatePack } from '@/types/iot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUpdatePacks, deleteUpdatePackApi } from '@/lib/iot-api';
import { useDms } from '@/contexts/DmsContext';

interface DisplayUpdatePack extends UpdatePack {
  formattedCreatedAt?: string;
}

interface DescriptorViewDialogProps {
  pack: UpdatePack | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function DescriptorViewDialog({ pack, isOpen, onOpenChange }: DescriptorViewDialogProps) {
  if (!pack) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Descriptor: {pack.descriptorFileName}
          </DialogTitle>
          <DialogDescription>
            Content of the descriptor file for update pack: {pack.name} v{pack.version}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] rounded-md border p-3 bg-muted/30 my-4 shadow-inner">
          <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
            {pack.descriptorContent || "No descriptor content available or could not be loaded."}
          </pre>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ExistingUpdatePacks({
  isLoading,
  error,
  data,
  refetch,
}: {
  isLoading: boolean;
  error: Error | null;
  data: UpdatePack[] | undefined;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const [displayPacks, setDisplayPacks] = React.useState<DisplayUpdatePack[]>([]);
  const [packToDelete, setPackToDelete] = React.useState<UpdatePack | null>(null);
  const [packForDescriptorView, setPackForDescriptorView] = React.useState<UpdatePack | null>(null);
  const { user } = useAuth();
  const { selectedDms } = useDms();
  const router = useRouter();

  React.useEffect(() => {
    if (data) {
      const formatted = data.map(pack => ({
        ...pack,
        formattedCreatedAt: pack.createdAt ? format(new Date(pack.createdAt), "PPp") : "N/A"
      })).sort((a, b) => { 
        if (a.name.toLowerCase() < b.name.toLowerCase()) return -1;
        if (a.name.toLowerCase() > b.name.toLowerCase()) return 1;
        const versionA = typeof a.version === 'string' ? parseInt(a.version, 10) : a.version;
        const versionB = typeof b.version === 'string' ? parseInt(b.version, 10) : b.version;
        return versionB - versionA;
      });
      setDisplayPacks(formatted);
    } else {
      setDisplayPacks([]);
    }
  }, [data]);

  const deleteMutation = useMutation({
    mutationFn: (packName: string) => deleteUpdatePackApi({ dmsId: selectedDms!.id, packName, accessToken: user!.access_token! }),
    onSuccess: (data, packName) => {
      toast({
        title: "Update Pack Deleted",
        description: `Pack "${packName}" has been successfully deleted. ${data?.message || ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['updatePacks', selectedDms?.id] });
    },
    onError: (error: Error, packName) => {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: `Could not delete pack "${packName}". ${error.message}`,
      });
    },
    onSettled: () => {
      setPackToDelete(null);
    }
  });

  const handleDeleteConfirm = () => {
    if (packToDelete) {
      deleteMutation.mutate(packToDelete.name);
    }
  };


  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Existing Update Packs</h3>
        <p className="text-muted-foreground">Loading update packs...</p>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-2 border rounded-md">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1 flex-grow">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Existing Update Packs</h3>
        <p className="text-destructive text-center py-4">Error loading update packs: {error.message}</p>
      </div>
    );
  }
  
  return (
    <>
    <div className="space-y-4">
      <div className="flex flex-row justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Existing Update Packs</h3>
          <p className="text-muted-foreground">List of update packs. Select an action or use the tabs above.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
      </div>
        {displayPacks.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayPacks.map((pack) => {
                const downloadFilename = (pack.name && pack.version != null) 
                                      ? `${pack.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}_v${pack.version}.swu` 
                                      : 'update.swu';
                return (
                  <TableRow 
                    key={pack.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/updates/pack-details?packName=${encodeURIComponent(pack.name)}&dmsId=${selectedDms?.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span 
                          className="text-primary hover:text-primary/80 underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/updates/pack-details?packName=${encodeURIComponent(pack.name)}&dmsId=${selectedDms?.id}`);
                          }}
                        >
                          {pack.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">v{pack.version}</Badge>
                    </TableCell>
                    <TableCell>{pack.type}</TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-center py-4">
            No update packs found for DMS ID: {selectedDms?.id}.
          </p>
        )}
      </div>
      {packToDelete && (
        <AlertDialog open={!!packToDelete} onOpenChange={() => setPackToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this update pack?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the update pack
                "{packToDelete.name} v{packToDelete.version}".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPackToDelete(null)}>Cancel</AlertDialogCancel>
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
      )}
      <DescriptorViewDialog
        pack={packForDescriptorView}
        isOpen={!!packForDescriptorView}
        onOpenChange={(open) => { if (!open) setPackForDescriptorView(null); }}
      />
    </>
  );
}

export default function UpdatePacksPage() {

  const { selectedDms } = useDms();
  const { user } = useAuth();
  const router = useRouter();
  
  const queryClient = useQueryClient();

  const { data: fetchedUpdatePacks, error: fetchError, isLoading: isFetching, refetch } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', selectedDms?.id],
    queryFn: () => fetchUpdatePacks({ dmsId: selectedDms!.id, accessToken: user!.access_token! }, { pageSize: 50 }).then(res => res.list),
    enabled: !!selectedDms && !!user?.access_token,
    select: (data) => { 
      return data.map(pack => {
        return {
          ...pack,
          type: pack.type && pack.type.trim() !== "" ? pack.type : "rawfile", // 👈 fallback por defecto
          descriptorContent: pack.descriptorFileName
            ? JSON.stringify(
                {
                  packName: pack.name,
                  version: pack.version,
                  type: pack.type || "rawfile",
                  descriptorFile: pack.descriptorFileName,
                  files: [
                    pack.binaryFileName || "firmware.bin",
                    "config.json",
                    "metadata.xml"
                  ],
                  signature: "mock-signature-value-for-" + pack.name,
                  checksum: "mock-checksum-" + Math.random().toString(36).substring(7)
                },
                null,
                2
              )
            : undefined
        };
      });
    }
  });

  const [selectedBasePackId, setSelectedBasePackId] = useState<string | undefined>(undefined);
  
  if (!selectedDms) {
    return (
        <div className="flex items-center justify-center p-8">
            <p className="text-muted-foreground">Please select a Device Management System above to manage update packs.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with back button */}
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
          <h1 className="text-3xl font-bold tracking-tight">Create Update Pack</h1>
          <p className="text-muted-foreground mt-1">
            Create new firmware update packs or update existing ones.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Update Pack</CardTitle>
          <CardDescription>
            Choose to create a brand new pack or update an existing one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create New Pack Option */}
            <Card className="p-6 flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <PackagePlus className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="mb-2">Create New Update Pack</CardTitle>
                <CardDescription>
                  Start from scratch with a new firmware update package
                </CardDescription>
              </div>
              <div className="mt-6">
                <Button
                  onClick={() => router.push('/updates/create?mode=new')}
                  className="w-full"
                >
                  Create New Pack
                </Button>
              </div>
            </Card>

            {/* Create New Version Option */}
            <Card className="p-6 flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <GitFork className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="mb-2">Update Existing Pack</CardTitle>
                <CardDescription>
                  Create a new version based on an existing update pack
                </CardDescription>
              </div>
              <div className="mt-6 space-y-4">
                <Select
                  value={selectedBasePackId || ''}
                  onValueChange={(value) => {
                    setSelectedBasePackId(value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose an existing update pack to create a new version" />
                  </SelectTrigger>
                  <SelectContent>
                    {(fetchedUpdatePacks || []).map((pack) => (
                      <SelectItem key={pack.id} value={pack.id}>
                        {pack.name} v{pack.version} ({pack.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (selectedBasePackId) {
                      router.push(`/updates/create?mode=update&basePackId=${selectedBasePackId}`);
                    }
                  }}
                  disabled={!selectedBasePackId}
                  className="w-full"
                  variant={selectedBasePackId ? "default" : "secondary"}
                >
                  Update Selected Pack
                </Button>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>
      
      <ExistingUpdatePacks
        isLoading={isFetching}
        error={fetchError}
        data={fetchedUpdatePacks}
        refetch={refetch}
      />
    </div>
  );
}
