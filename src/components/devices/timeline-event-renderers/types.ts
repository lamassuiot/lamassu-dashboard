import type React from 'react';

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

export interface TimelineEventDisplayData {
  id: string;
  timestamp: Date;
  eventType: string;
  title: string;
  description?: string;
  details?: React.ReactNode;
  relativeTime: string;
  secondaryRelativeTime?: string;
  certificate?: CertificateHistoryEntry;
  source: string;
  structuredData?: unknown | null;
}

export interface TimelineEventRendererProps {
  event: TimelineEventDisplayData;
  onRevoke: (certInfo: CertificateHistoryEntry) => void;
  onReactivate: (certInfo: CertificateHistoryEntry) => void;
}

export interface TimelineEventRendererVisuals {
  display?: string;
  dotClass?: string;
  iconClass?: string;
  lineClass?: string;
  iconPresentation?: 'circle' | 'plain';
  iconContainerClass?: string;
}

export interface TimelineEventRendererDefinition {
  Component: React.ComponentType<TimelineEventRendererProps>;
  Icon?: React.ElementType;
  visuals?: TimelineEventRendererVisuals;
}
