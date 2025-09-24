

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Zap, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { ApiDevice } from '@/lib/devices-api';
import type { ApiRaItem } from '@/lib/dms-api';
import type { DiscoveredIntegration } from '@/lib/integrations-api';
import { DetailItem } from './DetailItem';
import { IntegrationIcon } from '@/app/integrations/page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ForceUpdateModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (configKey: string, actions: string[]) => void;
  device: ApiDevice | null;
  ra: ApiRaItem | null;
  availableIntegrations: DiscoveredIntegration[];
  isUpdating: boolean;
}

export const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({
  isOpen,
  onOpenChange,
  onConfirm,
  device,
  ra,
  availableIntegrations,
  isUpdating,
}) => {
  const [selectedIntegrationKey, setSelectedIntegrationKey] = useState<string>('');
  const [updateTrustAnchor, setUpdateTrustAnchor] = useState(true);
  const [updateCertificate, setUpdateCertificate] = useState(true);

  useEffect(() => {
    if (isOpen && availableIntegrations.length > 0) {
      setSelectedIntegrationKey(availableIntegrations[0].configKey);
    } else {
      setSelectedIntegrationKey('');
    }
  }, [isOpen, availableIntegrations]);

  const handleConfirm = () => {
    const actions: string[] = [];
    if (updateTrustAnchor) actions.push('UPDATE_TRUST_ANCHOR_LIST');
    if (updateCertificate) actions.push('UPDATE_CERTIFICATE');
    onConfirm(selectedIntegrationKey, actions);
  };

  if (!device || !ra || availableIntegrations.length === 0) return null;

  const selectedIntegration = availableIntegrations.find(int => int.configKey === selectedIntegrationKey);

  const getConnectorId = (configKey: string) => {
    const prefix = "lamassu.io/iot/";
    if (configKey.startsWith(prefix)) {
        return configKey.substring(prefix.length);
    }
    return configKey;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Zap className="mr-2 h-5 w-5 text-primary" />
            Force Device Update
          </DialogTitle>
          <DialogDescription>
            Trigger a manual update for the device's identity on the integrated platform.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <div className="p-3 border rounded-md bg-muted/50 space-y-2">
            <DetailItem label="Device ID" value={device.id} className="py-1" isMono/>
            <DetailItem label="Registration Authority" value={ra.name} className="py-1" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="integration-select">Platform Integration</Label>
            {availableIntegrations.length > 1 ? (
                <Select value={selectedIntegrationKey} onValueChange={setSelectedIntegrationKey}>
                    <SelectTrigger id="integration-select">
                        <SelectValue placeholder="Select an integration..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableIntegrations.map(int => (
                            <SelectItem key={int.configKey} value={int.configKey}>
                                <div className="flex items-center gap-2">
                                    <IntegrationIcon type={int.type} />
                                    <div className="flex flex-col">
                                        <span>{int.typeName}</span>
                                        <span className="text-xs text-muted-foreground font-mono">{getConnectorId(int.configKey)}</span>
                                    </div>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                selectedIntegration && (
                    <div className="flex items-center gap-2 p-2 border rounded-md">
                        <IntegrationIcon type={selectedIntegration.type} />
                        <div className="flex flex-col">
                            <span className="font-semibold text-sm">{selectedIntegration.typeName}</span>
                            <span className="text-xs text-muted-foreground font-mono">{getConnectorId(selectedIntegration.configKey)}</span>
                        </div>
                    </div>
                )
            )}
          </div>

          <div className="space-y-3">
             <div className="flex items-center space-x-4 rounded-md border p-3">
                <Switch 
                    id="update-trust-anchor" 
                    checked={updateTrustAnchor} 
                    onCheckedChange={setUpdateTrustAnchor}
                />
                <Label htmlFor="update-trust-anchor" className="flex flex-col gap-0.5">
                    <span className="font-semibold">Update Trust Anchor List</span>
                    <span className="text-xs text-muted-foreground">Synchronizes the CA certificates on the platform with those configured in the RA.</span>
                </Label>
             </div>
             <div className="flex items-center space-x-4 rounded-md border p-3">
                <Switch 
                    id="update-certificate" 
                    checked={updateCertificate} 
                    onCheckedChange={setUpdateCertificate}
                />
                <Label htmlFor="update-certificate" className="flex flex-col gap-0.5">
                    <span className="font-semibold">Update Certificate</span>
                     <span className="text-xs text-muted-foreground">Pushes the device's current active certificate to the platform.</span>
                </Label>
             </div>
          </div>
          
           <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Note</AlertTitle>
              <AlertDescription>
                This action sends an update request to the platform. The time to completion depends on the platform's processing queue.
              </AlertDescription>
            </Alert>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isUpdating || (!updateCertificate && !updateTrustAnchor) || !selectedIntegrationKey}
          >
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
