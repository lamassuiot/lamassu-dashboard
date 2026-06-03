
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ArrowLeft, BookText, Eye } from 'lucide-react';
import Image from 'next/image';
import { AwsIotIntegrationTab } from '@/components/ra/AwsIotIntegrationTab';
import { fetchRaById, type ApiRaItem, createOrUpdateRa } from '@/lib/dms-api';
import { MetadataViewerModal } from '@/components/shared/MetadataViewerModal';
import AwsIcon from '../../aws.svg';
import AwsIconWhite from '../../aws-white.svg';


export default function ConfigureIntegrationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const raId = searchParams.get('raId');
    const configKey = searchParams.get('configKey');
    
    const [raData, setRaData] = useState<ApiRaItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
    
    const fetchRaDetails = useCallback(async () => {
        if (!raId) {
            setError("Registration Authority ID not provided.");
            setIsLoading(false);
            return;
        }
        
        
        setIsLoading(true);
        setError(null);
        try {
            const data = await fetchRaById(raId);
            setRaData(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [raId]);
    
    useEffect(() => {
        fetchRaDetails();
    }, [fetchRaDetails]);

    const handleUpdateRaMetadata = async (id: string, metadata: object) => {
        const currentRa = await fetchRaById(id);
        const payload = {
            name: currentRa.name,
            id: currentRa.id,
            metadata: metadata,
            settings: currentRa.settings
        };
        await createOrUpdateRa(payload, true, id);
    };

    const connectorInstance = useMemo(() => {
        const prefix = "lamassu.io/iot/";
        if (configKey && configKey.startsWith(prefix)) {
            return configKey.substring(prefix.length);
        }
        return configKey; // return the key itself as a fallback
    }, [configKey]);
    
    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading Configuration...</p>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="mx-auto mb-8 w-[80%] space-y-4">
                <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
                </Button>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Data</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    if (!raData || !configKey) {
         return (
            <div className="mx-auto mb-8 w-[80%] space-y-4">
                <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
                </Button>
                <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Missing Information</AlertTitle>
                    <AlertDescription>Could not load integration configuration because the RA or config key is missing.</AlertDescription>
                </Alert>
            </div>
        );
    }

    // Determine which configuration component to render
    let ConfigComponent = null;
    let pageTitle = "Configure Integration";
    let isAwsIntegration = configKey.includes('aws');
    let pageDescription = 'Manage the configuration associated with this platform integration.';

    if (isAwsIntegration) {
        ConfigComponent = <AwsIotIntegrationTab ra={raData} configKey={configKey} onUpdate={fetchRaDetails} />;
        pageTitle = `Configure AWS IoT Core for ${raData.name}`;
        pageDescription = 'Manage CA synchronization, device provisioning, and policy settings for this AWS IoT Core integration.';
    } else {
        ConfigComponent = (
            <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Unsupported Integration</AlertTitle>
                <AlertDescription>Configuration for '{configKey}' is not yet implemented in this UI.</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="mx-auto mb-8 w-[80%]">
            <div className="mb-6 flex justify-end">
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                       
                        onClick={() => router.push(`/registration-authorities/new?raId=${raData.id}`)}
                    >
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> View RA
                    </Button>
                    <Button
                        variant="ghost"
                       
                        onClick={() => router.push('/integrations')}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Integrations
                    </Button>
                </div>
            </div>

            <div className="mb-6 rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                        <Image src={AwsIcon} alt="AWS IoT Core" className="h-5 w-5 dark:hidden" width={20} height={20} />
                        <Image src={AwsIconWhite} alt="AWS IoT Core" className="hidden h-5 w-5 dark:block" width={20} height={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-semibold leading-tight">{pageTitle}</h1>
                        <p className="mt-0.5 text-xs text-muted-foreground">{pageDescription}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <code className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">{configKey}</code>
                            {connectorInstance && <Badge variant="secondary" className="text-xs">{connectorInstance}</Badge>}
                            <span className="text-[11px] text-muted-foreground">
                                RA: <span className="font-medium text-foreground">{raData.name}</span>
                            </span>
                        </div>
                    </div>
                    <Button variant="ghost" onClick={() => setIsMetadataModalOpen(true)} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <BookText className="mr-1.5 h-3.5 w-3.5" /> Metadata
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                {ConfigComponent}
            </div>

            <MetadataViewerModal
                isOpen={isMetadataModalOpen}
                onOpenChange={setIsMetadataModalOpen}
                title={`Metadata for ${raData.name}`}
                description={`Raw metadata object for the Registration Authority.`}
                presentation="sheet"
                useMonacoViewer={true}
                sheetContentClassName="data-[side=right]:w-full data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-[50vw]"
                data={raData.metadata || null}
                isEditable={true}
                itemId={raData.id}
                onSave={handleUpdateRaMetadata}
                onUpdateSuccess={fetchRaDetails}
            />
        </div>
    );
}
