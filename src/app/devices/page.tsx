
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpCircle, Eye, PlusCircle, MoreVertical, Loader2, RefreshCw, ChevronRight, AlertCircle as AlertCircleIcon, ChevronLeft, Search, ChevronsUpDown, ArrowUpZA, ArrowDownAZ, ArrowUp01, ArrowDown10, TerminalSquare } from "lucide-react";
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RegisterDeviceModal } from '@/components/devices/RegisterDeviceModal';
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { fetchDevices } from '@/lib/devices-api';
import { useToast } from '@/hooks/use-toast';
import { EstEnrollModal } from '@/components/shared/EstEnrollModal';
import { fetchRaById, type ApiRaItem } from '@/lib/dms-api';

type DeviceStatus = 'ACTIVE' | 'NO_IDENTITY' | 'RENEWAL_PENDING' | 'EXPIRING_SOON' | 'EXPIRED' | 'REVOKED' | 'DECOMMISSIONED';

interface DeviceData {
  id: string;
  displayId: string;
  iconType: string;
  icon_color: string;
  status: DeviceStatus;
  deviceGroup: string;
  createdAt: string;
  tags: string[];
  lastSeen?: string;
  ipAddress?: string;
  firmwareVersion?: string;
}

interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

const statusSortOrder: Record<DeviceStatus, number> = {
  'ACTIVE': 0,
  'EXPIRING_SOON': 1,
  'RENEWAL_PENDING': 2,
  'NO_IDENTITY': 3,
  'EXPIRED': 4,
  'REVOKED': 5,
  'DECOMMISSIONED': 6,
};


export const StatusBadge: React.FC<{ status: DeviceStatus }> = ({ status }) => {
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
  return <Badge variant="outline" className={cn("text-xs capitalize", badgeClass)}>{status.replace('_', ' ').toLowerCase()}</Badge>;
};

export const mapApiIconToIconType = (apiIcon: string): string => {
  return apiIcon || 'HelpCircle'; // Pass through name, or default.
};

