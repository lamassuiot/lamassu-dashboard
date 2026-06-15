'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { ArrowLeft, PlusCircle, RefreshCw, History, SlidersHorizontal, Info, Clock, AlertTriangle, Copy, Check, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DeviceIcon, StatusBadge as DeviceStatusBadge, mapApiIconToIconType } from '@/app/devices/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceById, decommissionDevice, deleteDevice, updateDeviceMetadata, type ApiDevice, type PatchOperation } from '@/lib/devices-api';
import { bindIdentityToDevice, fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { discoverIntegrations, type DiscoveredIntegration } from '@/lib/integrations-api';
import { AssignIdentityModal } from '@/components/shared/AssignIdentityModal';
import { DecommissionDeviceModal } from '@/components/shared/DecommissionDeviceModal';
import { DeleteDeviceModal } from '@/components/shared/DeleteDeviceModal';
import { ForceUpdateModal } from '@/components/shared/ForceUpdateModal';
import { sileo } from '@/lib/toast';
import { DeviceDetailsContext } from './DeviceContext';

const TAB_TO_SLUG: Record<string, string> = {
  information: 'information',
  certificatesHistory: 'certificates-history',
  timeline: 'timeline',
  metadata: 'metadata',
};

const SLUG_TO_TAB: Record<string, string> = {
  information: 'information',
  'certificates-history': 'certificatesHistory',
  timeline: 'timeline',
  metadata: 'metadata',
};

export default function DeviceDetailsShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const deviceId = searchParams.get('deviceId');

  const activeTab = SLUG_TO_TAB[pathname.split('/').pop() ?? ''] ?? 'information';

  const [device, setDevice] = useState<ApiDevice | null>(null);
  const [isLoadingDevice, setIsLoadingDevice] = useState(true);
  const [errorDevice, setErrorDevice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const [availableIntegrations, setAvailableIntegrations] = useState<DiscoveredIntegration[]>([]);
  const [activeIntegration, setActiveIntegration] = useState<DiscoveredIntegration | null>(null);
  const [raForIntegration, setRaForIntegration] = useState<ApiRaItem | null>(null);

  const [isAssignIdentityModalOpen, setIsAssignIdentityModalOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDecommissionModalOpen, setIsDecommissionModalOpen] = useState(false);
  const [isDecommissioning, setIsDecommissioning] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isForceUpdateModalOpen, setIsForceUpdateModalOpen] = useState(false);
  const [isForcingUpdate, setIsForcingUpdate] = useState(false);

  const fetchIntegrationData = useCallback(async (dmsOwnerId: string) => {
    try {
      const [discovered, raDetails] = await Promise.all([
        discoverIntegrations(),
        fetchRaById(dmsOwnerId),
      ]);
      const forRa = discovered.filter(i => i.raId === dmsOwnerId);
      setAvailableIntegrations(forRa);
      setActiveIntegration(forRa[0] ?? null);
      setRaForIntegration(raDetails);
    } catch {
      setAvailableIntegrations([]);
      setActiveIntegration(null);
      setRaForIntegration(null);
    }
  }, []);

  const fetchDevice = useCallback(async () => {
    if (!deviceId) {
      setErrorDevice('Device ID is missing from URL.');
      setIsLoadingDevice(false);
      return;
    }
    setIsLoadingDevice(true);
    setErrorDevice(null);
    try {
      const data = await fetchDeviceById(deviceId);
      setDevice(data);
      if (data.dms_owner) fetchIntegrationData(data.dms_owner);
      else {
        setAvailableIntegrations([]);
        setActiveIntegration(null);
        setRaForIntegration(null);
      }
    } catch (err: any) {
      setErrorDevice(err.message || 'Failed to load device details.');
      setDevice(null);
    } finally {
      setIsLoadingDevice(false);
    }
  }, [deviceId, fetchIntegrationData]);

  useEffect(() => { fetchDevice(); }, [fetchDevice]);

  useEffect(() => {
    if (pathname === '/devices/details') {
      router.replace(`/devices/details/information${deviceId ? `?deviceId=${deviceId}` : ''}`, { scroll: false });
    }
  }, [pathname, deviceId, router]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'assignIdentity') {
      setIsAssignIdentityModalOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      router.replace(url.toString(), { scroll: false });
    }
  }, [searchParams, router]);

  const handleTabChange = (value: string) => {
    const slug = TAB_TO_SLUG[value] ?? value;
    router.push(`/devices/details/${slug}?deviceId=${deviceId ?? ''}`, { scroll: false });
  };

  const handleAssignIdentity = async (serialNumber: string) => {
    if (!deviceId) return;
    setIsAssigning(true);
    try {
      await bindIdentityToDevice(deviceId, serialNumber);
      sileo.success({ title: 'Success!', description: 'Identity assigned to the device.' });
      setIsAssignIdentityModalOpen(false);
      fetchDevice();
    } catch (e: any) {
      sileo.error({ title: 'Assignment Failed', description: e.message });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDecommission = async () => {
    if (!deviceId) return;
    setIsDecommissioning(true);
    try {
      await decommissionDevice(deviceId);
      sileo.success({ title: 'Success!', description: 'Device decommissioned.' });
      setIsDecommissionModalOpen(false);
      fetchDevice();
    } catch (e: any) {
      sileo.error({ title: 'Decommission Failed', description: e.message });
    } finally {
      setIsDecommissioning(false);
    }
  };

  const handleDelete = async () => {
    if (!deviceId) return;
    setIsDeleting(true);
    try {
      await deleteDevice(deviceId);
      sileo.success({ title: 'Success!', description: 'Device permanently deleted.' });
      setIsDeleteModalOpen(false);
      router.push('/devices');
    } catch (e: any) {
      sileo.error({ title: 'Deletion Failed', description: e.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleForceUpdate = async (configKey: string, actions: string[]) => {
    if (!deviceId || !activeIntegration) return;
    setIsForcingUpdate(true);
    try {
      await updateDeviceMetadata(deviceId, [{
        op: 'add',
        path: `/${configKey.replace(/\//g, '~1')}`,
        value: { actions },
      }]);
      sileo.success({ title: 'Success', description: 'Forced certificate update triggered.' });
      setIsForceUpdateModalOpen(false);
      setTimeout(() => fetchDevice(), 2000);
    } catch (err: any) {
      sileo.error({ title: 'Force Update Failed', description: err.message });
    } finally {
      setIsForcingUpdate(false);
    }
  };

  if (isLoadingDevice) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading device details...</p>
      </div>
    );
  }

  if (errorDevice) {
    return (
      <div className="w-full space-y-4 p-4">
        <Button variant="secondary" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Device</AlertTitle>
          <AlertDescription>{errorDevice}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="w-full space-y-4 p-4">
        <Button variant="secondary" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Device Not Found</AlertTitle>
          <AlertDescription>The device with ID &quot;{deviceId ?? 'Unknown'}&quot; could not be found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const deviceIconType = mapApiIconToIconType(device.icon);
  const [iconColor, bgColor] = device.icon_color ? device.icon_color.split('-') : ['#0f67ff', '#F0F8FF'];

  return (
    <DeviceDetailsContext.Provider value={{
      device,
      deviceId,
      isLoadingDevice,
      refreshDevice: fetchDevice,
      availableIntegrations,
      activeIntegration,
      setActiveIntegration,
      raForIntegration,
      openAssignIdentityModal: () => setIsAssignIdentityModalOpen(true),
      updateMetadata: (id, ops) => updateDeviceMetadata(id, ops),
    }}>
      <BreadcrumbPage
        className="space-y-4"
        items={[
          { label: 'Home', href: '/' },
          { label: 'Devices', href: '/devices' },
          { label: 'Details' },
        ]}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg"
              style={{ backgroundColor: bgColor || '#F0F8FF' }}
            >
              <DeviceIcon type={deviceIconType} iconColor={iconColor} bgColor={bgColor} />
            </div>
            <div className="min-w-0 space-y-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight" title={device.id}>{device.id}</h1>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">ID</span>
                <code className="max-w-[360px] truncate rounded border bg-muted px-2 py-0.5 font-mono text-xs">{device.id}</code>
                <Button
                  variant="ghost"
                  className="h-6 w-6 shrink-0 p-0"
                  onClick={() => { navigator.clipboard.writeText(device.id); setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); }}
                >
                  {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 xl:justify-end">
            <Button variant="ghost" size="icon" onClick={fetchDevice} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableIntegrations.length > 0 && (
                  <>
                    <DropdownMenuItem onClick={() => setIsForceUpdateModalOpen(true)}>Force Update</DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setIsDecommissionModalOpen(true)}
                  disabled={device.status === 'DECOMMISSIONED'}
                >
                  Decommission
                </DropdownMenuItem>
                {device.status === 'DECOMMISSIONED' && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => setIsAssignIdentityModalOpen(true)}
              disabled={!!device.identity && device.identity.status !== 'REVOKED'}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Assign Identity
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="border-b overflow-x-auto overflow-y-hidden">
            <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
              {([
                { value: 'information',        icon: Info,             label: 'Information' },
                { value: 'certificatesHistory', icon: History,          label: 'Certificates History' },
                { value: 'timeline',            icon: Clock,            label: 'Timeline' },
                { value: 'metadata',            icon: SlidersHorizontal, label: 'Metadata' },
              ] as { value: string; icon: React.ElementType; label: string }[]).map(({ value, icon: Icon, label }) => (
                <TabsTrigger key={value} value={value} className={pageTabsTriggerClass}>
                  <Icon className="h-4 w-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value={activeTab} className="mt-2 pb-6">
            {children}
          </TabsContent>
        </Tabs>

        <AssignIdentityModal
          isOpen={isAssignIdentityModalOpen}
          onOpenChange={setIsAssignIdentityModalOpen}
          onAssignConfirm={handleAssignIdentity}
          deviceId={deviceId ?? ''}
          deviceRaId={device.dms_owner}
          isAssigning={isAssigning}
        />
        <DecommissionDeviceModal
          isOpen={isDecommissionModalOpen}
          onOpenChange={setIsDecommissionModalOpen}
          onConfirm={handleDecommission}
          deviceName={device.id}
          isDecommissioning={isDecommissioning}
        />
        <DeleteDeviceModal
          isOpen={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
          onConfirm={handleDelete}
          deviceName={device.id}
          isDeleting={isDeleting}
        />
        <ForceUpdateModal
          isOpen={isForceUpdateModalOpen}
          onOpenChange={setIsForceUpdateModalOpen}
          onConfirm={handleForceUpdate}
          device={device}
          ra={raForIntegration}
          availableIntegrations={availableIntegrations}
          activeIntegration={activeIntegration}
          setActiveIntegration={setActiveIntegration}
          isUpdating={isForcingUpdate}
        />
      </BreadcrumbPage>
    </DeviceDetailsContext.Provider>
  );
}
