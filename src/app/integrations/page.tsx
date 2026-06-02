
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from "@/components/ui/button";
import { Blocks, PlusCircle, Loader2, AlertTriangle, Settings, Eye, RefreshCw, MoreVertical, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';
import { discoverIntegrations, type DiscoveredIntegration } from '@/lib/integrations-api';
import { deleteRaIntegration } from '@/lib/dms-api';
import { sileo } from '@/lib/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Image from 'next/image';
import AwsIcon from '../aws.svg';
import AwsIconWhite from '../aws-white.svg';


export const IntegrationIcon: React.FC<{ type: DiscoveredIntegration['type'] }> = ({ type }) => {
    switch (type) {
        case 'AWS_IOT_CORE':
            return (
              <>
                <Image src={AwsIcon} alt="AWS IoT Core Icon" className="h-5 w-5 dark:hidden" width={20} height={20} />
                <Image src={AwsIconWhite} alt="AWS IoT Core Icon" className="hidden h-5 w-5 dark:block" width={20} height={20} />
              </>
            );
        default:
            return <Blocks className="h-5 w-5 text-muted-foreground" />;
    }
};

export default function IntegrationsPage() {
  const router = useRouter();

  const [integrations, setIntegrations] = useState<DiscoveredIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [integrationToDelete, setIntegrationToDelete] = useState<DiscoveredIntegration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadIntegrations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
        const discovered = await discoverIntegrations();
        setIntegrations(discovered);
    } catch (err: any) {
        setError(err.message || 'An unknown error occurred while discovering integrations.');
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const handleConfigure = (integration: DiscoveredIntegration) => {
    if (integration.type === 'AWS_IOT_CORE') {
        router.push(`/integrations/configure?raId=${integration.raId}&configKey=${integration.configKey}`);
    } else {
        alert(`Configuration for ${integration.typeName} is not yet implemented.`);
    }
  };

  const handleDeleteIntegration = async () => {
    if (!integrationToDelete) return;
    setIsDeleting(true);
    try {
      await deleteRaIntegration(integrationToDelete.raId, integrationToDelete.configKey);
      sileo.success({ title: "Success", description: "Integration deleted." });
      setIntegrationToDelete(null);
      loadIntegrations();
    } catch (err: any) {
      sileo.error({ title: "Deletion Failed", description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const getConnectorId = (configKey: string) => {
      const prefix = "lamassu.io/iot/";
      return configKey.startsWith(prefix) ? configKey.substring(prefix.length) : configKey;
  };

  if (isLoading) {
    return (
        <div className="flex flex-col items-center justify-center flex-1 p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Discovering integrations…</p>
        </div>
    );
  }

  return (
    <>
    <div className="space-y-5 w-full pb-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Blocks className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-headline font-semibold">Platform Integrations</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Discovered from Registration Authority metadata.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button onClick={loadIntegrations} variant="outline" size="sm" disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-1.5", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={() => router.push('/integrations/new')} size="sm">
            <PlusCircle className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">New Integration</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Integrations</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" onClick={loadIntegrations} className="p-0 h-auto ml-1">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── List ── */}
      {!error && integrations.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {integrations.map((integration) => (
              <div key={integration.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                {/* Icon */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <IntegrationIcon type={integration.type} />
                </div>

                {/* Name + type */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none">{integration.typeName}</p>
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    RA: <span className="text-foreground font-medium">{integration.raName}</span>
                  </p>
                </div>

                {/* Connector ID chip */}
                <code className="hidden sm:inline-flex rounded border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground shrink-0">
                  {getConnectorId(integration.configKey)}
                </code>

                {/* Configure button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConfigure(integration)}
                  className="shrink-0"
                >
                  <Settings className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Configure</span>
                </Button>

                {/* More menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/registration-authorities/new?raId=${integration.raId}`)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View RA
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setIntegrationToDelete(integration)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !error && integrations.length === 0 && (
        <div className="rounded-md border border-dashed p-10 text-center">
          <Blocks className="mx-auto h-5 w-5 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold">No integrations found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No integrations discovered. Add metadata to a Registration Authority to register one.
          </p>
          <Button onClick={() => router.push('/integrations/new')} size="sm" className="mt-4">
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> New Integration
          </Button>
        </div>
      )}
    </div>

    <AlertDialog open={!!integrationToDelete} onOpenChange={(open) => !open && setIntegrationToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Delete this integration?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently remove the integration configuration for <strong>{integrationToDelete?.typeName}</strong> from the Registration Authority &ldquo;<strong>{integrationToDelete?.raName}</strong>&rdquo;. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteIntegration}
                  className={buttonVariants({ variant: "destructive" })}
                  disabled={isDeleting}
                >
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
