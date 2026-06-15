'use client';

import { createContext, useContext } from 'react';
import type { ApiDevice, PatchOperation } from '@/lib/devices-api';
import type { DiscoveredIntegration } from '@/lib/integrations-api';
import type { ApiRaItem } from '@/lib/dms-api';

export interface CertificateHistoryEntry {
  version: string;
  serialNumber: string;
  apiStatus?: string;
  revocationReason?: string;
  revocationTimestamp?: string;
  isSuperseded: boolean;
  commonName: string;
  ca: string;
  issuerCaId?: string;
  validFrom: string;
  validTo: string;
  lifespan: string;
}

export function getCertSubjectCommonName(subject: string): string {
  const cnMatch = subject.match(/CN=([^,]+)/);
  return cnMatch ? cnMatch[1] : subject;
}

export interface DeviceDetailsContextValue {
  device: ApiDevice | null;
  deviceId: string | null;
  isLoadingDevice: boolean;
  refreshDevice: () => void;
  availableIntegrations: DiscoveredIntegration[];
  activeIntegration: DiscoveredIntegration | null;
  setActiveIntegration: (i: DiscoveredIntegration | null) => void;
  raForIntegration: ApiRaItem | null;
  openAssignIdentityModal: () => void;
  updateMetadata: (id: string, ops: PatchOperation[]) => Promise<void>;
}

export const DeviceDetailsContext = createContext<DeviceDetailsContextValue | null>(null);

export function useDeviceDetails(): DeviceDetailsContextValue {
  const ctx = useContext(DeviceDetailsContext);
  if (!ctx) throw new Error('useDeviceDetails must be used within DeviceDetailsShell');
  return ctx;
}
