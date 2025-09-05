

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { KeyRound, PlusCircle, MoreVertical, Eye, FileSignature, PenTool, ShieldCheck, Trash2, AlertTriangle, Cpu, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from '@/contexts/AuthContext';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { fetchCryptoEngines, fetchKmsKeys, type ApiKmsKey } from '@/lib/ca-data';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface KmsKey {
  id: string;
  alias: string;
  keyTypeDisplay: string;
  hasPrivateKey: boolean;
  cryptoEngineId?: string;
  algorithm: string;
  size: string;
  name?: string;
}

export default function KmsKeysPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [keys, setKeys] = useState<KmsKey[]>([]);
  const [allCryptoEngines, setAllCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [keyToDelete, setKeyToDelete] = useState<KmsKey | null>(null);
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
      const enginesData = allCryptoEngines.length > 0 
        ? allCryptoEngines 
        : await fetchCryptoEngines(user.access_token);
      
      setAllCryptoEngines(enginesData);

      const params = new URLSearchParams({ page_size: pageSize });
      if (bookmark) {
        params.set('bookmark', bookmark);
      }

      const keysResponse = await fetchKmsKeys(user.access_token, params);
      
      const transformedKeys: KmsKey[] = (keysResponse.list || []).map((apiKey) => {
        const engineIdMatch = apiKey.id.match(/token-id=([^;]+)/);
        const engineId = engineIdMatch ? engineIdMatch[1] : undefined;

        return {
            id: apiKey.id,
            alias: apiKey.name || apiKey.id,
            name: apiKey.name,
            keyTypeDisplay: `${apiKey.algorithm} ${apiKey.size}`,
            hasPrivateKey: apiKey.id.includes('type=private'),
            cryptoEngineId: engineId,
            algorithm: apiKey.algorithm,
            size: String(apiKey.size),
        };
      });

      setKeys(transformedKeys);
      setNextTokenFromApi(keysResponse.next);

    } catch (err: any) {
      setError(err.message || "An unknown error occurred while fetching data.");
      setKeys([]);
      setAllCryptoEngines([]);
      setNextTokenFromApi(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token, authLoading, isAuthenticated, allCryptoEngines, pageSize]);
  
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


  const handleCreateNewKey = () => {
    router.push('/kms/keys/new');
  };

  const confirmDeleteKey = (key: KmsKey) => {
    setKeyToDelete(key);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteKey = () => {
    if (keyToDelete) {
      setKeys(prevKeys => prevKeys.filter(k => k.id !== keyToDelete.id));
      toast({
        title: "Key Deleted (Mock)",
        description: `Key "${keyToDelete.alias}" has been removed from the list. This is a mock action.`,
      });
    }
    setIsDeleteDialogOpen(false);
    setKeyToDelete(null);
  };

  const handleViewDetails = (keyIdValue: string) => {
    router.push(`/kms/keys/details?keyId=${keyIdValue}`);
  };

  if (authLoading || (isLoading && keys.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{authLoading ? "Authenticating..." : "Loading KMS Keys..."}</p>
      </div>
    );
  }


  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <KeyRound className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Key Management Service - Asymmetric Keys</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </Button>
          <Button onClick={handleCreateNewKey}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Key
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage asymmetric keys stored in the Key Management Service. These keys are used for signing, verification, and other cryptographic operations.
      </p>
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error} <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">Try again?</Button></AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && keys.length === 0 ? (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
            <h3 className="text-lg font-semibold text-muted-foreground">No KMS Keys Found</h3>
            <p className="text-sm text-muted-foreground">
            There are no asymmetric keys configured in the KMS yet.
            </p>
            <Button onClick={handleCreateNewKey} className="mt-4">
              <PlusCircle className="mr-2 h-4 w-4" /> Create New Key
            </Button>
        </div>
      ) : (
        <div className={cn("space-y-4", isLoading && "opacity-50 pointer-events-none")}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alias</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Strength</TableHead>
                  <TableHead><div className="flex items-center"><Cpu className="mr-1.5 h-4 w-4 text-muted-foreground"/>Crypto Engine</div></TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const engine = allCryptoEngines.find(e => e.id === key.cryptoEngineId);
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">
                        <p className="truncate max-w-[250px] sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl" title={key.alias}>{key.name}</p>
                      </TableCell>
                      <TableCell>{key.keyTypeDisplay}</TableCell>
                      <TableCell>
                        <KeyStrengthIndicator algorithm={key.algorithm} size={key.size} />
                      </TableCell>
                      <TableCell>
                        {engine ? (
                          <CryptoEngineViewer engine={engine} />
                        ) : (
                          <Badge variant="outline" className="text-xs font-normal bg-muted/40 border-muted-foreground/30">
                            {key.cryptoEngineId || 'N/A'}
                          </Badge>
                        )}
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
                            <DropdownMenuItem onClick={() => handleViewDetails(key.id)}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => router.push(`/kms/keys/details?keyId=${key.id}&tab=generate-csr`)}
                              disabled={!key.hasPrivateKey}
                            >
                              <FileSignature className="mr-2 h-4 w-4" /> Generate CSR
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => router.push(`/kms/keys/details?keyId=${key.id}&tab=sign-verify`)}
                              disabled={!key.hasPrivateKey}
                            >
                              <PenTool className="mr-2 h-4 w-4" /> Sign / Verify
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
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
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between items-center mt-4">
              <div className="flex items-center space-x-2">
                  <Label htmlFor="pageSizeSelect" className="text-sm text-muted-foreground">Page Size:</Label>
                  <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading}>
                      <SelectTrigger id="pageSizeSelect" className="w-[80px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
              <div className="flex items-center space-x-2">
                  <Button onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0} variant="outline" size="sm">
                      <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                  </Button>
                  <Button onClick={handleNextPage} disabled={isLoading || !nextTokenFromApi} variant="outline" size="sm">
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
              </div>
          </div>
        </div>
      )}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-6 w-6 text-destructive" />
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the key "<strong>{keyToDelete?.alias}</strong>"? This action cannot be undone.
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

