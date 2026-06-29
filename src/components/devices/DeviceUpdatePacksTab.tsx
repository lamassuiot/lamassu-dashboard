'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Package, History, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { CertificatePaginationControls } from '@/components/shared/CertificatePaginationControls';
import { fetchAllDevicePackInventory, fetchDevicePackUpdates } from '@/lib/iot-api';
import type { DevicePackWithArtifacts, DevicePackUpdate, FirmwareUpdateStatus } from '@/types/iot';

const UpdateStatusBadge: React.FC<{ status: FirmwareUpdateStatus }> = ({ status }) => {
  const classes: Record<string, string> = {
    success: 'bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-700/30 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    pending: 'bg-muted text-muted-foreground border-border',
    failed: 'bg-red-100 text-red-700 dark:bg-red-700/30 dark:text-red-300 border-red-300 dark:border-red-700',
  };
  return (
    <Badge variant="outline" className={cn('text-xs capitalize', classes[status] || classes.pending)}>
      {status}
    </Badge>
  );
};

const PackagingBadge: React.FC<{ packaging?: string }> = ({ packaging }) => {
  const isNonSwu = packaging === 'non-swu';
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs',
        isNonSwu
          ? 'bg-purple-100 text-purple-700 dark:bg-purple-700/30 dark:text-purple-300 border-purple-300 dark:border-purple-700'
          : 'bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-300 border-sky-300 dark:border-sky-700'
      )}
    >
      {packaging || 'swu'}
    </Badge>
  );
};

interface DeviceUpdatePacksTabProps {
  deviceId: string;
}

const HISTORY_PAGE_SIZE_OPTIONS = ['10', '25', '50'];

