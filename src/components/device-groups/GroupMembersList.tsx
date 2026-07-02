'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  AlertCircle, 
  Loader2, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsUpDown,
  ArrowUpZA,
  ArrowDownAZ,
  ArrowUp01,
  ArrowDown10,
  Eye,
  MoreVertical,
  TerminalSquare,
  HelpCircle
} from 'lucide-react';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDevicesByGroup } from '@/lib/device-groups-api';
import type { ApiDevice } from '@/lib/devices-api';
import { cn } from '@/lib/utils';
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { sileo } from '@/lib/toast';
import { EstEnrollModal } from '@/components/shared/EstEnrollModal';
import { fetchRaById, type ApiRaItem } from '@/lib/dms-api';

interface GroupMembersListProps {
  groupId: string;
  className?: string;
}

type DeviceStatus = 'ACTIVE' | 'NO_IDENTITY' | 'RENEWAL_PENDING' | 'EXPIRING_SOON' | 'EXPIRED' | 'REVOKED' | 'DECOMMISSIONED';
type SortableColumn = 'id' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

const StatusBadge: React.FC<{ status: DeviceStatus }> = ({ status }) => {
  let badgeClass = "";
  switch (status) {
    case 'ACTIVE':
      badgeClass = "bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700";
      break;
    case 'RENEWAL_PENDING':
        badgeClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-700/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700";
        break;
    case 'EXPIRING_SOON':
        badgeClass = "bg-orange-100 text-orange-700 dark:bg-orange-700/30 dark:text-orange-300 border-orange-300 dark:border-orange-700";
        break;
    case 'EXPIRED':
        badgeClass = "bg-purple-100 text-purple-700 dark:bg-purple-700/30 dark:text-purple-300 border-purple-300 dark:border-purple-700";
        break;
    case 'REVOKED':
        badgeClass = "bg-red-100 text-red-700 dark:bg-red-700/30 dark:text-red-300 border-red-300 dark:border-red-700";
        break;
    case 'NO_IDENTITY':
      badgeClass = "bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-300 border-sky-300 dark:border-sky-700";
      break;
    case 'DECOMMISSIONED':
      badgeClass = "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-400 dark:border-gray-600";
      break;
    default:
      badgeClass = "bg-muted text-muted-foreground border-border";
  }
  return <Badge variant="secondary" className={cn("text-xs capitalize", badgeClass)}>{status.replace('_', ' ').toLowerCase()}</Badge>;
};

const DeviceIcon: React.FC<{ type: string; iconColor?: string; bgColor?: string; }> = ({ type, iconColor, bgColor }) => {
  const IconComponent = getLucideIconByName(type);

  return (
    <div className={cn("p-1.5 rounded-md inline-flex items-center justify-center")} style={{ backgroundColor: bgColor || '#F0F8FF' }}>
      {IconComponent ? (
        <IconComponent className={cn("h-5 w-5")} style={{ color: iconColor || '#0f67ff' }} />
      ) : (
        <HelpCircle className={cn("h-5 w-5")} style={{ color: iconColor || '#0f67ff' }} />
      )}
    </div>
  );
};

