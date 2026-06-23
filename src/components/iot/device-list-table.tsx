
// src/components/iot/device-list-table.tsx
"use client";

import React from 'react';
import type { Device as AppDevice, ApiDevice } from '@/types/iot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { History, Loader2, AlertTriangle } from "lucide-react"; // Removed MoreHorizontal, PlayCircle, RefreshCw, Trash2
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useDms } from '@/contexts/DmsContext';
import { useRouter } from 'next/navigation'; // Added useRouter
import { apiFetch } from '@/lib/api-client';

const statusVariantMap: Record<ApiDevice['status'], "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: 'default',
  INACTIVE: 'secondary',
  PROVISIONING: 'outline',
  DEPROVISIONED: 'destructive',
  NO_IDENTITY: 'destructive',
};

const StatusBadge: React.FC<{ status: ApiDevice['status'] }> = ({ status }) => {
  let variant: "default" | "secondary" | "destructive" | "outline" = statusVariantMap[status] || 'secondary';
  let className = "";
  if (status === 'ACTIVE') {
    // Primary is green. So 'default' variant should work.
  } else if (status === 'PROVISIONING') {
    className = "border-accent text-accent";
    variant = 'outline';
  }
  return <Badge variant={variant} className={className}>{status || "Unknown"}</Badge>;
};


async function fetchDevicesForTable(selectedDmsId: string | null): Promise<AppDevice[]> {
  let apiUrl = '/api/devices';
  if (selectedDmsId) {
    apiUrl += `?dms_owner=${encodeURIComponent(selectedDmsId)}`;
  }

  const response = await apiFetch(apiUrl);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: `Failed to fetch devices. Status: ${response.status}` }));
    throw new Error(errorData.message || `Failed to fetch devices`);
  }
  const apiDevices: ApiDevice[] = await response.json();
  
  return apiDevices.map(apiDevice => ({
    id: apiDevice.id,
    name: apiDevice.id, 
    status: apiDevice.status as AppDevice['status'],
    currentFirmware: apiDevice.identity?.active_version?.toString() || "N/A",
    lastSeen: apiDevice.creation_timestamp, 
    location: apiDevice.dms_owner || "N/A", 
    dmsOwner: apiDevice.dms_owner,
  }));
}


export function DeviceListTable() {
  const [selectedDevices, setSelectedDevices] = React.useState<Set<string>>(new Set());
  const { isAuthenticated } = useAuth();
  const { selectedDms } = useDms();
  const router = useRouter(); // Initialize useRouter

  const { data: devices = [], isLoading, error, refetch } = useQuery<AppDevice[], Error>({
    queryKey: ['devices', selectedDms?.id],
    queryFn: async () => {
      return fetchDevicesForTable(selectedDms?.id || null);
    },
    enabled: isAuthenticated() && !!selectedDms?.id,
  });

  const handleSelectAll = (checked: boolean | string) => { // Updated type for onCheckedChange
    if (checked) {
      setSelectedDevices(new Set(devices.map(d => d.id)));
    } else {
      setSelectedDevices(new Set());
    }
  };

  const handleSelectDevice = (deviceId: string, checked: boolean | string) => { // Updated type for onCheckedChange
    const newSelected = new Set(selectedDevices);
    if (checked) {
      newSelected.add(deviceId);
    } else {
      newSelected.delete(deviceId);
    }
    setSelectedDevices(newSelected);
  };

  const handleViewTimeline = (deviceId: string) => {
    if (selectedDms?.id) {
      router.push(`/device-management/${deviceId}/history`);
    } else {
      // Handle case where DMS ID is not available, perhaps show a toast
      console.error("Cannot view timeline: DMS ID is not selected.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg shadow overflow-hidden p-4 mt-4 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-2" />
        <p className="text-destructive font-semibold">Error loading devices</p>
        <p className="text-sm text-muted-foreground mb-3">{error.message}</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }
  
  return (
    <div className="bg-card rounded-lg shadow overflow-hidden mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={selectedDevices.size > 0 && selectedDevices.size === devices.length && devices.length > 0}
                onCheckedChange={handleSelectAll}
                aria-label="Select all devices"
                disabled={devices.length === 0}
              />
            </TableHead>
            <TableHead>Device ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Firmware Ver.</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>DMS Owner</TableHead>
            <TableHead className="text-right w-[160px]">Update Timeline</TableHead> {/* Changed column name and width */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device) => (
            <TableRow key={device.id} data-state={selectedDevices.has(device.id) ? "selected" : ""}>
              <TableCell>
                <Checkbox
                  checked={selectedDevices.has(device.id)}
                  onCheckedChange={(checked) => handleSelectDevice(device.id, checked)}
                  aria-label={`Select device ${device.id}`}
                />
              </TableCell>
              <TableCell className="font-mono text-xs">{device.id}</TableCell>
              <TableCell>
                <StatusBadge status={device.status as ApiDevice['status']} />
              </TableCell>
              <TableCell>{device.currentFirmware}</TableCell>
              <TableCell>
                {device.lastSeen ? formatDistanceToNow(parseISO(device.lastSeen), { addSuffix: true }) : 'N/A'}
              </TableCell>
              <TableCell>{device.dmsOwner}</TableCell>
              <TableCell className="text-right">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleViewTimeline(device.id)}
                  className="h-8 px-3 gap-1.5"
                >
                  <History className="h-4 w-4" />
                  View Timeline
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {devices.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No devices found for the selected DMS or matching criteria.
        </div>
      )}
       <div className="p-4 border-t flex items-center justify-between text-sm text-muted-foreground">
        <span>{selectedDevices.size} of {devices.length} device(s) selected.</span>
      </div>
    </div>
  );
}
