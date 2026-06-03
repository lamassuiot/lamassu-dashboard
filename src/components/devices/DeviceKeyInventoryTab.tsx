'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { KeyRound, PlusCircle, Loader2, RefreshCw, Trash2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fetchDeviceInventory, revokeKeyFromDevice } from '@/lib/device-inventory-api';
import type { DeviceKeyBinding, BindingStatus } from '@/types/device-inventory';
import { AssignKeyToDeviceModal } from './AssignKeyToDeviceModal';
import { DateDisplay } from '@/components/shared/DateDisplay';

interface DeviceKeyInventoryTabProps {
  deviceId: string;
}

const BindingStatusBadge: React.FC<{ status: BindingStatus }> = ({ status }) => {
  let badgeClass = '';
  switch (status) {
    case 'active':
      badgeClass = 'bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700';
      break;
    case 'rotating':
      badgeClass = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-700/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700';
      break;
    case 'revoked':
      badgeClass = 'bg-red-100 text-red-700 dark:bg-red-700/30 dark:text-red-300 border-red-300 dark:border-red-700';
      break;
    default:
      badgeClass = 'bg-muted text-muted-foreground border-border';
  }
  return (
    <Badge variant="outline" className={cn('text-xs capitalize', badgeClass)}>
      {status}
    </Badge>
  );
};

export const DeviceKeyInventoryTab: React.FC<DeviceKeyInventoryTabProps> = ({ deviceId }) => {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [bindings, setBindings] = useState<DeviceKeyBinding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [pageSize, setPageSize] = useState('10');
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);

  // Assign modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Revoke confirmation
  const [bindingToRevoke, setBindingToRevoke] = useState<DeviceKeyBinding | null>(null);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  const loadData = useCallback(async (bookmark: string | null) => {
    if (authLoading || !isAuthenticated() || !user?.access_token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchDeviceInventory(deviceId, user.access_token, {
        pageSize: parseInt(pageSize),
        bookmark: bookmark || undefined,
      });

      setBindings(response.list);
      setNextTokenFromApi(response.next);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch device key inventory.');
      setBindings([]);
      setNextTokenFromApi(null);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, user?.access_token, authLoading, isAuthenticated, pageSize]);

  useEffect(() => {
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
    const nextIdx = currentPageIndex + 1;
    if (nextIdx < bookmarkStack.length) {
      setCurrentPageIndex(nextIdx);
    } else {
      setBookmarkStack(prev => [...prev, nextTokenFromApi]);
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex(prev => prev - 1);
  };

  const confirmRevoke = (binding: DeviceKeyBinding) => {
    setBindingToRevoke(binding);
    setIsRevokeDialogOpen(true);
  };

  const handleRevoke = async () => {
    if (!bindingToRevoke || !user?.access_token) {
      setIsRevokeDialogOpen(false);
      setBindingToRevoke(null);
      return;
    }

    setIsRevoking(true);
    try {
      await revokeKeyFromDevice(deviceId, bindingToRevoke.key_id, user.access_token);
      toast({
        title: 'Key Revoked',
        description: `Key "${bindingToRevoke.key_id}" has been revoked from device "${deviceId}".`,
      });
      handleRefresh();
    } catch (err: any) {
      toast({
        title: 'Revocation Failed',
        description: err.message || 'An error occurred while revoking the key.',
        variant: 'destructive',
      });
    } finally {
      setIsRevoking(false);
      setIsRevokeDialogOpen(false);
      setBindingToRevoke(null);
    }
  };

  const handleAssignSuccess = () => {
    handleRefresh();
  };

  if (isLoading && bindings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Loading key inventory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5" />
                Symmetric Key Bindings
              </CardTitle>
              <CardDescription>
                Manage symmetric keys assigned to this device for encryption, secure boot, and other purposes.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setIsAssignModalOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Assign Key
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
              <Button variant="link" size="sm" onClick={handleRefresh} className="p-0 h-auto ml-2">
                Try again
              </Button>
            </div>
          )}

          {!error && bindings.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <KeyRound className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-muted-foreground">No Key Bindings</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This device has no symmetric keys assigned yet.
              </p>
              <Button className="mt-4" size="sm" onClick={() => setIsAssignModalOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Assign First Key
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key ID</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned At</TableHead>
                      <TableHead>Expires At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bindings.map((binding) => (
                      <TableRow key={`${binding.key_id}-${binding.purpose}`}>
                        <TableCell className="font-mono text-sm">
                          {binding.key_id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {binding.purpose}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <BindingStatusBadge status={binding.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <DateDisplay date={binding.assigned_at} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {binding.expires_at ? (
                            <DateDisplay date={binding.expires_at} />
                          ) : (
                            <span className="text-xs text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {binding.status !== 'revoked' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => confirmRevoke(binding)}
                              disabled={isRevoking}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {binding.status === 'revoked' && binding.revoked_at && (
                            <span className="text-xs text-muted-foreground">
                              Revoked <DateDisplay date={binding.revoked_at} />
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between items-center mt-4">
                <div className="flex items-center space-x-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                  <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading}>
                    <SelectTrigger className="w-[80px]">
                      <SelectValue placeholder="Page size" />
                    </SelectTrigger>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Assign Key Modal */}
      <AssignKeyToDeviceModal
        isOpen={isAssignModalOpen}
        onOpenChange={setIsAssignModalOpen}
        deviceId={deviceId}
        onSuccess={handleAssignSuccess}
      />

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Revoke Key Assignment
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke key <strong className="font-mono">{bindingToRevoke?.key_id}</strong> from
              this device? This action cannot be undone. The device will no longer be able to use this key
              for <strong>{bindingToRevoke?.purpose}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
