
// src/app/updates/create_update/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Package, MoreVertical, GitFork, Download, Trash2, FileText, PlusCircle, RefreshCw, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
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
import { UpdatePackForm } from '@/components/iot/update-pack-form';
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
  onInitiateNewVersionFromTable,
  isLoading,
  error,
  data,
  refetch,
}: {
  onInitiateNewVersionFromTable: (pack: UpdatePack) => void;
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
      <Card>
        <CardHeader>
          <CardTitle>Existing Update Packs</CardTitle>
          <CardDescription>Loading update packs...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
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
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Existing Update Packs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-center py-4">Error loading update packs: {error.message}</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <>
    <Card>
      <CardHeader className="flex flex-row justify-between items-center">
        <div>
          <CardTitle>Existing Update Packs</CardTitle>
          <CardDescription>List of update packs. Select an action or use the tabs above.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button>
      </CardHeader>
      <CardContent>
        {displayPacks.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Descriptor</TableHead>
                <TableHead className="w-[180px]">Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayPacks.map((pack) => {
                const downloadFilename = (pack.name && pack.version != null) 
                                      ? `${pack.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}_v${pack.version}.swu` 
                                      : 'update.swu';
                return (
                  <TableRow key={pack.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {pack.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">v{pack.version}</Badge>
                    </TableCell>
                    <TableCell>{pack.type}</TableCell>
                    <TableCell>{pack.descriptorFileName || 'N/A'}</TableCell>
                    <TableCell>{pack.formattedCreatedAt || "Loading date..."}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onInitiateNewVersionFromTable(pack)}>
                            <GitFork className="mr-2 h-4 w-4" /> Create New Version
                          </DropdownMenuItem>
                           {pack.descriptorFileName && pack.descriptorContent && (
                            <DropdownMenuItem onClick={() => setPackForDescriptorView(pack)}>
                              <FileText className="mr-2 h-4 w-4" /> View Descriptor
                            </DropdownMenuItem>
                          )}
                          {pack.uri && (
                            <DropdownMenuItem asChild>
                              <a 
                                href={pack.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                download={downloadFilename}
                              >
                                <Download className="mr-2 h-4 w-4" /> Download SWU File
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                            onClick={() => setPackToDelete(pack)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
      </CardContent>
    </Card>
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
  type FormMode = 'new' | 'newVersion' | 'edit'; 
  type TabValue = 'new' | 'newVersion';

  const { selectedDms } = useDms();
  const { user } = useAuth();
  
  const queryClient = useQueryClient();

  const { data: fetchedUpdatePacks, error: fetchError, isLoading: isFetching, refetch } = useQuery<UpdatePack[], Error>({
    queryKey: ['updatePacks', selectedDms?.id],
    queryFn: () => fetchUpdatePacks({ dmsId: selectedDms!.id, accessToken: user!.access_token! }),
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

  const [activeTab, setActiveTab] = useState<TabValue>('new');
  const [formMode, setFormMode] = useState<FormMode>('new');
  const [packForForm, setPackForForm] = useState<UpdatePack | undefined>(undefined);
  const [selectedBasePackId, setSelectedBasePackId] = useState<string | undefined>(undefined);
  
  const handleTabChange = useCallback((newTab: TabValue) => {
    setActiveTab(newTab);
    if (newTab === 'new') {
        setFormMode('new');
        setPackForForm(undefined);
        setSelectedBasePackId(undefined);
    } else { // newVersion
        setFormMode('newVersion');
        setPackForForm(undefined);
        setSelectedBasePackId(undefined);
    }
  }, []);
  
  const handleInitiateNewVersionFromTable = (basePack: UpdatePack) => {
    setActiveTab('newVersion');
    setFormMode('newVersion');
    const newVersionPackData = {
      ...basePack,
      version: (Number(basePack.version) || 0) + 1,
      id: '', 
      createdAt: new Date().toISOString(),
      binaryFileName: undefined,
      descriptorFileName: undefined,
      descriptorContent: undefined,
      uri: undefined, 
    };
    setPackForForm(newVersionPackData); 
    setSelectedBasePackId(basePack.id); 
  };
  
  const handleSwuGenerated = () => {
    refetch();
    handleTabChange('new'); // Reset to the 'new' tab after success
  };
  
  if (!selectedDms) {
    return (
        <div className="flex items-center justify-center p-8">
            <p className="text-muted-foreground">Please select a Device Management System above to manage update packs.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Create Update Pack</CardTitle>
          <CardDescription>
            Choose to create a brand new pack or a new version of an existing one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as TabValue)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">Create New Pack</TabsTrigger>
              <TabsTrigger value="newVersion">Create New Version</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>
      
      <UpdatePackForm
        formModeActual={formMode}
        initialPackData={packForForm}
        availableBasePacks={fetchedUpdatePacks || []}
        selectedBasePackIdProp={selectedBasePackId}
        onBasePackSelect={(id) => {
            setSelectedBasePackId(id);
            const basePack = (fetchedUpdatePacks || []).find(p => p.id === id);
            if(basePack) handleInitiateNewVersionFromTable(basePack);
            else setPackForForm(undefined);
        }}
        onSwuGenerated={handleSwuGenerated}
      />
      
      <ExistingUpdatePacks
        onInitiateNewVersionFromTable={handleInitiateNewVersionFromTable}
        isLoading={isFetching}
        error={fetchError}
        data={fetchedUpdatePacks}
        refetch={refetch}
      />
    </div>
  );
}
