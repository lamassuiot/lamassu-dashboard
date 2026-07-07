'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Loader2,
  MoreVertical,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import {
  deleteKmsV2Key,
  getKmsV2KeyUsagesFromOperations,
  listKmsV2Keys,
  restoreKmsV2Key,
  type KmsV2KeyMetadata,
  type KmsV2KeyState,
} from '@/lib/kms-v2-data';

const stateFilters: Array<{ label: string; value: KmsV2KeyState | 'all' }> = [
  { label: 'All states', value: 'all' },
  { label: 'Enabled', value: 'enabled' },
  { label: 'Disabled', value: 'disabled' },
  { label: 'Pending deletion', value: 'pendingDeletion' },
  { label: 'Destroyed', value: 'destroyed' },
];

const stateBadgeVariant = (state?: string): React.ComponentProps<typeof Badge>['variant'] => {
  if (state === 'enabled') return 'default';
  if (state === 'pendingDeletion' || state === 'destroyed') return 'destructive';
  return 'secondary';
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const tagsPreview = (tags?: Record<string, string>) => {
  const entries = Object.entries(tags ?? {});
  if (entries.length === 0) return null;
  return entries.slice(0, 3);
};

export default function KmsV2KeysPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<KmsV2KeyMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState('25');
  const [tokenStack, setTokenStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [rawFilter, setRawFilter] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<KmsV2KeyState | 'all'>('all');
  const [keyToDelete, setKeyToDelete] = useState<KmsV2KeyMetadata | null>(null);
  const [pendingDays, setPendingDays] = useState('7');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [restoreBlob, setRestoreBlob] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const effectiveFilter = useMemo(() => {
    const filters = [];
    if (stateFilter !== 'all') filters.push(`state[eq]${stateFilter}`);
    if (appliedFilter.trim()) filters.push(appliedFilter.trim());
    return filters.join(',');
  }, [appliedFilter, stateFilter]);

  const loadData = useCallback(async (pageToken: string | null) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await listKmsV2Keys({
        page_token: pageToken,
        limit: pageSize,
        filter: effectiveFilter,
      });
      setKeys(result.keys ?? []);
      setNextPageToken(result.next_page_token ?? null);
    } catch (err: any) {
      setError(err.message || 'Failed to load KMS v2 keys.');
      setKeys([]);
      setNextPageToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveFilter, pageSize]);

  useEffect(() => {
    setCurrentPageIndex(0);
    setTokenStack([null]);
  }, [pageSize, effectiveFilter]);

  useEffect(() => {
    loadData(tokenStack[currentPageIndex] ?? null);
  }, [currentPageIndex, loadData, tokenStack]);

  const handleApplyFilter = () => {
    setAppliedFilter(rawFilter);
  };

  const handleClearFilter = () => {
    setRawFilter('');
    setAppliedFilter('');
    setStateFilter('all');
  };

  const handleRefresh = () => {
    loadData(tokenStack[currentPageIndex] ?? null);
  };

  const handleNextPage = () => {
    if (isLoading || !nextPageToken) return;
    const nextIndex = currentPageIndex + 1;
    if (nextIndex < tokenStack.length) {
      setCurrentPageIndex(nextIndex);
      return;
    }
    setTokenStack(prev => [...prev, nextPageToken]);
    setCurrentPageIndex(nextIndex);
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex(prev => prev - 1);
  };

  const handleDelete = async () => {
    if (!keyToDelete) return;

    const parsedPendingDays = Number.parseInt(pendingDays, 10);
    if (!Number.isFinite(parsedPendingDays) || parsedPendingDays < 1) {
      sileo.error({ title: 'Validation Error', description: 'Pending days must be 1 or greater.' });
      return;
    }

    setIsDeleting(true);
    try {
      await deleteKmsV2Key(keyToDelete.id, parsedPendingDays);
      sileo.success({
        title: 'Deletion Scheduled',
        description: `Key ${keyToDelete.id} is pending deletion.`,
      });
      setKeyToDelete(null);
      await loadData(tokenStack[currentPageIndex] ?? null);
    } catch (err: any) {
      sileo.error({ title: 'Delete Failed', description: err.message || 'Failed to schedule key deletion.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreBlob.trim()) {
      sileo.error({ title: 'Validation Error', description: 'Backup blob is required.' });
      return;
    }

    setIsRestoring(true);
    try {
      const restored = await restoreKmsV2Key({ backup_blob: restoreBlob.trim() });
      sileo.success({ title: 'Key Restored', description: `Restored key ${restored.id}.` });
      setRestoreBlob('');
      setIsRestoreOpen(false);
      await loadData(tokenStack[currentPageIndex] ?? null);
    } catch (err: any) {
      sileo.error({ title: 'Restore Failed', description: err.message || 'Failed to restore key.' });
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading && keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading KMS v2 keys...</p>
      </div>
    );
  }

  return (
    <BreadcrumbPage
      className="space-y-6 pb-8"
      items={[{ label: 'Home', href: '/' }, { label: 'KMS' }, { label: 'Keys V2' }]}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-1 h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-headline font-semibold">Keys V2</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage generated, imported, classical, and post-quantum keys through the KMS v2 API.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="secondary" onClick={() => setIsRestoreOpen(true)}>
            <ArchiveRestore className="mr-2 h-4 w-4" />
            Restore
          </Button>
          <Button onClick={() => router.push('/kms/keys-v2/new')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Key
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Keys</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="kms-v2-state-filter">State</Label>
            <Select value={stateFilter} onValueChange={(value) => setStateFilter(value as KmsV2KeyState | 'all')} disabled={isLoading}>
              <SelectTrigger id="kms-v2-state-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stateFilters.map(filter => (
                  <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kms-v2-filter">Raw filter</Label>
            <Input
              id="kms-v2-filter"
              value={rawFilter}
              onChange={(event) => setRawFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleApplyFilter();
              }}
              placeholder="e.g. state[eq]enabled"
              disabled={isLoading}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClearFilter} disabled={isLoading || (!rawFilter && !appliedFilter && stateFilter === 'all')}>
              Clear
            </Button>
            <Button onClick={handleApplyFilter} disabled={isLoading}>
              Apply
            </Button>
          </div>
        </div>
      </div>

      {!isLoading && !error && keys.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold text-muted-foreground">No KMS v2 keys found</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create or import a key to start managing KMS v2 material.</p>
          <Button onClick={() => router.push('/kms/keys-v2/new')} className="mt-4">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Key
          </Button>
        </div>
      ) : (
        <div className={cn('space-y-4', isLoading && 'pointer-events-none opacity-50')}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Key Spec</TableHead>
                  <TableHead>Key Usages</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const tagEntries = tagsPreview(key.tags);
                  const keyUsages = key.key_usages ?? getKmsV2KeyUsagesFromOperations(key.operations);
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="max-w-[280px]">
                        <button
                          type="button"
                          onClick={() => router.push(`/kms/keys-v2/details?keyId=${encodeURIComponent(key.id)}`)}
                          className="break-all text-left font-mono text-xs text-primary hover:underline"
                        >
                          {key.id}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{key.key_spec}</TableCell>
                      <TableCell>
                        {keyUsages.length > 0 ? (
                          <div className="flex max-w-[260px] flex-wrap gap-1">
                            {keyUsages.slice(0, 4).map(usage => (
                              <Badge key={usage} variant="secondary">{usage}</Badge>
                            ))}
                            {keyUsages.length > 4 && <Badge variant="outline">+{keyUsages.length - 4}</Badge>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Default</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={stateBadgeVariant(key.state)}>{key.state}</Badge>
                      </TableCell>
                      <TableCell>{key.origin || '-'}</TableCell>
                      <TableCell className="min-w-[220px] text-xs">
                        <div>From {formatDate(key.not_before)}</div>
                        <div className="text-muted-foreground">Until {formatDate(key.not_after)}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{key.policy_id || '-'}</TableCell>
                      <TableCell>
                        {tagEntries ? (
                          <div className="flex max-w-[240px] flex-wrap gap-1">
                            {tagEntries.map(([name, value]) => (
                              <Badge key={name} variant="secondary">{name}: {value}</Badge>
                            ))}
                            {Object.keys(key.tags ?? {}).length > tagEntries.length && (
                              <Badge variant="outline">+{Object.keys(key.tags ?? {}).length - tagEntries.length}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Key actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/kms/keys-v2/details?keyId=${encodeURIComponent(key.id)}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/kms/keys-v2/details?keyId=${encodeURIComponent(key.id)}&tab=backup`)}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Backup
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setKeyToDelete(key)}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Schedule Deletion
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="kms-v2-page-size" className="text-sm text-muted-foreground">Page Size</Label>
              <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading}>
                <SelectTrigger id="kms-v2-page-size" className="w-[88px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              <Button variant="secondary" onClick={handleNextPage} disabled={isLoading || !nextPageToken}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule key deletion</AlertDialogTitle>
            <AlertDialogDescription>
              The key will transition to pending deletion and remain accessible until the pending window elapses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="kms-v2-pending-days">Pending days</Label>
            <Input
              id="kms-v2-pending-days"
              type="number"
              min={1}
              value={pendingDays}
              onChange={(event) => setPendingDays(event.target.value)}
              disabled={isDeleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={(event) => {
              event.preventDefault();
              handleDelete();
            }} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Schedule Deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isRestoreOpen} onOpenChange={setIsRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore key from backup</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="kms-v2-restore-blob">Backup blob</Label>
            <Textarea
              id="kms-v2-restore-blob"
              value={restoreBlob}
              onChange={(event) => setRestoreBlob(event.target.value)}
              rows={8}
              className="font-mono"
              placeholder="Base64 backup blob"
              disabled={isRestoring}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsRestoreOpen(false)} disabled={isRestoring}>Cancel</Button>
            <Button onClick={handleRestore} disabled={isRestoring}>
              {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BreadcrumbPage>
  );
}
