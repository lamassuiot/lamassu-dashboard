
'use client';

import React from 'react';
import { DmsProvider, useDms } from '@/contexts/DmsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, RefreshCw, PackagePlus, Rocket } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useRouter } from 'next/navigation';

function DmsSelector() {
    const { availableDms, selectedDms, setSelectedDms, isLoading, error, refetchDms } = useDms();

    const handleDmsChange = (dmsId: string) => {
        const dms = availableDms.find(d => d.id === dmsId);
        if (dms) {
            setSelectedDms(dms);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center space-x-2 p-2 h-10 border rounded-md bg-muted/50 text-sm text-muted-foreground w-64">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading DMS List...</span>
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive" className="max-w-md">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error loading DMS list</AlertTitle>
                <AlertDescription>
                    {error}
                    <Button variant="link" size="sm" onClick={refetchDms} className="p-0 h-auto ml-2">Retry</Button>
                </AlertDescription>
            </Alert>
        );
    }
    
    if (availableDms.length === 0) {
        return <p className="text-muted-foreground">No Device Management Systems found.</p>;
    }

    return (
        <div className="flex items-center gap-2">
            <Select onValueChange={handleDmsChange} value={selectedDms?.id || ''}>
                <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a DMS..." />
                </SelectTrigger>
                <SelectContent>
                    {availableDms.map(dms => (
                        <SelectItem key={dms.id} value={dms.id}>{dms.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={refetchDms}><RefreshCw className="h-4 w-4"/></Button>
        </div>
    );
}

function UpdatesNavigation() {
    const router = useRouter();
    const pathname = usePathname();

    const handleTabChange = (value: string) => {
        router.push(`/updates/${value}`);
    };
    
    const getCurrentTab = () => {
        if (pathname.includes('/launch_update')) return 'Launch Update';
        if (pathname.includes('/create_update')) return 'Create Update';
        return 'Create Update'; // Default tab
    }

    return (
        <Tabs value={getCurrentTab()} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2 max-w-sm">
                <TabsTrigger value="create_update">
                    <PackagePlus className="mr-2 h-4 w-4" /> Manage Packs
                </TabsTrigger>
                <TabsTrigger value="launch_update">
                    <Rocket className="mr-2 h-4 w-4" /> Launch Updates
                </TabsTrigger>
            </TabsList>
        </Tabs>
    )
}


function UpdatesLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <DmsSelector />
                <UpdatesNavigation />
            </div>
            <div className="border-t pt-6">
                {children}
            </div>
        </div>
    );
}


export default function UpdatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <DmsProvider>
        <UpdatesLayoutContent>{children}</UpdatesLayoutContent>
    </DmsProvider>
  );
}
