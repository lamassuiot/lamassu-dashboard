'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertTriangle, Clock, HelpCircle } from 'lucide-react';

interface ApiStatusBadgeProps {
    status?: string;
}

export const ApiStatusBadge: React.FC<ApiStatusBadgeProps> = ({ status }) => {
  if (!status) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/50">
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Unknown</span>
      </div>
    );
  }

  const upperStatus = status.toUpperCase();
  
  let containerClass = '';
  let iconClass = '';
  let textClass = '';
  let dotClass = '';
  let Icon = HelpCircle;
  let displayText = upperStatus.replace('_', ' ');

  if (upperStatus.includes('ACTIVE')) {
    containerClass = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60';
    iconClass = 'text-emerald-600 dark:text-emerald-400';
    textClass = 'text-emerald-700 dark:text-emerald-300';
    dotClass = 'bg-emerald-500 dark:bg-emerald-400 shadow-emerald-500/50';
    Icon = CheckCircle2;
    displayText = 'Active';
  } else if (upperStatus.includes('REVOKED')) {
    containerClass = 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60';
    iconClass = 'text-rose-600 dark:text-rose-400';
    textClass = 'text-rose-700 dark:text-rose-300';
    dotClass = 'bg-rose-500 dark:bg-rose-400 shadow-rose-500/50';
    Icon = XCircle;
    displayText = 'Revoked';
  } else if (upperStatus.includes('EXPIRED')) {
    containerClass = 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60';
    iconClass = 'text-amber-600 dark:text-amber-400';
    textClass = 'text-amber-700 dark:text-amber-300';
    dotClass = 'bg-amber-500 dark:bg-amber-400 shadow-amber-500/50';
    Icon = AlertTriangle;
    displayText = 'Expired';
  } else if (upperStatus.includes('PENDING')) {
    containerClass = 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60';
    iconClass = 'text-sky-600 dark:text-sky-400';
    textClass = 'text-sky-700 dark:text-sky-300';
    dotClass = 'bg-sky-500 dark:bg-sky-400 shadow-sky-500/50 animate-pulse';
    Icon = Clock;
    displayText = 'Pending';
  } else {
    containerClass = 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700/60';
    iconClass = 'text-slate-500 dark:text-slate-400';
    textClass = 'text-slate-600 dark:text-slate-300';
    dotClass = 'bg-slate-400 dark:bg-slate-500';
  }

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors duration-200',
      containerClass
    )}>
      <div className="relative flex items-center justify-center">
        <div className={cn('h-1.5 w-1.5 rounded-full shadow-sm', dotClass)} />
      </div>
      <span className={cn('text-xs font-semibold tracking-wide', textClass)}>
        {displayText}
      </span>
    </div>
  );
};
