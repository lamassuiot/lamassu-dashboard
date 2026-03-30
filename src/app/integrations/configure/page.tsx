
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ArrowLeft, Settings, BookText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AwsIotIntegrationTab } from '@/components/ra/AwsIotIntegrationTab';
import { fetchRaById, type ApiRaItem, createOrUpdateRa } from '@/lib/dms-api';
import { MetadataViewerModal } from '@/components/shared/MetadataViewerModal';
import { DetailItem } from '@/components/shared/DetailItem';


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
            <div className="flex flex-col items-center justify-center flex-1 p-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading Configuration...</p>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="w-full space-y-4 p-4">
                <Button variant="outline" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
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
            <div className="w-full space-y-4 p-4">
                <Button variant="outline" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
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

    if (isAwsIntegration) {
        ConfigComponent = <AwsIotIntegrationTab ra={raData} configKey={configKey} onUpdate={fetchRaDetails} />;
        pageTitle = `Configure AWS IoT Core for ${raData.name}`;
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
        <div className="w-full space-y-6 mb-8">
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => router.push('/integrations')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Integrations
                </Button>
                 <Button variant="outline" onClick={() => setIsMetadataModalOpen(true)}>
                    <BookText className="mr-2 h-4 w-4" /> View RA Metadata
                </Button>
            </div>
            <div className="flex items-center space-x-3">
                <Settings className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-2xl font-headline font-semibold">{pageTitle}</h1>
                    <div className="text-sm text-muted-foreground mt-1 space-y-1">
                        <DetailItem label="RA ID" value={raData.id} className="py-0"/>
                        {connectorInstance && <DetailItem label="Connector Instance" value={connectorInstance} className="py-0"/>}
                    </div>
                </div>
            </div>
            {ConfigComponent}

            <MetadataViewerModal
                isOpen={isMetadataModalOpen}
                onOpenChange={setIsMetadataModalOpen}
                title={`Metadata for ${raData.name}`}
                description={`Raw metadata object for the Registration Authority.`}
                data={raData.metadata || null}
                isEditable={true}
                itemId={raData.id}
                onSave={handleUpdateRaMetadata}
                onUpdateSuccess={fetchRaDetails}
            />
        </div>
    );
}
