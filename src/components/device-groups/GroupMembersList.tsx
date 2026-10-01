'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from '@/components/shared/RouterLink';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeviceStatusBadge } from '@/components/shared/DeviceStatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Loader2, Search, Eye, MoreVertical, TerminalSquare, HelpCircle, X, MonitorSmartphone } from 'lucide-react';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { SortableTableHead } from '@/components/shared/SortableTableHead';
import { BookmarkPaginationFooter } from '@/components/shared/BookmarkPaginationFooter';
import { getDevicesByGroup } from '@/lib/device-groups-api';
import type { ApiDevice } from '@/lib/devices-api';
import { cn } from '@/lib/utils';
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { sileo } from '@/lib/toast';
import { EstEnrollModal } from '@/components/shared/EstEnrollModal';
import { fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { useDeviceGroupStats } from '@/hooks/useDeviceGroupStats';
import { getDeviceStatusMeta, type DeviceStatusKey } from '@/lib/device-status';
import { getStatusSegments } from './DeviceGroupStatusBar';

interface GroupMembersListProps {
  groupId: string;
  /** Bumped by the parent page to re-fetch devices and stats. */
  refreshKey?: number;
  className?: string;
}

type SortableColumn = 'id' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';
type SearchField = 'id' | 'tags';

const SORT_COLUMN_TO_API: Record<SortableColumn, string> = {
  id: 'id',
  status: 'status',
  createdAt: 'creation_timestamp',
};

function DeviceIcon({ type, iconColor, bgColor }: Readonly<{ type: string; iconColor?: string; bgColor?: string }>) {
  const IconComponent = getLucideIconByName(type) ?? HelpCircle;
  return (
    <div className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5" style={{ backgroundColor: bgColor || '#F0F8FF' }}>
      <IconComponent className="h-5 w-5" style={{ color: iconColor || '#0f67ff' }} />
    </div>
  );
}

export function GroupMembersList({ groupId, refreshKey = 0, className }: Readonly<GroupMembersListProps>) {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState('25');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('id');
  const [statusFilter, setStatusFilter] = useState<DeviceStatusKey | null>(null);
  const [sortColumn, setSortColumn] = useState<SortableColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [bookmarkHistory, setBookmarkHistory] = useState<(string | undefined)[]>([undefined]);
  const [nextBookmark, setNextBookmark] = useState<string | null>(null);

  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [raForEnrollModal, setRaForEnrollModal] = useState<ApiRaItem | null>(null);
  const [deviceForEnrollModal, setDeviceForEnrollModal] = useState<ApiDevice | null>(null);

  const { stats, isLoading: isLoadingStats } = useDeviceGroupStats(groupId, refreshKey);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchDevices = useCallback(async (bookmark?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const filters: string[] = [];
      if (debouncedSearchTerm) filters.push(`${searchField}[contains_ignorecase]${debouncedSearchTerm}`);
      if (statusFilter) filters.push(`status[equal]${statusFilter}`);

      const response = await getDevicesByGroup(groupId, {
        pageSize: Number.parseInt(pageSize, 10),
        bookmark,
        sortBy: SORT_COLUMN_TO_API[sortColumn],
        sortMode: sortDirection,
        filters: filters.length > 0 ? filters : undefined,
      });

      setDevices(response.list);
      setNextBookmark(response.next || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    } finally {
      setIsLoading(false);
    }
    // refreshKey is a dependency so a parent refresh re-creates the fetcher and re-runs the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, pageSize, sortColumn, sortDirection, debouncedSearchTerm, searchField, statusFilter, refreshKey]);

  // Reset pagination whenever the query changes.
  useEffect(() => {
    setCurrentPageIndex(0);
    setBookmarkHistory([undefined]);
  }, [debouncedSearchTerm, searchField, statusFilter, pageSize, sortColumn, sortDirection]);

  useEffect(() => {
    if (currentPageIndex < bookmarkHistory.length) {
      fetchDevices(bookmarkHistory[currentPageIndex]);
    }
  }, [currentPageIndex, bookmarkHistory, fetchDevices]);

  const handleNextPage = () => {
    if (isLoading) return;
    const nextIndex = currentPageIndex + 1;
    if (nextIndex < bookmarkHistory.length) {
      setCurrentPageIndex(nextIndex);
    } else if (nextBookmark) {
      setBookmarkHistory((prev) => [...prev.slice(0, currentPageIndex + 1), nextBookmark]);
      setCurrentPageIndex(nextIndex);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex((prev) => prev - 1);
  };

  const requestSort = (column: SortableColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleOpenEnrollModal = async (device: ApiDevice) => {
    setDeviceForEnrollModal(device);
    setRaForEnrollModal(null);
    setIsEnrollModalOpen(true);
    try {
      setRaForEnrollModal(await fetchRaById(device.dms_owner));
    } catch (err) {
      sileo.error({ title: 'Error Fetching RA Details', description: err instanceof Error ? err.message : String(err) });
      setIsEnrollModalOpen(false);
    }
  };

  const hasActiveFilters = Boolean(debouncedSearchTerm) || statusFilter !== null;
  const clearFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setStatusFilter(null);
  };

  const statusSegments = stats ? getStatusSegments(stats) : [];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Status quick filters */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {isLoadingStats && !stats ? (
          <>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-28" />
          </>
        ) : (
          <>
            <StatusChip label="All devices" count={stats?.total} active={statusFilter === null} onClick={() => setStatusFilter(null)} />
            {statusSegments.map((segment) => {
              const meta = getDeviceStatusMeta(segment.status);
              return (
                <StatusChip
                  key={segment.status}
                  label={meta.label}
                  color={meta.color}
                  count={segment.count}
                  active={statusFilter === segment.status}
                  onClick={() => setStatusFilter(statusFilter === segment.status ? null : segment.status)}
                />
              );
            })}
          </>
        )}
      </div>

      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex w-full max-w-xl items-center gap-2">
          <Select value={searchField} onValueChange={(value) => setSearchField(value as SearchField)}>
            <SelectTrigger className="w-[130px] shrink-0" aria-label="Search in">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="id">Device ID</SelectItem>
              <SelectItem value="tags">Tags</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              aria-label={searchField === 'id' ? 'Search by device ID' : 'Search by tag'}
              placeholder={searchField === 'id' ? 'Search by device ID...' : 'Search by tag...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9"
            />
          </div>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="self-start sm:self-auto">
            <X className="mr-1 h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>

      {isLoading && devices.length === 0 && !error ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Loading devices...</p>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Devices</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <Button variant="link" onClick={() => fetchDevices(bookmarkHistory[currentPageIndex])} className="h-auto p-0">Try again?</Button>
          </AlertDescription>
        </Alert>
      ) : devices.length > 0 ? (
        <>
          <div className={cn('overflow-x-auto transition-opacity duration-300', isLoading && 'pointer-events-none opacity-50')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead column="id" title="Device" activeColumn={sortColumn} direction={sortDirection} onSort={requestSort} align="left" className="min-w-[240px]" />
                  <SortableTableHead column="status" title="Status" activeColumn={sortColumn} direction={sortDirection} onSort={requestSort} align="left" className="w-[160px]" />
                  <TableHead>Tags</TableHead>
                  <SortableTableHead column="createdAt" title="Registered" activeColumn={sortColumn} direction={sortDirection} onSort={requestSort} align="left" isDateColumn className="w-[170px]" />
                  <TableHead className="w-[60px] text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => {
                  const [iconColor, bgColor] = device.icon_color ? device.icon_color.split('-') : ['#0f67ff', '#F0F8FF'];
                  const detailsHref = `/devices/details?deviceId=${encodeURIComponent(device.id)}`;
                  return (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <DeviceIcon type={device.icon || 'HelpCircle'} iconColor={iconColor} bgColor={bgColor} />
                          <Link href={detailsHref} className="truncate font-medium text-primary hover:underline" title={device.id}>
                            {device.id}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell><DeviceStatusBadge status={device.status} /></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {device.tags && device.tags.length > 0 ? (
                            device.tags.map((tag: string) => <Badge key={tag} variant="secondary">{tag}</Badge>)
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DateDisplay date={device.creation_timestamp} className="text-xs" relativeClassName="text-xs" />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${device.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={detailsHref}><Eye className="mr-2 h-4 w-4" /> View Details</Link>
                            </DropdownMenuItem>
                            {device.status === 'NO_IDENTITY' && (
                              <DropdownMenuItem onClick={() => handleOpenEnrollModal(device)}>
                                <TerminalSquare className="mr-2 h-4 w-4" /> EST Enroll...
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <BookmarkPaginationFooter
            pageSizeId="groupDevicesPageSize"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            isLoading={isLoading}
            currentPageIndex={currentPageIndex}
            canGoNext={currentPageIndex < bookmarkHistory.length - 1 || Boolean(nextBookmark)}
            onPreviousPage={handlePreviousPage}
            onNextPage={handleNextPage}
          />
        </>
      ) : (
        <div className="rounded-lg border-2 border-dashed bg-muted/20 p-10 text-center">
          <MonitorSmartphone className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{hasActiveFilters ? 'No devices match these filters' : 'No devices in this group yet'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Try another search term or status.'
              : 'Devices appear here automatically as soon as they match every membership rule.'}
          </p>
          {hasActiveFilters && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>Clear filters</Button>
          )}
        </div>
      )}

      <EstEnrollModal
        isOpen={isEnrollModalOpen}
        onOpenChange={setIsEnrollModalOpen}
        ra={raForEnrollModal}
        initialDeviceId={deviceForEnrollModal?.id}
      />
    </div>
  );
}

function StatusChip({
  label,
  count,
  color,
  active,
  onClick,
}: Readonly<{ label: string; count?: number; color?: string; active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active ? 'border-primary/40 bg-primary/10 text-foreground' : 'bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {color && <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      <span>{label}</span>
      {count !== undefined && <span className="font-medium tabular-nums text-foreground">{count.toLocaleString()}</span>}
    </button>
  );
}