export function GroupMembersList({ groupId, className }: GroupMembersListProps) {
  const router = useRouter();
  
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState('20');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<'id' | 'tags'>('id');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'ALL'>('ALL');
  const [sortConfig, setSortConfig] = useState<SortConfig>({column: 'createdAt', direction: 'desc'});
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [bookmarkHistory, setBookmarkHistory] = useState<(string | undefined)[]>([undefined]);
  const [nextBookmark, setNextBookmark] = useState<string | null>(null);

  // Modal states for EST enrollment
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [raForEnrollModal, setRaForEnrollModal] = useState<ApiRaItem | null>(null);
  const [deviceForEnrollModal, setDeviceForEnrollModal] = useState<ApiDevice | null>(null);

  // Column visibility state
  const [columnVisibility] = useState<Record<string, boolean>>({
    id: true,
    status: true,
    createdAt: true,
    tags: true,
  });

  const fetchDevices = useCallback(async (bookmark?: string, pageIndex?: number) => {
    
    try {
      setIsLoading(true);
      setError(null);

      // Apply sorting
      let apiSortColumn = sortConfig.column;
      if (apiSortColumn === 'createdAt') {
        apiSortColumn = 'creation_timestamp';
      }

      // Apply filters
      const filtersToApply: string[] = [];
      if (searchTerm.trim() !== '') {
        filtersToApply.push(`${searchField}[contains_ignorecase]${searchTerm.trim()}`);
      }
      if (statusFilter !== 'ALL') {
        filtersToApply.push(`status[equal]${statusFilter}`);
      }

      const response = await getDevicesByGroup(groupId, {
        pageSize: Number.parseInt(pageSize),
        bookmark: bookmark || undefined,
        sortBy: apiSortColumn as any,
        sortMode: sortConfig.direction as any,
        filters: filtersToApply.length > 0 ? filtersToApply : undefined,
      });

      setDevices(response.list);
      setNextBookmark(response.next || null);
      
      if (pageIndex !== undefined) {
        setCurrentPageIndex(pageIndex);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch devices';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, pageSize, sortConfig, searchTerm, searchField, statusFilter]);

  const refresh = () => {
    setCurrentPageIndex(0);
    setBookmarkHistory([undefined]);
    fetchDevices(undefined, 0);
  };

  const handleNextPage = () => {
    if (isLoading) return;
    const potentialNextPageIndex = currentPageIndex + 1;
    if (potentialNextPageIndex < bookmarkHistory.length) {
      setCurrentPageIndex(potentialNextPageIndex);
    } else if (nextBookmark) {
      const newStack = bookmarkHistory.slice(0, currentPageIndex + 1);
      setBookmarkHistory([...newStack, nextBookmark]);
      setCurrentPageIndex(newStack.length);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    const prevIndex = currentPageIndex - 1;
    setCurrentPageIndex(prevIndex);
  };

  const requestSort = (column: SortableColumn) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };

  const handleViewDetails = (deviceId: string) => {
    router.push(`/devices/details?deviceId=${deviceId}`);
  };

  const handleOpenEnrollModal = async (device: ApiDevice) => {
    setDeviceForEnrollModal(device);
    setRaForEnrollModal(null);
    setIsEnrollModalOpen(true);

    try {
      const raData = await fetchRaById(device.dms_owner);
      setRaForEnrollModal(raData);
    } catch (err: any) {
      sileo.error({ title: 'Error Fetching RA Details', description: err.message });
      setIsEnrollModalOpen(false);
    }
  };

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPageIndex(0);
    setBookmarkHistory([undefined]);
  }, [searchTerm, searchField, statusFilter, pageSize, sortConfig]);

  useEffect(() => {
    if (currentPageIndex < bookmarkHistory.length) {
      fetchDevices(bookmarkHistory[currentPageIndex], currentPageIndex);
    }
  }, [currentPageIndex, bookmarkHistory, fetchDevices]);

  // Client-side filtering is no longer needed - filtering happens on the server
  const sortedDevices = useMemo(() => {
    return [...devices];
  }, [devices]);

  const SortableTableHeader: React.FC<{ column: SortableColumn; title: string; className?: string }> = ({ column, title, className }) => {
    const isSorted = sortConfig?.column === column;
    let Icon = ChevronsUpDown;
    if (isSorted) {
      if (column === 'createdAt') {
        Icon = sortConfig?.direction === 'asc' ? ArrowUp01 : ArrowDown10;
      } else {
        Icon = sortConfig?.direction === 'asc' ? ArrowUpZA : ArrowDownAZ;
      }
    } else if (column === 'createdAt') {
      Icon = ChevronsUpDown;
    }

    return (
      <TableHead className={cn("cursor-pointer hover:bg-muted/60", 
        column === 'createdAt' && "text-center", 
        className)} onClick={() => requestSort(column)}>
        <div className={cn("flex items-center gap-1", 
          column === 'createdAt' && "justify-center")}>
          {title} <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
        </div>
      </TableHead>
    );
  };

  const statusOptions = [
    { label: 'All Statuses', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'No Identity', value: 'NO_IDENTITY' },
    { label: 'Renewal Pending', value: 'RENEWAL_PENDING' },
    { label: 'Expiring Soon', value: 'EXPIRING_SOON' },
    { label: 'Expired', value: 'EXPIRED' },
    { label: 'Revoked', value: 'REVOKED' },
    { label: 'Decommissioned', value: 'DECOMMISSIONED' },
  ];

  const hasActiveFilters = searchTerm || statusFilter !== 'ALL';

  return (
    <div className={cn("space-y-4 py-4", className)}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
        <div className="space-y-1">
          <Label htmlFor="deviceSearchTerm">Search Term</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              id="deviceSearchTerm"
              type="text"
              placeholder="Filter by ID or Tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10"
              disabled={isLoading}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="deviceSearchField">Search In</Label>
          <Select value={searchField} onValueChange={(value: 'id' | 'tags') => setSearchField(value)} disabled={isLoading}>
            <SelectTrigger id="deviceSearchField">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="id">Device ID</SelectItem>
              <SelectItem value="tags">Tags</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="deviceStatusFilter">Status</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DeviceStatus | 'ALL')} disabled={isLoading}>
            <SelectTrigger id="deviceStatusFilter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && devices.length === 0 ? (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Loading devices...</p>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Devices</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" onClick={refresh} className="p-0 h-auto ml-1">Try again?</Button>
          </AlertDescription>
        </Alert>
      ) : sortedDevices.length > 0 ? (
        <>
          <div className={cn("overflow-x-auto transition-opacity duration-300", isLoading && "opacity-50 pointer-events-none")}>
            <Table>
              <TableHeader>
                <TableRow>
                  {columnVisibility.id && <SortableTableHeader column="id" title="ID" className="w-[250px]" />}
                  {columnVisibility.status && <SortableTableHeader column="status" title="Status" className="w-[120px]" />}
                  {columnVisibility.createdAt && <SortableTableHeader column="createdAt" title="Created At" className="w-[180px]" />}
                  {columnVisibility.tags && <TableHead>Tags</TableHead>}
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDevices.map((device) => {
                  const [iconColor, bgColor] = device.icon_color ? device.icon_color.split('-') : ['#0f67ff', '#F0F8FF'];
                  return (
                    <TableRow key={device.id}>
                      {columnVisibility.id && (
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <DeviceIcon type={device.icon || 'HelpCircle'} iconColor={iconColor} bgColor={bgColor} />
                            <Button
                              variant="link"
                              className="font-medium truncate p-0 h-auto text-left"
                              onClick={() => handleViewDetails(device.id)}
                              title={`View details for ${device.id}`}
                            >
                              {device.id}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                      {columnVisibility.status && (
                        <TableCell><StatusBadge status={device.status as DeviceStatus} /></TableCell>
                      )}
                      {columnVisibility.createdAt && (
                        <TableCell>
                          <DateDisplay 
                            date={device.creation_timestamp} 
                           
                            className="text-xs"
                            relativeClassName="text-xs"
                          />
                        </TableCell>
                      )}
                      {columnVisibility.tags && (
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {device.tags && device.tags.length > 0 ? (
                              device.tags.map((tag: string) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)
                            ) : (
                              <span className="text-muted-foreground text-xs">No tags</span>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Device Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(device.id)}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
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
          <div className="flex justify-between items-center mt-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="pageSizeSelect" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger id="pageSizeSelect" className="w-[80px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Button onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0} variant="secondary">
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button onClick={handleNextPage} disabled={isLoading || !(currentPageIndex < bookmarkHistory.length - 1 || nextBookmark)} variant="secondary">
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? "No devices match the current filter."
              : 'No devices currently match the filter criteria for this group.'}
          </p>
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
