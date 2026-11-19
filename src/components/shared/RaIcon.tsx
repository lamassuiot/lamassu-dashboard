'use client';

import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { cn } from '@/lib/utils';

interface RaIconProps {
  /** Lucide icon name from the RA's device provisioning profile. */
  icon?: string | null;
  /** `"<iconColor>-<backgroundColor>"`, as stored in the provisioning profile. */
  iconColor?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZES = {
  sm: { tile: 'p-1.5', icon: 'h-4 w-4' },
  md: { tile: 'p-2', icon: 'h-5 w-5' },
} as const;

// TODO: refactor - same icon/color rendering duplicated in src/components/shared/DmsSelector.tsx and src/components/shared/EstReEnrollModal.tsx (DeviceIcon)
/**
 * Icon tile of a Registration Authority, using the icon and colors configured in its
 * device provisioning profile. Falls back to the RA navigation icon in theme colors.
 */
export function RaIcon({ icon, iconColor, size = 'sm', className }: Readonly<RaIconProps>) {
  const sizes = SIZES[size];
  const IconComponent = icon ? getLucideIconByName(icon) : null;

  if (!IconComponent) {
    return (
      <div className={cn('shrink-0 rounded-md bg-primary/10', sizes.tile, className)}>
        <ClipboardCheck className={cn(sizes.icon, 'text-primary')} />
      </div>
    );
  }

  const [color, backgroundColor] = (iconColor || '#888888-#e0e0e0').split('-');
  return (
    <div className={cn('shrink-0 rounded-md', sizes.tile, className)} style={{ backgroundColor }}>
      <IconComponent className={sizes.icon} style={{ color }} />
    </div>
  );
}

/** Minimal RA shape needed to resolve its icon; any RA payload from the DMS API fits. */
export interface RaIconSource {
  settings?: {
    enrollment_settings?: {
      device_provisioning_profile?: { icon?: string | null; icon_color?: string | null } | null;
    } | null;
  } | null;
}

/** `RaIcon` for a whole RA object, reading its device provisioning profile. */
export function RaIconFor({ ra, size, className }: Readonly<{ ra: RaIconSource | null | undefined; size?: RaIconProps['size']; className?: string }>) {
  const profile = ra?.settings?.enrollment_settings?.device_provisioning_profile;
  return <RaIcon icon={profile?.icon} iconColor={profile?.icon_color} size={size} className={className} />;
}
