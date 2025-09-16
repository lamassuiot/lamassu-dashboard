
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import {
  get_CA_API_BASE_URL,
  get_DEV_MANAGER_API_BASE_URL,
  get_DMS_MANAGER_API_BASE_URL,
  get_ALERTS_API_BASE_URL,
  get_VA_API_BASE_URL
} from '@/lib/api-domains';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';

interface BackendStatusDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

interface ServiceStatus {
    name: string;
    url: string;
    status: 'ok' | 'error' | 'loading';
    version?: string;
    build?: string;
    build_time?: string;
    errorDetails?: string;
}

const servicesToCheck = [
    { name: 'CA Service', url: get_CA_API_BASE_URL() },
    { name: 'Device Manager', url: get_DEV_MANAGER_API_BASE_URL() },
    { name: 'DMS Manager', url: get_DMS_MANAGER_API_BASE_URL() },
    { name: 'Alerts Service', url: get_ALERTS_API_BASE_URL() },
    { name: 'Validation Authority', url: get_VA_API_BASE_URL() }
];

export const BackendStatusDialog: React.FC<BackendStatusDialogProps> = ({ isOpen, onOpenChange }) => {
    const { user } = useAuth();
    const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    const fetchStatuses = useCallback(async () => {
        if (!user?.access_token) return;

        setIsLoading(true);
        setStatuses(servicesToCheck.map(s => ({ ...s, status: 'loading' })));

        const statusPromises = servicesToCheck.map(async (service): Promise<ServiceStatus> => {
            try {
                const healthCheckUrl = `${service.url.substring(0, service.url.lastIndexOf('/'))}/health`;
                
                const response = await fetch(healthCheckUrl, {
                    headers: { 'Authorization': `Bearer ${user.access_token}` },
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} - ${response.statusText}`);
                }

                const data = await response.json();

                if (data.health === false) {
                    return {
                        ...service,
                        status: 'error',
                        version: data.version || 'N/A',
                        build: data.build,
                        build_time: data.build_time,
                        errorDetails: 'Service reported as unhealthy',
                    };
                }
                
                return {
                    ...service,
                    status: 'ok',
                    version: data.version || 'N/A',
                    build: data.build,
                    build_time: data.build_time
                };
            } catch (error: any) {
                return {
                    ...service,
                    status: 'error',
                    errorDetails: error.message || 'Unknown fetch error',
                };
            }
        });

        const results = await Promise.all(statusPromises);
        setStatuses(results);
        setIsLoading(false);
    }, [user?.access_token]);
    
    useEffect(() => {
        if(isOpen) {
            fetchStatuses();
        }
    }, [isOpen, fetchStatuses]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg md:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Backend Services Status</DialogTitle>
                    <DialogDescription>
                        Health and version information for core backend services.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40px]">Status</TableHead>
                                <TableHead>Service</TableHead>
                                <TableHead>Version</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {statuses.map(service => (
                                <TableRow key={service.name}>
                                    <TableCell>
                                        {service.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                        {service.status === 'ok' && <CheckCircle className="h-5 w-5 text-green-500" />}
                                        {service.status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-medium">{service.name}</p>
                                        <p className="text-xs text-muted-foreground font-mono">{service.url}</p>
                                        {service.build && (
                                            <p className="text-xs text-muted-foreground font-mono mt-1" title={`Build Time: ${service.build_time}`}>
                                                Build: {service.build.substring(0, 7)} ({service.build_time ? format(parseISO(service.build_time), 'PPp') : 'N/A'})
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {service.version ? <Badge variant={service.status === 'ok' ? 'secondary' : 'outline'}>{service.version}</Badge> : null}
                                        {service.status === 'error' && !service.version && <Badge variant="destructive">Error</Badge>}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                
                <DialogFooter>
                    <div className="w-full flex justify-between">
                        <Button variant="outline" onClick={fetchStatuses} disabled={isLoading}>
                            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                            Refresh
                        </Button>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">Close</Button>
                        </DialogClose>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
