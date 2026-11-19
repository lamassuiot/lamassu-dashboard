'use client';

import React from 'react';
import { AlertTriangle, Info, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type InlineNoteTone = 'warning' | 'success' | 'info' | 'error';

const TONES: Record<InlineNoteTone, { className: string; icon: LucideIcon }> = {
  warning: { className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', icon: AlertTriangle },
  success: { className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: ShieldCheck },
  info: { className: 'bg-muted text-muted-foreground', icon: Info },
  error: { className: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
};

interface InlineNoteProps {
  tone?: InlineNoteTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}

/** Compact one-line callout for contextual hints; a lighter alternative to `Alert`. */
export function InlineNote({ tone = 'info', icon, className, children }: Readonly<InlineNoteProps>) {
  const { className: toneClassName, icon: DefaultIcon } = TONES[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div className={cn('flex items-start gap-2 rounded-md px-2.5 py-2 text-xs', toneClassName, className)}>
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
