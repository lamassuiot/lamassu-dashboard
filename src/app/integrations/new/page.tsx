
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, PlusCircle, Loader2, Network } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { useConfig } from '@/contexts/ConfigContext';
import { sileo } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { fetchRaById, updateRaMetadata } from '@/lib/dms-api';
import { DmsSelector } from '@/components/shared/DmsSelector';

export default function CreateIntegrationPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { config } = useConfig();

  const [connectors, setConnectors] = useState<string[]>([]);
  const [selectedRaId, setSelectedRaId] = useState<string | null>(null);
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

  const handleDmsChange = (value: string | null) => {
    setSelectedRaId(value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRaId || !selectedConnectorId || !user?.access_token) {
      sileo.error({ title: "Validation Error", description: "Please select a Registration Authority and a Connector." });
      return;
    }

    setIsSubmitting(true);

    try {
      // Fetch the full RA data to check existing metadata
      const selectedRa = await fetchRaById(selectedRaId, user.access_token);

      // The key for the new integration in the metadata
      const newIntegrationKey = `lamassu.io/iot/${selectedConnectorId}`;
      
      const existingMetadata = selectedRa.metadata || {};

      if (existingMetadata[newIntegrationKey]) {
          sileo.error({ title: "Integration Exists", description: `An integration for '${selectedConnectorId}' already exists on this RA.` });
          setIsSubmitting(false);
          return;
      }
      
      // Add an empty object for the new integration. Configuration will be done later.
      const updatedMetadata = {
        ...existingMetadata,
        [newIntegrationKey]: {}, 
      };

      await updateRaMetadata(selectedRaId, updatedMetadata, user.access_token);

      sileo.success({
        title: "Integration Registered",
        description: `Successfully registered ${selectedConnectorId} integration for ${selectedRa.name}.`
      });
      router.push('/integrations');

    } catch (err: any) {
      sileo.error({ title: "Registration Failed", description: err.message });
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
                  <DmsSelector
                    value={selectedRaId}
                    onChange={handleDmsChange}
                    disabled={isSubmitting || authLoading}
                    showAllOption={false}
                    placeholder="Select an RA to add an integration to..."
                  />
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
