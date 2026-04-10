
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { requireAccessToken } from '@/lib/auth-session';
import {
  get_KMS_API_BASE_URL,
  get_CA_API_BASE_URL,
  get_DEV_MANAGER_API_BASE_URL,
  get_DMS_MANAGER_API_BASE_URL,
  get_ALERTS_API_BASE_URL,
  get_VA_API_BASE_URL
} from '@/lib/api-domains';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ServiceStatus {
    name: string;
    url: string;
    status: 'ok' | 'error' | 'loading';
    version?: string;
    errorDetails?: string;
}

export function servicesToCheck() 
{ 
    return [
    { name: 'KMS Service', url: get_KMS_API_BASE_URL() },
    { name: 'CA Service', url: get_CA_API_BASE_URL() },
    { name: 'Device Manager', url: get_DEV_MANAGER_API_BASE_URL() },
    { name: 'DMS Manager', url: get_DMS_MANAGER_API_BASE_URL() },
    { name: 'Alerts Service', url: get_ALERTS_API_BASE_URL() },
    { name: 'Validation Authority', url: get_VA_API_BASE_URL() }
]
};

export const BackendStatusCheck: React.FC = () => {
    const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    const fetchStatuses = useCallback(async () => {
        
        setIsLoading(true);
        setStatuses(servicesToCheck().map(s => ({ ...s, status: 'loading' })));

        const statusPromises = servicesToCheck().map(async (service): Promise<ServiceStatus> => {
            try {
                const accessToken = requireAccessToken();
                const healthCheckUrl = `${service.url.substring(0, service.url.lastIndexOf('/'))}/health`;
                
                const response = await fetch(healthCheckUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.health === false) {
                    return {
                        ...service,
                        status: 'error',
                        version: data.version || 'N/A',
                        errorDetails: 'Service reported as unhealthy',
                    };
                }
                
                return {
                    ...service,
                    status: 'ok',
                    version: data.version || 'N/A',
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
    }, []);
    
    useEffect(() => {
        fetchStatuses();
    }, [fetchStatuses]);

    return (
        <Card className="border-border">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Backend Services Status</CardTitle>
                        <CardDescription>
                            Health and version information for core backend services.
                        </CardDescription>
                    </div>
                     <Button variant="outline" size="icon" onClick={fetchStatuses} disabled={isLoading}>
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                     </Button>
                </div>
            </CardHeader>
            <CardContent>
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
                                </TableCell>
                                <TableCell>
                                    {service.version ? <Badge variant={service.status === 'ok' ? 'secondary' : 'outline'}>{service.version}</Badge> : null}
                                    {service.status === 'error' && !service.version && <Badge variant="destructive">Error</Badge>}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
