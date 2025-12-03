

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { KeyRound, PlusCircle, MoreVertical, Eye, FileSignature, PenTool, ShieldCheck, Trash2, AlertTriangle, Cpu, Loader2, RefreshCw, HelpCircle,ChevronLeft, ChevronRight, Search, X  } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from '@/contexts/AuthContext';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { fetchCryptoEngines, fetchKmsKeys, deleteKmsKey } from '@/lib/kms-data';
import { DeleteKmsKeyModal } from '@/components/shared/DeleteKmsKeyModal';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface KmsKey {
  id: string;
  keyTypeDisplay: string;
  hasPrivateKey: boolean;
  cryptoEngineId?: string;
  algorithm: string;
  size: string;
  name?: string;
  aliases: string[];
  tags?: string[];
  metadata?: Record<string, any>;
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
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination State
  const [pageSize, setPageSize] = useState('10');
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);

  // Filter State
  const [aliasSearchTerm, setAliasSearchTerm] = useState<string>('');
  const [debouncedAliasSearchTerm, setDebouncedAliasSearchTerm] = useState<string>('');

  // Debounce effect for alias search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (aliasSearchTerm !== debouncedAliasSearchTerm) {
        setDebouncedAliasSearchTerm(aliasSearchTerm);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [aliasSearchTerm, debouncedAliasSearchTerm]);


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

      // Add alias filter if search term is provided
      if (debouncedAliasSearchTerm.trim() !== '') {
        params.append('filter', `name[contains_ignorecase]${debouncedAliasSearchTerm.trim()}`);
      }

      const keysResponse = await fetchKmsKeys(user.access_token, params);

      const transformedKeys: KmsKey[] = (keysResponse.list || []).map((apiKey) => {
        return {
          id: apiKey.pkcs11_uri,
          name: apiKey.name,
          keyTypeDisplay: `${apiKey.algorithm} ${apiKey.size}`,
          hasPrivateKey: apiKey.has_private_key,
          cryptoEngineId: apiKey.engine_id,
          algorithm: apiKey.algorithm,
          size: String(apiKey.size),
          aliases: apiKey.aliases,
          tags: apiKey.tags || [],
          metadata: apiKey.metadata,
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
  }, [user?.access_token, authLoading, isAuthenticated, allCryptoEngines, pageSize, debouncedAliasSearchTerm]);

  useEffect(() => {
    // Reset pagination when page size changes
    setCurrentPageIndex(0);
    setBookmarkStack([null]);
  }, [pageSize]);

  useEffect(() => {
    // Reset pagination when alias search term changes
    setCurrentPageIndex(0);
    setBookmarkStack([null]);
  }, [debouncedAliasSearchTerm]);

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

  const handleDeleteKey = async () => {
    if (!keyToDelete || !user?.access_token) {
      setIsDeleteDialogOpen(false);
      setKeyToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteKmsKey(keyToDelete.id, user.access_token);

      // Remove from local state after successful deletion
      setKeys(prevKeys => prevKeys.filter(k => k.id !== keyToDelete.id));

      toast({
        title: "Key Deleted",
        description: `Key "${keyToDelete.name}" has been successfully deleted.`,
      });
    } catch (error: any) {
      toast({
        title: "Deletion Failed",
        description: error.message || "An error occurred while deleting the key.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
      setKeyToDelete(null);
    }
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

      {/* Filter Section */}
      <div className="grid grid-cols-1 gap-4 items-end">
        <div className="space-y-1">
          <Label htmlFor="aliasSearchInput">Filter by Name, ID or Alias</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              id="aliasSearchInput"
              type="text"
              placeholder="Search by key alias..."
              value={aliasSearchTerm}
              onChange={(e) => setAliasSearchTerm(e.target.value)}
              className="w-full pl-10"
              disabled={isLoading}
            />
            {aliasSearchTerm && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setAliasSearchTerm('')}
                disabled={isLoading}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Active Filters Indicator */}
      {debouncedAliasSearchTerm && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Active filter:</span>
          <Badge variant="secondary" className="text-xs">
            Alias contains "{debouncedAliasSearchTerm}"
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 h-4 w-4 p-0 hover:bg-transparent"
              onClick={() => setAliasSearchTerm('')}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        </div>
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
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Strength</TableHead>
                  <TableHead>Public/Private</TableHead>
                  <TableHead><div className="flex items-center"><Cpu className="mr-1.5 h-4 w-4 text-muted-foreground" />Crypto Engine</div></TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Related Entities</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const engine = allCryptoEngines.find(e => e.id === key.cryptoEngineId);
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">
                        <button
                          onClick={() => handleViewDetails(key.id)}
                          className="text-left truncate max-w-[250px] sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                          title={key.name}
                        >
                          {key.name}
                        </button>
                      </TableCell>
                      <TableCell>{key.keyTypeDisplay}</TableCell>
                      <TableCell>
                        <KeyStrengthIndicator algorithm={key.algorithm} size={key.size} />
                      </TableCell>
                      <TableCell>
                        {key.hasPrivateKey ? (
                          <Badge variant="default" className="text-xs">
                            Private
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Public
                          </Badge>
                        )}
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
                      <TableCell>
                        {key.aliases && key.aliases.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {key.aliases.map((alias, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {alias}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No aliases</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {key.tags && key.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {key.tags.map((tag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const bindedResources = key.metadata?.['lamassu.io/kms/binded-resources'];
                          if (!bindedResources) return <span className="text-muted-foreground text-xs">-</span>;

                          // Parse the binded resources
                          let resources: Array<{ resource_id: string; resource_type: string }> = [];
                          try {
                            if (typeof bindedResources === 'string') {
                              resources = [JSON.parse(bindedResources)];
                            } else if (Array.isArray(bindedResources)) {
                              resources = bindedResources;
                            } else if (typeof bindedResources === 'object') {
                              resources = [bindedResources];
                            }
                          } catch (e) {
                            console.error("Failed to parse binded resources:", e);
                            return <span className="text-muted-foreground text-xs">-</span>;
                          }

                          if (resources.length === 0) return <span className="text-muted-foreground text-xs">-</span>;

                          const maxVisible = 3;
                          const visibleResources = resources.slice(0, maxVisible);
                          const remainingCount = resources.length - maxVisible;

                          return (
                            <div className="flex items-center -space-x-2">
                              <div className="*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2">
                                {visibleResources.map((resource, idx) => {
                                  const label = resource.resource_type.charAt(0).toUpperCase();
                                  return (
                                    <Avatar
                                      key={idx}
                                      className="h-8 w-8 border-2 border-background"
                                      title={`${resource.resource_type}: ${resource.resource_id}`}
                                    >
                                      <AvatarFallback className="text-xs font-semibold bg-primary text-secondary">
                                        {label}
                                      </AvatarFallback>
                                    </Avatar>
                                  );
                                })}
                                {remainingCount > 0 && (
                                  <Avatar className="h-8 w-8 border-2 border-background">
                                    <AvatarFallback className="text-xs font-semibold bg-muted text-muted-foreground">
                                      +{remainingCount}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                            </div>
                          );
                        })()}
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
                              disabled={isDeleting}
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
              <Label htmlFor="pageSizeSelectKmsList" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
              <Select
                value={pageSize}
                onValueChange={(value) => { setPageSize(value); }}
                disabled={isLoading || authLoading}
              >
                <SelectTrigger id="pageSizeSelectKmsList" className="w-[80px]">
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
      )}
      {keyToDelete && (
        <DeleteKmsKeyModal
          isOpen={isDeleteDialogOpen}
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
            if (!open) setKeyToDelete(null);
          }}
          onConfirm={handleDeleteKey}
          keyName={keyToDelete.name || keyToDelete.id}
          keyId={keyToDelete.id}
          isDeleting={isDeleting}
        />
      )}

    </div>
  );
}
