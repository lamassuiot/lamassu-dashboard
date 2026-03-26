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
}

export const DetailSectionCard: React.FC<DetailSectionCardProps> = ({
  icon,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}) => (
  <Card className={cn('overflow-hidden rounded-xl shadow-sm', className)}>
    <SectionHeader icon={icon} title={title} description={description} action={action} />
    <CardContent className={contentClassName || undefined}>{children}</CardContent>
  </Card>
);
