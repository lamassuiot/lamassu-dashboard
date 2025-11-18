'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { KeyRound, PlusCircle, MoreVertical, Trash2, AlertTriangle, Loader2, RefreshCw, Lock } from "lucide-react";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from '@/contexts/AuthContext';
import { fetchSymmetricKeys, deleteSymmetricKey, type SymmetricKey as ApiSymKey } from '@/lib/symkms-api';
import { formatDistanceToNow } from 'date-fns';

// Symmetric key algorithm options (for display labels)
const SYM_KEY_ALGORITHMS: Record<string, string> = {
  'AES_256_CBC': 'AES-256 CBC',
  'AES_256_CTR': 'AES-256 CTR',
  'AES_256_GCM': 'AES-256 GCM',
  'AES_192_CBC': 'AES-192 CBC',
  'AES_192_CTR': 'AES-192 CTR',
  'AES_192_GCM': 'AES-192 GCM',
  'AES_128_CBC': 'AES-128 CBC',
  'AES_128_CTR': 'AES-128 CTR',
  'AES_128_GCM': 'AES-128 GCM',
  'Ascon128': 'Ascon-128',
  'Ascon128a': 'Ascon-128a',
  'Ascon80pq': 'Ascon-80pq',
};

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

  const loadData = useCallback(async () => {
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
      const keysArray = await fetchSymmetricKeys(userId, user.access_token);
      
      const transformedKeys: SymKey[] = (keysArray || []).map((key) => ({
        ...key,
        displayName: key.id,
      }));

      setKeys(transformedKeys);
    } catch (err: any) {
      setError(err.message || "An unknown error occurred while fetching symmetric keys.");
      setKeys([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token, user?.profile, authLoading, isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          <Button onClick={loadData} variant="outline" disabled={isLoading}>
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
          <AlertDescription>{error} <Button variant="link" onClick={loadData} className="p-0 h-auto">Try again?</Button></AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && keys.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key ID</TableHead>
                <TableHead>Algorithm</TableHead>
                <TableHead>User ID</TableHead>
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
                    <Badge variant="outline" className="font-mono">
                      {key.algorithm}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{key.user_id}</span>
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
