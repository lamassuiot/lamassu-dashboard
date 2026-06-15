
'use client';

import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { ApiDevice } from '@/lib/devices-api';
import type { ApiRaItem } from '@/lib/dms-api';
import type { DiscoveredIntegration } from '@/lib/integrations-api';
import { IntegrationIcon } from '@/app/integrations/page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ForceUpdateModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (configKey: string, actions: string[]) => void;
  device: ApiDevice | null;
  ra: ApiRaItem | null;
  availableIntegrations: DiscoveredIntegration[];
  activeIntegration?: DiscoveredIntegration | null;
  setActiveIntegration?: (integration: DiscoveredIntegration | null) => void;
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

  const getConnectorId = (configKey: string) => {
    const prefix = 'lamassu.io/iot/';
    return configKey.startsWith(prefix) ? configKey.substring(prefix.length) : configKey;
  };

  if (!device || !ra || availableIntegrations.length === 0) return null;

  const selectedIntegration = availableIntegrations.find(i => i.configKey === selectedIntegrationKey);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-1/3 data-[side=right]:sm:max-w-none">
        <SheetHeader>
          <SheetTitle>Force Device Update</SheetTitle>
          <SheetDescription>
            Trigger a manual update for the device's identity on the integrated platform.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-0">

          {/* ── Device ── */}
          <div className="py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Device</p>
            <div className="divide-y">
              <div className="py-2.5 first:pt-0">
                <p className="text-xs text-muted-foreground">Device ID</p>
                <p className="mt-0.5 text-sm font-mono font-medium break-all">{device.id}</p>
              </div>
              <div className="py-2.5">
                <p className="text-xs text-muted-foreground">Registration Authority</p>
                <Link
                  href={`/registration-authorities/new?raId=${ra.id}`}
                  className="mt-0.5 text-sm font-medium text-primary hover:underline underline-offset-4"
                  onClick={() => onOpenChange(false)}
                >
                  {ra.name}
                </Link>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Integration ── */}
          <div className="py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Platform Integration</p>
            {availableIntegrations.length > 1 ? (
              <Select value={selectedIntegrationKey} onValueChange={setSelectedIntegrationKey}>
                <SelectTrigger>
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
                <div className="flex items-center gap-2.5">
                  <IntegrationIcon type={selectedIntegration.type} />
                  <div>
                    <p className="text-sm font-medium">{selectedIntegration.typeName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{getConnectorId(selectedIntegration.configKey)}</p>
                  </div>
                </div>
              )
            )}
          </div>

          <Separator />

          {/* ── Actions ── */}
          <div className="py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Actions</p>
            <div className="divide-y">
              <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium">Update Trust Anchor List</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Synchronizes the CA certificates on the platform with those configured in the RA.</p>
                </div>
                <Switch
                  id="update-trust-anchor"
                  checked={updateTrustAnchor}
                  onCheckedChange={setUpdateTrustAnchor}
                  className="shrink-0"
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Update Certificate</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Pushes the device's current active certificate to the platform.</p>
                </div>
                <Switch
                  id="update-certificate"
                  checked={updateCertificate}
                  onCheckedChange={setUpdateCertificate}
                  className="shrink-0"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="py-5">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Note</AlertTitle>
              <AlertDescription>
                This action sends an update request to the platform. The time to completion depends on the platform's processing queue.
              </AlertDescription>
            </Alert>
          </div>

        </div>

        <SheetFooter>
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
