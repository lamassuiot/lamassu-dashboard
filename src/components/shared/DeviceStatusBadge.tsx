'use client';

import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

const DEVICE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: 'default',
  RENEWAL_PENDING: 'info',
  PENDING_ACTIVATION: 'info',
  EXPIRING_SOON: 'warning',
  INACTIVE: 'warning',
  EXPIRED: 'warning',
  REVOKED: 'destructive',
  NO_IDENTITY: 'muted',
  DECOMMISSIONED: 'muted',
};

export const DeviceStatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge variant={DEVICE_STATUS_VARIANTS[status.toUpperCase()] ?? 'muted'} dot className="capitalize">
    {status.replace(/_/g, ' ').toLowerCase()}
  </Badge>
);
