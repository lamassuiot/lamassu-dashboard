'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IdentitySlotStatus } from '@/lib/devices-api';

interface IdentitySlotStatusBadgeProps {
  status: IdentitySlotStatus;
  className?: string;
}

export function IdentitySlotStatusBadge({ status, className }: IdentitySlotStatusBadgeProps) {
  let badgeClass = "";
  let displayText: string = status;

  switch (status) {
    case 'NOT_SET':
      badgeClass = "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-400 dark:border-gray-600";
      displayText = "Not Set";
      break;
    case 'ACTIVE':
      badgeClass = "bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700";
      displayText = "Active";
      break;
    case 'RENEWAL_PENDING':
      badgeClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-700/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700";
      displayText = "Renewal Pending";
      break;
    case 'EXPIRING_SOON':
      badgeClass = "bg-orange-100 text-orange-700 dark:bg-orange-700/30 dark:text-orange-300 border-orange-300 dark:border-orange-700";
      displayText = "Expiring Soon";
      break;
    case 'EXPIRED':
      badgeClass = "bg-red-100 text-red-700 dark:bg-red-700/30 dark:text-red-300 border-red-300 dark:border-red-700";
      displayText = "Expired";
      break;
    case 'REVOKED':
      badgeClass = "bg-red-900 text-red-100 dark:bg-red-900/50 dark:text-red-200 border-red-900 dark:border-red-800";
      displayText = "Revoked";
      break;
    default:
      badgeClass = "bg-muted text-muted-foreground border-border";
      displayText = status;
  }

  return (
    <Badge variant="outline" className={cn("text-xs", badgeClass, className)}>
      {displayText}
    </Badge>
  );
}
