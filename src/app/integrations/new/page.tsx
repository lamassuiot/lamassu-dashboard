
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, AlertTriangle, Loader2, Network } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { useConfig, getConfigValue } from '@/contexts/ConfigContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from "@/components/ui/alert";
import { fetchAllRegistrationAuthorities, updateRaMetadata, type ApiRaItem } from '@/lib/dms-api';

export default function CreateIntegrationPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { config } = useConfig();
  const { toast } = useToast();

  const [ras, setRas] = useState<ApiRaItem[]>([]);
  const [isLoadingRas, setIsLoadingRas] = useState(true);
  const [errorRas, setErrorRas] = useState<string | null>(null);

  const [connectors, setConnectors] = useState<string[]>([]);
  const [selectedRaId, setSelectedRaId] = useState<string>('');
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Load connectors from config when available
    if (config) {
      const configConnectors = config.LAMASSU_CONNECTORS;
      if (Array.isArray(configConnectors)) {
        setConnectors(configConnectors);
      } else {
        // Fallback to environment variable
        const envConnectors = process.env.NEXT_PUBLIC_CONNECTORS;
        if (typeof envConnectors === 'string') {
          setConnectors(envConnectors.split(',').map(c => c.trim()));
        }
      }
    }
  }, [config]);

  const loadRAs = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) return;
    setIsLoadingRas(true);
    setErrorRas(null);
    try {
      const data = await fetchAllRegistrationAuthorities(user.access_token);
      setRas(data);
    } catch (err: any) {
      setErrorRas(err.message);
    } finally {
      setIsLoadingRas(false);
    }
  }, [user, isAuthenticated]);

  useEffect(() => {
    if (!authLoading) {
      loadRAs();
    }
  }, [authLoading, loadRAs]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRaId || !selectedConnectorId || !user?.access_token) {
      toast({ title: "Validation Error", description: "Please select a Registration Authority and a Connector.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedRa = ras.find(r => r.id === selectedRaId);
      if (!selectedRa) {
        throw new Error("Selected Registration Authority not found.");
      }

      // The key for the new integration in the metadata
      const newIntegrationKey = `lamassu.io/iot/${selectedConnectorId}`;
      
      const existingMetadata = selectedRa.metadata || {};

      if (existingMetadata[newIntegrationKey]) {
          toast({ title: "Integration Exists", description: `An integration for '${selectedConnectorId}' already exists on this RA.`, variant: "destructive" });
          setIsSubmitting(false);
          return;
      }
      
      // Add an empty object for the new integration. Configuration will be done later.
      const updatedMetadata = {
        ...existingMetadata,
        [newIntegrationKey]: {}, 
      };

      await updateRaMetadata(selectedRaId, updatedMetadata, user.access_token);

      toast({
        title: "Integration Registered",
        description: `Successfully registered ${selectedConnectorId} integration for ${selectedRa.name}.`,
      });
      router.push('/integrations');

    } catch (err: any) {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div className="flex items-center space-x-3">
        <Network className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-headline font-semibold">
          Register New Platform Integration
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Register Integration</CardTitle>
            <CardDescription>Select a Registration Authority and the Connector you want to register. Configuration will be done in a separate step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-2">
                  <Label htmlFor="ra-select">Registration Authority</Label>
                  {isLoadingRas || authLoading ? (
                      <div className="flex items-center space-x-2 h-10"><Loader2 className="h-5 w-5 animate-spin"/><p>Loading RAs...</p></div>
                  ) : errorRas ? (
                      <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Error</AlertTitle><AlertDescUI>{errorRas}</AlertDescUI></Alert>
                  ) : (
                      <Select value={selectedRaId} onValueChange={setSelectedRaId} disabled={isSubmitting}>
                          <SelectTrigger id="ra-select"><SelectValue placeholder="Select an RA to add an integration to..."/></SelectTrigger>
                          <SelectContent>
                              {ras.map(ra => <SelectItem key={ra.id} value={ra.id}>{ra.name}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  )}
              </div>
              <div className="space-y-2">
                  <Label htmlFor="connector-select">Connector</Label>
                  <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId} disabled={isSubmitting}>
                      <SelectTrigger id="connector-select"><SelectValue placeholder="Select a connector type..."/></SelectTrigger>
                      <SelectContent>
                          {connectors.map(connectorId => <SelectItem key={connectorId} value={connectorId}>{connectorId}</SelectItem>)}
                      </SelectContent>
                  </Select>
              </div>
          </CardContent>
           <CardFooter className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isSubmitting || !selectedRaId || !selectedConnectorId}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                {isSubmitting ? 'Registering...' : 'Register Integration'}
              </Button>
            </CardFooter>
        </Card>
      </form>
    </div>
  );
}
