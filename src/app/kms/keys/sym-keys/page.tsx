'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KeyRound, PlusCircle, MoreVertical, Trash2, AlertTriangle, Loader2, RefreshCw, Lock, HelpCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from '@/contexts/AuthContext';
import { fetchSymmetricKeys, deleteSymmetricKey, type SymmetricKey as ApiSymKey } from '@/lib/symkms-api';
import { formatDistanceToNow } from 'date-fns';
import { SymmetricKeyStrengthIndicator } from '@/components/shared/SymmetricKeyStrengthIndicator';
import { ResourceConsumptionIndicator } from '@/components/shared/LightweightIndicator';
import { AEADIndicator } from '@/components/shared/AEADIndicator';
import { SYM_KEY_ALGORITHMS } from '@/lib/key-spec-constants';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SymKey extends ApiSymKey {
  displayName: string;
}

// Utility function to convert base64 to hex
const base64ToHex = (base64: string): string => {
  const bytes = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export default function SymKeysPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [keys, setKeys] = useState<SymKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<SymKey | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Pagination State
  const [pageSize, setPageSize] = useState('10');
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);

  const loadData = useCallback(async (bookmark: string | null) => {
    if (authLoading || !isAuthenticated() || !user?.access_token) {
      if (!authLoading && !isAuthenticated()) {
        setError("User not authenticated. Please log in.");
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Use user profile sub or email as user_id
      const userId = user.profile?.sub || user.profile?.email || 'default-user';
      const response = await fetchSymmetricKeys(userId, user.access_token, {
        pageSize: parseInt(pageSize),
        bookmark: bookmark || undefined,
        sortBy: 'created_at',
        sortMode: 'desc'
      });
      
      const transformedKeys: SymKey[] = (response.list || []).map((key) => ({
        ...key,
        displayName: key.id,
      }));

      setKeys(transformedKeys);
      setNextTokenFromApi(response.next);
    } catch (err: any) {
      setError(err.message || "An unknown error occurred while fetching symmetric keys.");
      setKeys([]);
      setNextTokenFromApi(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token, user?.profile, authLoading, isAuthenticated, pageSize]);

  useEffect(() => {
    // Reset pagination when page size changes
    setCurrentPageIndex(0);
    setBookmarkStack([null]);
  }, [pageSize]);

  useEffect(() => {
    if (!authLoading && isAuthenticated()) {
      loadData(bookmarkStack[currentPageIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, currentPageIndex, bookmarkStack]);

  const handleRefresh = () => {
    loadData(bookmarkStack[currentPageIndex]);
  };

  const handleNextPage = () => {
    if (isLoading || !nextTokenFromApi) return;
    const potentialNextPageIndex = currentPageIndex + 1;
    // If the next page is already in our stack (e.g., user went back then forward)
    if (potentialNextPageIndex < bookmarkStack.length) {
      setCurrentPageIndex(potentialNextPageIndex);
    } else {
      // Otherwise, add the new bookmark and move to it
      setBookmarkStack(prev => [...prev, nextTokenFromApi]);
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex(prev => prev - 1);
  };

  const confirmDeleteKey = (key: SymKey) => {
    setKeyToDelete(key);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete || !user?.access_token) return;

    try {
      await deleteSymmetricKey(keyToDelete.id, user.access_token);
      
      toast({
        title: "Key Deleted",
        description: `Symmetric key "${keyToDelete.displayName}" has been deleted successfully.`,
      });
      
      loadData();
    } catch (err: any) {
      toast({
        title: "Deletion Failed",
        description: err.message || "Failed to delete symmetric key.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setKeyToDelete(null);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Symmetric Keys...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Lock className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Key Management Service - Symmetric Keys</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </Button>
          <Link href="/kms/keys/sym-keys/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Create New Key
            </Button>
          </Link>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage symmetric keys for encryption, decryption, and other cryptographic operations. These keys use algorithms like AES and Ascon.
      </p>
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error} <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">Try again?</Button></AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && keys.length > 0 ? (
        <div className={cn("space-y-4", isLoading && "opacity-50 pointer-events-none")}>
        <TooltipProvider>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Algorithm</TableHead>
                  <TableHead className="flex items-center gap-1">
                    Security Level
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="text-xs space-y-2">
                          <div className="font-medium">Security Level Explanation</div>
                          <div className="space-y-1">
                            <div><strong>5 bars:</strong> Very Strong (256-bit equivalent)</div>
                            <div><strong>4 bars:</strong> Strong (192-bit equivalent)</div>
                            <div><strong>3 bars:</strong> Adequate (128-bit equivalent)</div>
                            <div><strong>2 bars:</strong> Deprecated (112-bit equivalent)</div>
                            <div><strong>1 bar:</strong> Legacy (80-bit equivalent)</div>
                          </div>
                          <div className="border-t pt-2 mt-2">
                            <div className="font-medium">Post-Quantum Security</div>
                            <div className="text-muted-foreground">
                              Grover's algorithm reduces symmetric key security by half (N/2). 
                              AES-128 provides 64-bit quantum security, AES-256 provides 128-bit quantum security.
                              Post-quantum variant for ascon, ascon80pq, offers 160 key length which provides 80-bit post-quantum security.
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-center gap-1 cursor-help">
                            <span>AEAD</span>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          <div className="text-xs space-y-1">
                            <div className="font-medium">Authenticated Encryption with Associated Data</div>
                            <div className="text-muted-foreground">
                              AEAD algorithms provide both confidentiality and authentication in a single operation,
                              ensuring data integrity and authenticity along with encryption. Non-AEAD algorithms
                              require separate authentication mechanisms.
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="text-center">Resource Consumption</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">
                    <Link 
                      href={`/kms/keys/sym-keys/details?keyId=${encodeURIComponent(key.id)}`}
                      className="text-primary hover:underline truncate max-w-[250px] sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl block" 
                      title={key.id}
                    >
                      {key.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {SYM_KEY_ALGORITHMS[key.algorithm] || key.algorithm}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <SymmetricKeyStrengthIndicator algorithm={key.algorithm} />
                  </TableCell>
                  <TableCell className="text-center">
                    <AEADIndicator algorithm={key.algorithm} />
                  </TableCell>
                  <TableCell className="text-center">
                    <ResourceConsumptionIndicator algorithm={key.algorithm} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {key.created_at ? formatDistanceToNow(new Date(key.created_at), { addSuffix: true }) : 'N/A'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Key Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => confirmDeleteKey(key)}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Key
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </TooltipProvider>
          <div className="flex justify-between items-center mt-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="pageSizeSelectSymKeys" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
              <Select
                value={pageSize}
                onValueChange={(value) => { setPageSize(value); }}
                disabled={isLoading || authLoading}
              >
                <SelectTrigger id="pageSizeSelectSymKeys" className="w-[80px]">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Button onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0} variant="outline">
                <ChevronLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              <Button onClick={handleNextPage} disabled={isLoading || !nextTokenFromApi} variant="outline">
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        !isLoading && !error && (
          <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
            <h3 className="text-lg font-semibold text-muted-foreground">No Symmetric Keys Found</h3>
            <p className="text-sm text-muted-foreground">
              There are no symmetric keys configured in the KMS yet.
            </p>
            <Link href="/kms/keys/sym-keys/new">
              <Button className="mt-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Key
              </Button>
            </Link>
          </div>
        )
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-6 w-6 text-destructive" />
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the symmetric key "<strong>{keyToDelete?.displayName}</strong>"? This action cannot be undone and may affect systems using this key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setKeyToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteKey} className={cn(buttonVariants({ variant: "destructive" }))}>
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