export const DeviceUpdatePacksTab: React.FC<DeviceUpdatePacksTabProps> = ({ deviceId }) => {
  const { user, isAuthenticated } = useAuth();

  // Installed distribution sets reflect the device's current state (bounded), so the whole list is
  // fetched at once. The pack-update history is unbounded and grows with every campaign/job, so it
  // is navigated page-by-page (bookmark pagination) — see the controls below the history table.
  const [packs, setPacks] = useState<DevicePackWithArtifacts[]>([]);
  const [packUpdates, setPackUpdates] = useState<DevicePackUpdate[]>([]);
  const [isLoadingPacks, setIsLoadingPacks] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bookmark pagination for the history table. `historyStack[k]` is the bookmark used to fetch page
  // k (page 0 has no bookmark); `historyNext` is the bookmark for the page after the current one.
  const [historyPageSize, setHistoryPageSize] = useState('10');
  const [historyStack, setHistoryStack] = useState<(string | undefined)[]>([undefined]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyNext, setHistoryNext] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    if (!deviceId || !isAuthenticated() || !user?.access_token) return;
    setIsLoadingPacks(true);
    setError(null);
    try {
      const inventoryList = await fetchAllDevicePackInventory({ deviceId });
      setPacks(inventoryList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch device package inventory.');
      setPacks([]);
    } finally {
      setIsLoadingPacks(false);
    }
  }, [deviceId, user?.access_token, isAuthenticated]);

  const loadHistory = useCallback(async (bookmark: string | undefined, pageSize: string) => {
    if (!deviceId || !isAuthenticated() || !user?.access_token) return;
    setIsLoadingHistory(true);
    setError(null);
    try {
      const { list, next } = await fetchDevicePackUpdates({ deviceId, pageSize: Number(pageSize), bookmark });
      setPackUpdates(list);
      setHistoryNext(next);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch device pack-update history.');
      setPackUpdates([]);
      setHistoryNext(null);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [deviceId, user?.access_token, isAuthenticated]);

  // (Re)load both sections from scratch — used on mount, device change, and manual refresh.
  const reload = useCallback(() => {
    setHistoryStack([undefined]);
    setHistoryPage(0);
    loadInventory();
    loadHistory(undefined, historyPageSize);
  }, [loadInventory, loadHistory, historyPageSize]);

  useEffect(() => {
    setHistoryStack([undefined]);
    setHistoryPage(0);
    loadInventory();
    loadHistory(undefined, historyPageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const handleHistoryNext = () => {
    if (historyNext == null) return;
    const nextStack = historyStack.slice(0, historyPage + 1);
    nextStack.push(historyNext);
    setHistoryStack(nextStack);
    setHistoryPage(historyPage + 1);
    loadHistory(historyNext, historyPageSize);
  };

  const handleHistoryPrev = () => {
    if (historyPage === 0) return;
    const prevPage = historyPage - 1;
    setHistoryPage(prevPage);
    loadHistory(historyStack[prevPage], historyPageSize);
  };

  const handleHistoryPageSizeChange = (value: string) => {
    setHistoryPageSize(value);
    setHistoryStack([undefined]);
    setHistoryPage(0);
    loadHistory(undefined, value);
  };

  const isLoading = isLoadingPacks || isLoadingHistory;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          The distribution set(s) this device has installed and the artifacts each pack delivers, plus the history of every pack update.
          A device installs whole packs — the artifacts and versions below come from each pack version's manifest.
        </p>
        <Button onClick={reload} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" onClick={reload} className="p-0 h-auto ml-2">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Installed distribution sets, each with the artifacts its manifest declares */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Installed Distribution Sets</CardTitle>
          <CardDescription>
            {packs.length > 0
              ? `${packs.length} pack(s) tracked — each shown at its current version with the artifacts it delivers.`
              : 'No update-pack version tracked for this device yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {packs.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-muted-foreground">No Tracked Packs</h3>
              <p className="text-sm text-muted-foreground mt-1">A pack version appears here once an update to this device completes.</p>
            </div>
          ) : (
            <div className={cn('space-y-4', isLoadingPacks && 'opacity-50 pointer-events-none')}>
              {packs.map((p) => (
                <div key={p.id} className="rounded-lg border border-border">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{p.pack_name}</span>
                    <Badge variant="secondary" className="font-mono text-xs">v{p.version}</Badge>
                    <PackagingBadge packaging={p.packaging} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      Installed <DateDisplay date={p.installed_at} />
                    </span>
                  </div>
                  {(p.artifacts && p.artifacts.length > 0) ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Artifact</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead className="text-right">Size</TableHead>
                            <TableHead>Checksum</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.artifacts.map((a) => (
                            <TableRow key={`${p.id}-${a.artifact_name}`}>
                              <TableCell className="font-medium">{a.artifact_name}</TableCell>
                              <TableCell className="font-mono text-sm">{a.version || <span className="text-xs italic text-muted-foreground">unversioned</span>}</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">{a.size ? formatBytes(a.size) : '—'}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate" title={a.checksum}>
                                {a.checksum || <span className="italic">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="px-4 py-3 text-sm text-muted-foreground italic">This pack declares no artifacts.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pack update history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Pack Update History</CardTitle>
          <CardDescription>
            {packUpdates.length > 0
              ? `Showing ${packUpdates.length} record(s) on page ${historyPage + 1}.`
              : 'No pack-update records for this device yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {packUpdates.length === 0 && historyPage === 0 ? (
            <div className="p-6 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No pack update history.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={cn('overflow-x-auto', isLoadingHistory && 'opacity-50 pointer-events-none')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Distribution Set</TableHead>
                      <TableHead>Transition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Packaging</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Job / Campaign</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packUpdates.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.pack_name}</TableCell>
                        <TableCell className="font-mono text-xs">v{u.version_from} → v{u.version_to}</TableCell>
                        <TableCell><UpdateStatusBadge status={u.status} /></TableCell>
                        <TableCell><PackagingBadge packaging={u.packaging} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.timestamp_init ? <DateDisplay date={u.timestamp_init} /> : <span className="text-xs italic">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.timestamp_completed ? <DateDisplay date={u.timestamp_completed} /> : <span className="text-xs italic">—</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={`job: ${u.job_id || '—'} | campaign: ${u.launch_id || '—'}`}>
                          {u.job_id || u.launch_id || <span className="italic">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <CertificatePaginationControls
                pageSize={historyPageSize}
                onPageSizeChange={handleHistoryPageSizeChange}
                pageSizeOptions={HISTORY_PAGE_SIZE_OPTIONS}
                pageSizeLabel="Page Size:"
                pageSizeSelectId="device-pack-updates-page-size"
                isLoading={isLoadingHistory}
                onPreviousPage={handleHistoryPrev}
                onNextPage={handleHistoryNext}
                canGoPrevious={historyPage > 0}
                canGoNext={historyNext != null}
                pageIndicator={<span className="text-sm text-muted-foreground">Page {historyPage + 1}</span>}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
