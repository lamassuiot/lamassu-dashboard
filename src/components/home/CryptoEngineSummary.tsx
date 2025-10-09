
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertTriangle, CheckSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCryptoEngines } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '../ui/badge';

export const CryptoEngineSummary: React.FC = () => {
    const { user } = useAuth();
    const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchEngines = useCallback(async () => {
        if (!user?.access_token) return;

        setIsLoading(true);
        setError(null);
        try {
            const data = await fetchCryptoEngines(user.access_token);
            setEngines(data);
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
            setEngines([]);
        } finally {
            setIsLoading(false);
        }
    }, [user?.access_token]);

    useEffect(() => {
        fetchEngines();
    }, [fetchEngines]);

    return (
        <Card className="border-border">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Crypto Engines</CardTitle>
                        <CardDescription>
                            Available engines for key management and operations.
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="icon" onClick={fetchEngines} disabled={isLoading}>
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center h-24">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : error ? (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Error Loading Engines</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : engines.length > 0 ? (
                    <div className="space-y-3">
                        {engines.map(engine => (
                            <div key={engine.id} className="p-2 border rounded-md flex justify-between items-center">
                                <CryptoEngineViewer engine={engine} />
                                {engine.default && (
                                    <Badge variant="default" className="text-xs bg-accent text-accent-foreground">
                                        <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Default Engine
                                    </Badge>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No cryptographic engines are configured.
                    </p>
                )}
            </CardContent>
        </Card>
    );
};
