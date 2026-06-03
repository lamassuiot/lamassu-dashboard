
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, PlusCircle, Loader2, AlertTriangle } from "lucide-react";
import { useConfig } from '@/contexts/ConfigContext';
import { sileo } from '@/lib/toast';
import { fetchRaById, updateRaMetadata } from '@/lib/dms-api';
import { DmsSelector } from '@/components/shared/DmsSelector';

export default function CreateIntegrationPage() {
  const router = useRouter();
  const { config } = useConfig();

  const [connectors, setConnectors] = useState<string[]>([]);
  const [selectedRaId, setSelectedRaId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (config) {
      const configConnectors = config.LAMASSU_CONNECTORS;
      if (Array.isArray(configConnectors)) {
        setConnectors(configConnectors);
      } else {
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
    if (!selectedRaId || !selectedConnectorId) {
      sileo.error({ title: "Validation Error", description: "Please select a Registration Authority and a Connector." });
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedRa = await fetchRaById(selectedRaId);
      const newIntegrationKey = `lamassu.io/iot/${selectedConnectorId}`;
      const existingMetadata = selectedRa.metadata || {};

      if (existingMetadata[newIntegrationKey]) {
          sileo.error({ title: "Integration Exists", description: `An integration for '${selectedConnectorId}' already exists on this RA.` });
          setIsSubmitting(false);
          return;
      }

      const updatedMetadata = {
        ...existingMetadata,
        [newIntegrationKey]: {},
      };

      await updateRaMetadata(selectedRaId, updatedMetadata);

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
    <div className="mx-auto w-[80%] pb-8">
      <div className="mb-6 flex justify-end">
        <Button
          variant="ghost"
         
          onClick={() => router.push('/integrations')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Integrations
        </Button>
      </div>

      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Register New Integration</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Select a Registration Authority and connector to create the integration record. Configuration happens after registration.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-0">
        <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
          <div>
            <p className="font-semibold">Registration Target</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose the Registration Authority that will hold the integration metadata and own later configuration updates.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="space-y-1.5">
              <Label htmlFor="ra-select">Registration Authority</Label>
              <DmsSelector
                value={selectedRaId}
                onChange={handleDmsChange}
                disabled={isSubmitting}
                selectedDisplay="stacked"
                showAllOption={false}
                placeholder="Select an RA to add an integration to..."
                className="min-h-10"
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
          <div>
            <p className="font-semibold">Connector Selection</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose which connector metadata key should be added to the selected Registration Authority.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {connectors.length === 0 ? (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Connectors Available</AlertTitle>
                <AlertDescription>No connector IDs were found in the current dashboard configuration.</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="connector-select">Connector</Label>
              <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId} disabled={isSubmitting || connectors.length === 0}>
                <SelectTrigger id="connector-select">
                  <SelectValue placeholder="Select a connector type..." />
                </SelectTrigger>
                <SelectContent>
                  {connectors.map((connectorId) => (
                    <SelectItem key={connectorId} value={connectorId}>{connectorId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedConnectorId ? (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">Metadata Key</p>
                <code className="mt-2 inline-flex rounded border bg-muted px-2 py-1 font-mono text-xs">
                  lamassu.io/iot/{selectedConnectorId}
                </code>
              </div>
            ) : null}
          </div>
        </div>

        <Separator />

        <div className="flex justify-end py-6">
          <Button type="submit" disabled={isSubmitting || !selectedRaId || !selectedConnectorId || connectors.length === 0}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            {isSubmitting ? 'Registering...' : 'Register Integration'}
          </Button>
        </div>
      </form>
    </div>
  );
}
