'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/shared/FormComponents';

interface DetailSectionCardProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** When false, renders as a plain section (header + content, no border/
   * shadow/background) instead of wrapping in a <Card>. Useful on pages that
   * otherwise avoid card chrome. Defaults to true. */
  withCard?: boolean;
}

export const DetailSectionCard: React.FC<DetailSectionCardProps> = ({
  icon,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  withCard = true,
}) => {
  if (!withCard) {
    return (
      <div className={className}>
        <SectionHeader icon={icon} title={title} description={description} action={action} bare />
        <div className={cn('mt-4', contentClassName)}>{children}</div>
      </div>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <SectionHeader icon={icon} title={title} description={description} action={action} />
      <CardContent className={contentClassName || undefined}>{children}</CardContent>
    </Card>
  );
};
