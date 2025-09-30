
// src/app/(app)/update-packs/page.tsx
"use client";
import React from 'react';
import { UpdatePackForm } from '@/components/iot/update-pack-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Package, MoreVertical, GitFork, Download, Trash2, FileText } from 'lucide-react';
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
} from "@/components/ui/alert-dialog"
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


export const DMS_ID_FOR_API = 'ECS_DEMO'; 

interface DisplayUpdatePack extends UpdatePack {
  formattedCreatedAt?: string;
}

// Service function to fetch update packs
async function fetchUpdatePacks(dmsId: string): Promise<UpdatePack[]> {
  const response = await fetch(`/api/dms/${dmsId}/updatepacks`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Network response was not ok' }));
    throw new Error(errorData.message || 'Failed to fetch update packs');
  }
  return response.json();
}

// Service function to delete an update pack
async function deleteUpdatePackApi({ dmsId, packName }: { dmsId: string; packName: string }): Promise<any> {
  const response = await fetch(`/api/dms/${dmsId}/updatepacks/${packName}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => `Failed to read error body`);
    let errorDetails = errorBody;
    try {
        const parsedError = JSON.parse(errorBody);
        errorDetails = parsedError.message || parsedError.details || errorBody;
    } catch (e) { /* ignore */ }
    throw new Error(errorDetails || `Failed to delete pack ${packName}`);
  }
  return response.json();
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
}: {
  onInitiateNewVersionFromTable: (pack: UpdatePack) => void;
  isLoading: boolean;
  error: Error | null;
  data: UpdatePack[] | undefined;
}) {
  const queryClient = useQueryClient();
  const [displayPacks, setDisplayPacks] = React.useState<DisplayUpdatePack[]>([]);
  const [packToDelete, setPackToDelete] = React.useState<UpdatePack | null>(null);
  const [packForDescriptorView, setPackForDescriptorView] = React.useState<UpdatePack | null>(null);

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
    mutationFn: deleteUpdatePackApi,
    onSuccess: (data, variables) => {
      toast({
        title: "Update Pack Deleted",
        description: `Pack "${variables.packName}" has been successfully deleted. ${data?.message || ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['updatePacks', DMS_ID_FOR_API] });
    },
    onError: (error: Error, variables) => {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: `Could not delete pack "${variables.packName}". ${error.message}`,
      });
    },
    onSettled: () => {
      setPackToDelete(null);
    }
  });

  const handleDeleteConfirm = () => {
    if (packToDelete) {
      deleteMutation.mutate({ dmsId: DMS_ID_FOR_API, packName: packToDelete.name });
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
      <CardHeader>
        <CardTitle>Existing Update Packs</CardTitle>
        <CardDescription>List of update packs. Select an action or use the tabs above.</CardDescription>
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
            No update packs found for DMS ID: {DMS_ID_FOR_API}.
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

  const queryClient = useQueryClient();
  const { data: fetchedUpdatePacks, error: fetchError, isLoading: isFetching, refetch } = useQuery<UpdatePack[], Error, UpdatePack[]>({
    queryKey: ['updatePacks', DMS_ID_FOR_API],
    queryFn: () => fetchUpdatePacks(DMS_ID_FOR_API),
    select: (data) => { 
      return data.map(pack => {
        if (pack.descriptorFileName) {
          // Add mock descriptor content for prototyping
          return {
            ...pack,
            descriptorContent: JSON.stringify({
              packName: pack.name,
              version: pack.version,
              type: pack.type,
              descriptorFile: pack.descriptorFileName,
              files: [
                pack.binaryFileName || "firmware.bin",
                "config.json",
                "metadata.xml"
              ],
              signature: "mock-signature-value-for-" + pack.name,
              checksum: "mock-checksum-" + Math.random().toString(36).substring(7)
            }, null, 2)
          };
        }
        return pack;
      });
    }
  });
  
  // Target states for pending transitions
  const [targetTab, setTargetTab] = React.useState<TabValue>('new');
  const [targetSelectedBasePackId, setTargetSelectedBasePackId] = React.useState<string | undefined>(undefined);
  const [targetPackForForm, setTargetPackForForm] = React.useState<UpdatePack | undefined>(undefined);
  const [targetFormMode, setTargetFormMode] = React.useState<FormMode>('new');
  
  // Animation and form instance key
  const [currentAnimationClass, setCurrentAnimationClass] = React.useState<string>('');
  const [formInstanceKey, setFormInstanceKey] = React.useState<number>(Date.now()); 
  
  // Active states driving the form
  const [activeFormMode, setActiveFormMode] = React.useState<FormMode>('new');
  const [activePackForForm, setActivePackForForm] = React.useState<UpdatePack | undefined>(undefined);
  const [activeSelectedBasePackId, setActiveSelectedBasePackId] = React.useState<string | undefined>(undefined);
  
  const prevActiveFormModeRef = React.useRef<FormMode>(activeFormMode);

  const [tabsComponentValue, setTabsComponentValue] = React.useState<TabValue>('new');


  React.useEffect(() => {
    // Initialize based on target states or defaults
    const initialAnimation = tabsComponentValue === 'newVersion' ? 'animate-slide-in-from-right' : 'animate-slide-in-from-left';
    setCurrentAnimationClass(initialAnimation); // Apply initial animation
    
    setActiveFormMode(targetFormMode); 
    setActivePackForForm(targetPackForForm); 
    setActiveSelectedBasePackId(targetSelectedBasePackId); 
    
    prevActiveFormModeRef.current = targetFormMode; // Update ref for next transition logic
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount to set up initial state


  const triggerFormTransition = (newTab: TabValue, newMode: FormMode, newPackData?: UpdatePack, newBaseId?: string) => {
    // Determine slide-out direction based on current tab (tabsComponentValue, which reflects the "from" state)
    let slideOutAnimation = 'animate-slide-out-to-left'; // Default for 'new' tab or initial
    if (tabsComponentValue === 'newVersion') { // If currently on 'newVersion' tab, slide out to right
        slideOutAnimation = 'animate-slide-out-to-right';
    }
    
    setCurrentAnimationClass(slideOutAnimation);

    // After slide-out animation (or immediately if no duration)
    setTimeout(() => {
      setTabsComponentValue(newTab); // Update tab visual state first
      
      setActiveFormMode(newMode);
      setActivePackForForm(newPackData);
      setActiveSelectedBasePackId(newBaseId);
      
      // Determine slide-in direction based on the newTab (the "to" state)
      let slideInAnimation = 'animate-slide-in-from-left'; // Default for 'new' tab
      if (newTab === 'newVersion') { // If moving to 'newVersion' tab, slide in from right
        slideInAnimation = 'animate-slide-in-from-right';
      }
      
      setCurrentAnimationClass(slideInAnimation);
      setFormInstanceKey(Date.now()); // Force re-render of form for clean state
      prevActiveFormModeRef.current = newMode; // Update ref for future transitions
    }, 0); // Timeout 0 to allow DOM to update from slide-out before slide-in
  };
  

  const handleTabChangeRequest = (newTabValue: TabValue) => {
    if (newTabValue === tabsComponentValue) {
        // If clicking the same tab, reset its form to default (unless it's already in default new/newVersion state)
        if (newTabValue === 'new' && activeFormMode === 'new') return; // Already on 'new' default
        if (newTabValue === 'newVersion' && activeFormMode === 'newVersion' && !activeSelectedBasePackId) return; // Already on 'newVersion' default
    }
    
    setTargetTab(newTabValue); 
    if (newTabValue === 'new') {
      setTargetSelectedBasePackId(undefined);
      setTargetPackForForm(undefined);
      setTargetFormMode('new');
      triggerFormTransition(newTabValue, 'new', undefined, undefined);
    } else { // newTabValue === 'newVersion'
      setTargetPackForForm(undefined); 
      setTargetFormMode('newVersion');
      setTargetSelectedBasePackId(undefined); // Reset selected base pack when tab is clicked directly
      triggerFormTransition(newTabValue, 'newVersion', undefined, undefined);
    }
  };
  
  const handleInitiateNewVersionFromTable = (basePack: UpdatePack) => {
    setTargetTab('newVersion');
    setTargetFormMode('newVersion');
    const newVersionPackData = {
      ...basePack,
      version: (Number(basePack.version) || 0) + 1,
      id: '', 
      createdAt: new Date().toISOString(),
      binaryFileName: undefined,
      descriptorFileName: undefined,
      descriptorContent: undefined, // Clear descriptor content for new version
      uri: undefined, 
    };
    setTargetPackForForm(newVersionPackData); 
    setTargetSelectedBasePackId(basePack.id); 
    triggerFormTransition('newVersion', 'newVersion', newVersionPackData, basePack.id);
  };
  
  // This handler is called by the form itself when base pack selection changes
  const handleBasePackSelectInForm = (basePackId: string | undefined) => {
    setActiveSelectedBasePackId(basePackId); // Update active state directly

    if (basePackId && activeFormMode === 'newVersion') {
      const basePack = (fetchedUpdatePacks || []).find(p => p.id === basePackId); 
      if (basePack) {
        const newVersionPackData = {
          ...basePack,
          version: (Number(basePack.version) || 0) + 1,
          id: '', 
          createdAt: new Date().toISOString(),
          binaryFileName: undefined,
          descriptorFileName: undefined,
          descriptorContent: undefined, // Clear descriptor content for new version
          uri: undefined,
        };
        setActivePackForForm(newVersionPackData); 
      } else {
         setActivePackForForm(undefined); 
      }
    } else if (!basePackId && activeFormMode === 'newVersion') {
      setActivePackForForm(undefined); 
    }
    // No need to call triggerFormTransition here, as this is an internal form state change
  };

  const handleSwuGenerated = () => {
    refetch(); 
    // Optionally, reset the form to the 'new' tab/state after successful generation
    // handleTabChangeRequest('new');
  };

  // Determine if the form should be shown based on active states
  const showForm = activeFormMode === 'new' || 
                   (activeFormMode === 'newVersion'); 

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Update Pack Management</h2>
        <p className="text-muted-foreground">
          Generate .swu firmware update packs. Use tabs to choose an action.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose Action</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs 
            value={tabsComponentValue} // Controlled by state for animation
            onValueChange={(value) => handleTabChangeRequest(value as TabValue)}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">Create New Pack</TabsTrigger>
              <TabsTrigger value="newVersion">Create New Version</TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="pt-4">
              <p className="text-sm text-muted-foreground">
                Use the form below to define details for a brand new update pack and generate its .swu file.
              </p>
            </TabsContent>
            <TabsContent value="newVersion" className="pt-4">
              <p className="text-sm text-muted-foreground">
                Use the form below to select a base pack, create its next version, and generate its .swu file.
                Alternatively, select "Create New Version" from the table for a specific pack.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {showForm && (
         <div className="overflow-hidden"> {/* Container to clip animations */}
            <div key={formInstanceKey} className={currentAnimationClass}> {/* Apply animation class here */}
              <UpdatePackForm
                formModeActual={activeFormMode}
                initialPackData={activePackForForm}
                availableBasePacks={fetchedUpdatePacks || []} 
                selectedBasePackIdProp={activeSelectedBasePackId} 
                onBasePackSelect={handleBasePackSelectInForm} 
                onSwuGenerated={handleSwuGenerated}
              />
            </div>
         </div>
      )}

      <ExistingUpdatePacks
        onInitiateNewVersionFromTable={handleInitiateNewVersionFromTable}
        isLoading={isFetching}
        error={fetchError}
        data={fetchedUpdatePacks}
      />
    </div>
  );
}
    
