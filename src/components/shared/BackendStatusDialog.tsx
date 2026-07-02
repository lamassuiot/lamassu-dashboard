
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from '@/lib/api-client';
import {
    get_KMS_API_BASE_URL,
    get_CA_API_BASE_URL,
    get_DEV_MANAGER_API_BASE_URL,
    get_DMS_MANAGER_API_BASE_URL,
    get_ALERTS_API_BASE_URL,
    get_VA_API_BASE_URL
} from '@/lib/api-domains';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { DialogBrandHeader } from '@/components/shared/DialogBrandHeader';

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
    { name: 'KMS Service', url: get_KMS_API_BASE_URL() },
    { name: 'CA Service', url: get_CA_API_BASE_URL() },
    { name: 'Device Manager', url: get_DEV_MANAGER_API_BASE_URL() },
    { name: 'DMS Manager', url: get_DMS_MANAGER_API_BASE_URL() },
    { name: 'Alerts Service', url: get_ALERTS_API_BASE_URL() },
    { name: 'Validation Authority', url: get_VA_API_BASE_URL() },
];

function StatusDot({ status }: { status: ServiceStatus['status'] }) {
    if (status === 'loading') {
        return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    }
    if (status === 'ok') {
        return (
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
        );
    }
    return <span className="inline-flex rounded-full h-2 w-2 bg-destructive" />;
}

function formatBuildTime(build_time: string | undefined): string {
    if (!build_time) return '—';
    try {
        return format(parseISO(build_time), 'yyyy-MM-dd HH:mm');
    } catch {
        return '—';
    }
}

export const BackendStatusDialog: React.FC<BackendStatusDialogProps> = ({ isOpen, onOpenChange }) => {
    const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const fetchStatuses = useCallback(async () => {
        setIsLoading(true);
        setStatuses(servicesToCheck.map(s => ({ ...s, status: 'loading' })));

        const results = await Promise.all(
            servicesToCheck.map(async (service): Promise<ServiceStatus> => {
                try {
                    const healthCheckUrl = `${service.url.substring(0, service.url.lastIndexOf('/'))}/health`;
                    const response = await apiFetch(healthCheckUrl);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} ${response.statusText}`);
                    }

                    const data = await response.json();

                    if (data.health === false) {
                        return {
                            ...service,
                            status: 'error',
                            version: data.version,
                            build: data.build,
                            build_time: data.build_time,
                            errorDetails: 'Service reported unhealthy',
                        };
                    }

                    return {
                        ...service,
                        status: 'ok',
                        version: data.version,
                        build: data.build,
                        build_time: data.build_time,
                    };
                } catch (error: any) {
                    return {
                        ...service,
                        status: 'error',
                        errorDetails: error.message || 'Connection failed',
                    };
                }
            })
        );

        setStatuses(results);
        setLastChecked(new Date());
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (isOpen) fetchStatuses();
    }, [isOpen, fetchStatuses]);

    const operational = statuses.filter(s => s.status === 'ok').length;
    const total = statuses.length;
    const allOk = operational === total && total > 0 && !isLoading;
    const hasError = statuses.some(s => s.status === 'error');

    const statusAction = (
        <div className={cn(
            "flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold uppercase tracking-wide border",
            isLoading
                ? "bg-header-foreground/10 text-header-foreground/60 border-header-foreground/15"
                : allOk
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
                    : hasError
                        ? "bg-destructive/20 text-red-200 border-destructive/30"
                        : "bg-header-foreground/10 text-header-foreground/60 border-header-foreground/15"
        )}>
            {isLoading
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    allOk ? "bg-emerald-400" : hasError ? "bg-red-400" : "bg-header-foreground/40"
                )} />
            }
            {isLoading ? 'Checking…' : `${operational} / ${total} Operational`}
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl overflow-hidden p-0 gap-0" showCloseButton={false}>

                <DialogBrandHeader
                    title="Backend Services"
                    subtitle="Infrastructure"
                    action={statusAction}
                />

                {/* Column headers */}
                <div className="grid grid-cols-[28px_1fr_180px_100px_160px] px-5 py-2 bg-muted/40 border-b border-border">
                    <div />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Service</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Version</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Commit</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Built</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border">
                    {statuses.map(service => (
                        <div
                            key={service.name}
                            className={cn(
                                "grid grid-cols-[28px_1fr_180px_100px_160px] px-5 py-3 items-start",
                                service.status === 'error' && "bg-destructive/5"
                            )}
                        >
                            <div className="flex items-center pt-0.5">
                                <StatusDot status={service.status} />
                            </div>

                            <div className="min-w-0 pr-3">
                                <p className="text-sm font-medium leading-tight">{service.name}</p>
                                <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">{service.url}</p>
                                {service.errorDetails && (
                                    <p className="font-mono text-[11px] text-destructive mt-0.5">{service.errorDetails}</p>
                                )}
                            </div>

                            <div className="pt-0.5">
                                {service.status === 'loading'
                                    ? <span className="text-xs text-muted-foreground/40">—</span>
                                    : service.version
                                        ? <span className="font-mono text-xs text-foreground">{service.version}</span>
                                        : <span className="text-xs text-muted-foreground/40">—</span>
                                }
                            </div>

                            <div className="pt-0.5">
                                {service.build
                                    ? <span className="font-mono text-xs text-muted-foreground">{service.build.substring(0, 7)}</span>
                                    : <span className="text-xs text-muted-foreground/40">—</span>
                                }
                            </div>

                            <div className="pt-0.5">
                                {service.build_time
                                    ? <span className="font-mono text-xs text-muted-foreground">{formatBuildTime(service.build_time)}</span>
                                    : <span className="text-xs text-muted-foreground/40">—</span>
                                }
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="border-t border-border bg-muted/20 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchStatuses}
                            disabled={isLoading}
                        >
                            <RefreshCw className={cn("h-3 w-3 mr-1.5", isLoading && "animate-spin")} />
                            Refresh
                        </Button>
                        {lastChecked && (
                            <span className="font-mono text-[11px] text-muted-foreground/60">
                                Last checked {format(lastChecked, 'HH:mm:ss')}
                            </span>
                        )}
                    </div>
                    <DialogClose asChild>
                        <Button variant="secondary" size="sm">
                            Close
                        </Button>
                    </DialogClose>
                </div>

            </DialogContent>
        </Dialog>
    );
};
