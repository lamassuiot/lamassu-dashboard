'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Router as RouterIcon, Loader2, RefreshCw, Eye, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDevicesByKey } from '@/lib/device-inventory-api';

interface KeyDevicesLookupCardProps {
  keyId: string;
}

export const KeyDevicesLookupCard: React.FC<KeyDevicesLookupCardProps> = ({ keyId }) => {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    if (!keyId || authLoading || !isAuthenticated() || !user?.access_token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const devices = await fetchDevicesByKey(keyId, user.access_token);
      setDeviceIds(devices);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch devices for this key.');
      setDeviceIds([]);
    } finally {
      setIsLoading(false);
    }
  }, [keyId, user?.access_token, authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated()) {
      loadDevices();
    }
  }, [authLoading, isAuthenticated, loadDevices]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <RouterIcon className="h-4 w-4" />
              Assigned Devices
            </CardTitle>
            <CardDescription>
              Devices currently using this symmetric key.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadDevices} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Loading devices...</span>
          </div>
        ) : error ? (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
            <Button variant="link" size="sm" onClick={loadDevices} className="p-0 h-auto ml-2">
              Try again
            </Button>
          </div>
        ) : deviceIds.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
            <RouterIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            No devices are currently using this key.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviceIds.map((deviceId) => (
                  <TableRow key={deviceId}>
                    <TableCell className="font-mono text-sm">{deviceId}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/devices/details?deviceId=${encodeURIComponent(deviceId)}&tab=keyInventory`)}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View Device
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
