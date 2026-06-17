'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';

export const mapApiIconToIconType = (apiIcon: string): string => {
  return apiIcon || 'HelpCircle';
};

export const DeviceIcon: React.FC<{ type: string; iconColor?: string; bgColor?: string }> = ({ type, iconColor, bgColor }) => {
  const IconComponent = getLucideIconByName(type);

  return (
    <div className={cn('p-1.5 rounded-md inline-flex items-center justify-center')} style={{ backgroundColor: bgColor || '#F0F8FF' }}>
      {IconComponent ? (
        <IconComponent className={cn('h-5 w-5')} style={{ color: iconColor || '#0f67ff' }} />
      ) : (
        <HelpCircle className={cn('h-5 w-5')} style={{ color: iconColor || '#0f67ff' }} />
      )}
    </div>
  );
};