export const DeviceIcon: React.FC<{ type: string; iconColor?: string; bgColor?: string; }> = ({ type, iconColor, bgColor }) => {
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

type SortableColumn = 'id' | 'status' | 'deviceGroup' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export default function DevicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [isLoadingApi, setIsLoadingApi] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const dmsOwnerFilter = searchParams.get('dms_owner');

  // Filter states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [searchField, setSearchField] = useState<'id' | 'tags'>('id');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'ALL'>('ALL');

  // Sorting and pagination states
  const [pageSize, setPageSize] = useState<string>('10');
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({column: 'createdAt', direction: 'desc'});
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);

  // Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [raForEnrollModal, setRaForEnrollModal] = useState<ApiRaItem | null>(null);
  const [deviceForEnrollModal, setDeviceForEnrollModal] = useState<DeviceData | null>(null);
  
  const isInitialLoad = useRef(true);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
        if (isInitialLoad.current && searchTerm === '') {
            return;
        }
        setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => {
        clearTimeout(handler);
    };
  }, [searchTerm]);

  const fetchData = useCallback(async (bookmarkToFetch: string | null) => {
    if (authLoading || !isAuthenticated() || !user?.access_token) {
        if (!authLoading && !isAuthenticated()) {
            setApiError("User not authenticated.");
        }
        setIsLoadingApi(false);
        setDevices([]);
        setNextTokenFromApi(null);
        return;
    }
    
    setIsLoadingApi(true);
    setApiError(null);
    
    try {
        const params = new URLSearchParams();
        if (sortConfig) {
            let apiSortColumn = sortConfig.column;
            if(apiSortColumn === 'deviceGroup') {
                apiSortColumn = 'dms_owner';
            } else if (apiSortColumn === 'createdAt') {
                apiSortColumn = 'creation_timestamp';
            }
            params.append('sort_by', apiSortColumn);
            params.append('sort_mode', sortConfig.direction);
        } else {
             params.append('sort_by', 'creation_timestamp');
             params.append('sort_mode', 'desc');
        }
        
        params.append('page_size', pageSize);
        if (bookmarkToFetch) {
            params.append('bookmark', bookmarkToFetch);
        }
        
        const filtersToApply: string[] = [];
        if (dmsOwnerFilter) filtersToApply.push(`dms_owner[equal]${dmsOwnerFilter}`);
        if (debouncedSearchTerm.trim() !== '') filtersToApply.push(`${searchField}[contains]${debouncedSearchTerm.trim()}`);
        if (statusFilter !== 'ALL') filtersToApply.push(`status[equal]${statusFilter}`);
        filtersToApply.forEach(f => params.append('filter', f));

        const data = await fetchDevices(user.access_token!, params);
        const transformedDevices: DeviceData[] = data.list.map(apiDevice => ({
            id: apiDevice.id,
            displayId: apiDevice.id,
            iconType: mapApiIconToIconType(apiDevice.icon),
            icon_color: apiDevice.icon_color,
            status: apiDevice.status as DeviceStatus,
            deviceGroup: apiDevice.dms_owner,
            createdAt: apiDevice.creation_timestamp,
            tags: apiDevice.tags || [],
        }));

        setDevices(transformedDevices);
        setNextTokenFromApi(data.next);
    } catch (error: any) {
        console.error("Failed to fetch devices:", error);
        setApiError(error.message || "An unknown error occurred while fetching devices.");
        setDevices([]);
        setNextTokenFromApi(null);
    } finally {
        setIsLoadingApi(false);
        if (isInitialLoad.current) isInitialLoad.current = false;
    }
  }, [authLoading, isAuthenticated, user, sortConfig, pageSize, dmsOwnerFilter, debouncedSearchTerm, searchField, statusFilter]);

  // Effect for filter changes
  useEffect(() => {
    if (!isInitialLoad.current) {
        setCurrentPageIndex(0);
        setBookmarkStack([null]);
    }
  }, [debouncedSearchTerm, searchField, statusFilter, pageSize, dmsOwnerFilter, sortConfig]);

  // Main data fetching effect
  useEffect(() => {
    if (bookmarkStack[currentPageIndex] !== undefined) {
        fetchData(bookmarkStack[currentPageIndex]);
    }
  }, [currentPageIndex, bookmarkStack, fetchData]);


  const requestSort = (column: SortableColumn) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };

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
      <TableHead className={cn("cursor-pointer hover:bg-muted/60", className)} onClick={() => requestSort(column)}>
        <div className="flex items-center gap-1">
          {title} <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
        </div>
      </TableHead>
    );
  };


  const handleCreateNewDevice = () => {
    setIsRegisterModalOpen(true);
  };

  const handleDeviceRegistered = () => {
    handleRefresh();
  };

  const handleViewDetails = (deviceIdValue: string) => {
    router.push(`/devices/details?deviceId=${deviceIdValue}`);
  };

  const handleOpenEnrollModal = async (device: DeviceData) => {
    if (!user?.access_token) {
        toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
        return;
    }

    setDeviceForEnrollModal(device);
    setRaForEnrollModal(null); // Clear previous RA data
    setIsEnrollModalOpen(true);

    // Fetch RA details after opening the modal to show loading state inside
    try {
        const raData = await fetchRaById(device.deviceGroup, user.access_token);
        setRaForEnrollModal(raData);
    } catch (err: any) {
        toast({ title: 'Error Fetching RA Details', description: err.message, variant: 'destructive' });
        setIsEnrollModalOpen(false); // Close on error
    }
  };


  const handleRefresh = () => {
    if (currentPageIndex < bookmarkStack.length) {
      fetchData(bookmarkStack[currentPageIndex]);
    }
  };

  const handleNextPage = () => {
    if (isLoadingApi) return;
    const potentialNextPageIndex = currentPageIndex + 1;
    if (potentialNextPageIndex < bookmarkStack.length) {
        setCurrentPageIndex(potentialNextPageIndex);
    }
    else if (nextTokenFromApi) {
        const newStack = bookmarkStack.slice(0, currentPageIndex + 1);
        setBookmarkStack([...newStack, nextTokenFromApi]);
        setCurrentPageIndex(newStack.length);
    }
  };

  const handlePreviousPage = () => {
    if (isLoadingApi || currentPageIndex === 0) return;
    const prevIndex = currentPageIndex - 1;
    setCurrentPageIndex(prevIndex);
  };

  if (authLoading && !sortedDevices.length) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Authenticating...</p>
      </div>
    );
  }

  const hasActiveFilters = debouncedSearchTerm || statusFilter !== 'ALL' || dmsOwnerFilter;

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <DeviceIcon type="CgSmartphoneChip" />
          <h1 className="text-2xl font-headline font-semibold">Managed Devices</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleRefresh} variant="outline" disabled={isLoadingApi}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingApi && "animate-spin")} /> Refresh
          </Button>
          <Button onClick={handleCreateNewDevice} disabled={isLoadingApi}>
            <PlusCircle className="mr-2 h-4 w-4" /> Register New Device
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Overview of all registered IoT devices, their status, and associated groups.
      </p>

      {dmsOwnerFilter && (
        <Alert variant="default" className="my-4">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Filtering by Registration Authority</AlertTitle>
          <AlertDescription>
            Showing devices owned by <strong>{dmsOwnerFilter}</strong>.
            <Button variant="link" onClick={() => router.push('/devices')} className="p-0 h-auto ml-2 text-primary">
              Clear filter
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="space-y-1">
          <Label htmlFor="searchTermInput">Search Term</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              id="searchTermInput"
              type="text"
              placeholder="Filter by ID or Tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10"
              disabled={isLoadingApi || authLoading}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="searchFieldSelect">Search In</Label>
          <Select value={searchField} onValueChange={(value: 'id' | 'tags') => setSearchField(value)} disabled={isLoadingApi || authLoading}>
            <SelectTrigger id="searchFieldSelect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="id">Device ID</SelectItem>
              <SelectItem value="tags">Tags</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1">
          <Label htmlFor="statusFilter">Status</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DeviceStatus | 'ALL')} disabled={isLoadingApi || authLoading}>
            <SelectTrigger id="statusFilter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="NO_IDENTITY">No Identity</SelectItem>
              <SelectItem value="RENEWAL_PENDING">Renewal Pending</SelectItem>
              <SelectItem value="EXPIRING_SOON">Expiring Soon</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="REVOKED">Revoked</SelectItem>
              <SelectItem value="DECOMMISSIONED">Decommissioned</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoadingApi && !sortedDevices.length && (
         <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">Loading devices...</p>
        </div>
      )}

      {apiError && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertTitle>Error Fetching Devices</AlertTitle>
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}

      {!apiError && sortedDevices.length > 0 && (
        <>
          <div className={cn("overflow-x-auto transition-opacity duration-300", isLoadingApi && sortedDevices.length > 0 && "opacity-50 pointer-events-none")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHeader column="id" title="ID" className="w-[250px]" />
                  <SortableTableHeader column="status" title="Status" className="w-[120px]" />
                  <SortableTableHeader column="deviceGroup" title="Device Group" className="w-[180px]" />
                  <SortableTableHeader column="createdAt" title="Created At" className="w-[180px]" />
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDevices.map((device) => {
                  const [iconColor, bgColor] = device.icon_color ? device.icon_color.split('-') : ['#0f67ff', '#F0F8FF'];
                  return (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <DeviceIcon type={device.iconType} iconColor={iconColor} bgColor={bgColor} />
                          <Button
                            variant="link"
                            className="font-medium truncate p-0 h-auto text-left"
                            onClick={() => handleViewDetails(device.id)}
                            title={`View details for ${device.displayId}`}
                          >
                            {device.displayId}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={device.status} /></TableCell>
                      <TableCell><Badge variant="secondary" className="truncate" title={device.deviceGroup}>{device.deviceGroup}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                            <span className="text-xs">{format(parseISO(device.createdAt), 'dd/MM/yyyy HH:mm')}</span>
                            <span className="text-xs text-muted-foreground">{formatDistanceToNowStrict(parseISO(device.createdAt))} ago</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {device.tags.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
                        </div>
                      </TableCell>
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
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {!apiError && (sortedDevices.length > 0 || isLoadingApi || hasActiveFilters) && (
        <div className="flex justify-between items-center mt-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="pageSizeSelectBottom" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
              <Select
                value={pageSize}
                onValueChange={(value) => setPageSize(value)}
                disabled={isLoadingApi || authLoading}
              >
                <SelectTrigger id="pageSizeSelectBottom" className="w-[80px]">
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
                <Button
                    onClick={handlePreviousPage}
                    disabled={isLoadingApi || currentPageIndex === 0}
                    variant="outline"
                >
                    <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                </Button>
                <Button
                    onClick={handleNextPage}
                    disabled={isLoadingApi || !(currentPageIndex < bookmarkStack.length - 1 || nextTokenFromApi)}
                    variant="outline"
                >
                    Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
      )}

      {!apiError && !isLoadingApi && sortedDevices.length === 0 && (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">
            {hasActiveFilters ? "No Devices Found" : "No Devices Registered"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try adjusting your filters or clear them to see all devices."
              : "There are no devices registered in the system yet."
            }
          </p>
          <Button onClick={handleCreateNewDevice} className="mt-4">
            <PlusCircle className="mr-2 h-4 w-4" /> Register New Device
          </Button>
        </div>
      )}

      <RegisterDeviceModal
        isOpen={isRegisterModalOpen}
        onOpenChange={setIsRegisterModalOpen}
        onDeviceRegistered={handleDeviceRegistered}
      />
      <EstEnrollModal
        isOpen={isEnrollModalOpen}
        onOpenChange={setIsEnrollModalOpen}
        ra={raForEnrollModal}
        initialDeviceId={deviceForEnrollModal?.id}
      />
    </div>
  );
}
