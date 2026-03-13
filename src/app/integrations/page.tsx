
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Blocks, PlusCircle, Loader2, AlertTriangle, Settings, Eye, RefreshCw, MoreVertical, Trash2 } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
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


export const IntegrationIcon: React.FC<{ type: DiscoveredIntegration['type'] }> = ({ type }) => {
    switch (type) {
        case 'AWS_IOT_CORE':
            return <Image src={AwsIcon} alt="AWS IoT Core Icon" className="h-6 w-6" width={24} height={24} />;
        default:
            return <Blocks className="h-6 w-6 text-primary" />;
    }
};

export default function IntegrationsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [integrations, setIntegrations] = useState<DiscoveredIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [integrationToDelete, setIntegrationToDelete] = useState<DiscoveredIntegration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadIntegrations = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
        if (!authLoading) setError("User not authenticated.");
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
        const discovered = await discoverIntegrations(user.access_token);
        setIntegrations(discovered);
    } catch (err: any) {
        setError(err.message || 'An unknown error occurred while discovering integrations.');
    } finally {
        setIsLoading(false);
    }
  }, [user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadIntegrations();
    }
  }, [authLoading, loadIntegrations]);

  const handleCreateNewIntegration = () => {
    router.push('/integrations/new');
  };

  const handleConfigure = (integration: DiscoveredIntegration) => {
    if (integration.type === 'AWS_IOT_CORE') {
        router.push(`/integrations/configure?raId=${integration.raId}&configKey=${integration.configKey}`);
    } else {
        alert(`Configuration for ${integration.typeName} is not yet implemented.`);
    }
  };

  const handleDeleteIntegration = async () => {
    if (!integrationToDelete || !user?.access_token) {
      sileo.error({ title: "Error", description: "No integration selected or user not authenticated." });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteRaIntegration(integrationToDelete.raId, integrationToDelete.configKey, user.access_token);
      sileo.success({ title: "Success", description: "Integration has been deleted." });
      setIntegrationToDelete(null); // Close the dialog
      loadIntegrations(); // Refresh the list
    } catch (err: any) {
      sileo.error({ title: "Deletion Failed", description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const getConnectorId = (configKey: string) => {
      const prefix = "lamassu.io/iot/";
      if (configKey.startsWith(prefix)) {
          return configKey.substring(prefix.length);
      }
      return configKey;
  };

  if (isLoading || authLoading) {
    return (
        <div className="flex flex-col items-center justify-center flex-1 p-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">Discovering Integrations...</p>
        </div>
    );
  }

  return (
    <>
    <div className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Blocks className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Platform Integrations</h1>
        </div>
        <div className="flex items-center space-x-2">
            <Button onClick={loadIntegrations} variant="outline" disabled={isLoading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={handleCreateNewIntegration}>
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Integration
            </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Discovered integrations with IoT platforms based on Registration Authority metadata.
      </p>

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

      {!isLoading && !error && integrations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration) => (
            <Card key={integration.id} className="flex flex-col shadow-md hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between space-x-4">
                  <div className="flex items-center space-x-4 flex-grow min-w-0">
                    <IntegrationIcon type={integration.type} />
                    <div className="flex-grow min-w-0">
                      <CardTitle className="truncate" title={integration.typeName}>{integration.typeName}</CardTitle>
                      <CardDescription className="truncate" title={`Linked to RA: ${integration.raName}`}>
                        Linked to RA: <span className="font-semibold">{integration.raName}</span>
                      </CardDescription>
                    </div>
                  </div>
                   <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                              <MoreVertical className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/registration-authorities/new?raId=${integration.raId}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              <span>View RA</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                              onClick={() => setIntegrationToDelete(integration)}
                              className="text-destructive focus:text-destructive"
                          >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete</span>
                          </DropdownMenuItem>
                      </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="space-y-2 text-sm">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">Connector ID</p>
                        <Badge variant="outline" className="font-mono text-xs">{getConnectorId(integration.configKey)}</Badge>
                    </div>
                     <div>
                        <p className="text-xs font-medium text-muted-foreground">RA ID</p>
                        <Button
                            variant="link"
                            className="p-0 h-auto font-mono text-xs"
                            onClick={() => router.push(`/registration-authorities/new?raId=${integration.raId}`)}
                            title={`Edit RA ${integration.raId}`}
                        >
                            {integration.raId}
                        </Button>
                    </div>
                </div>
              </CardContent>
              <CardFooter>
                 <Button onClick={() => handleConfigure(integration)} className="w-full">
                    <Settings className="mr-2 h-4 w-4"/>
                    Configure Integration
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        !isLoading && !error && (
            <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                <h3 className="text-lg font-semibold text-muted-foreground">No Integrations Found</h3>
                <p className="text-sm text-muted-foreground">
                No integrations discovered. Configure one by adding metadata to a Registration Authority.
                </p>
                <Button onClick={handleCreateNewIntegration} className="mt-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Integration
                </Button>
            </div>
        )
      )}
    </div>
    <AlertDialog open={!!integrationToDelete} onOpenChange={(open) => !open && setIntegrationToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to delete this integration?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently remove the integration configuration for <strong>{integrationToDelete?.typeName}</strong> from the Registration Authority "<strong>{integrationToDelete?.raName}</strong>". This action cannot be undone.
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
