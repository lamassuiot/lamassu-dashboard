"use client";

import React from 'react';
import { format, parseISO, formatDistanceToNow, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { getDisplayDateFormat, getDisplayDateAndTimeFormat } from '@/lib/config';

interface DateDisplayProps {
  date: string; // ISO date string
  className?: string;
  showRelative?: boolean; // Whether to show relative time, defaults to true
  relativeClassName?: string; // Additional className for relative time
  highlightExpired?: boolean; // Whether to highlight expired dates in red, defaults to false
}

export const DateDisplay: React.FC<DateDisplayProps> = ({
  date,
  className,
  showRelative = true,
  relativeClassName,
  highlightExpired = false
}) => {
  const { displayTime } = useIdentifierDisplay();

  if (!date) {
    return <span className={className}>-</span>;
  }

  try {
    const parsedDate = parseISO(date);
    const effectiveFormatString = displayTime ? getDisplayDateAndTimeFormat() : getDisplayDateFormat();
    const formattedDate = format(parsedDate, effectiveFormatString);

    if (!showRelative) {
      return <span className={cn("date-cell", className)}>{formattedDate}</span>;
    }

    const relativeTime = formatDistanceToNow(parsedDate, { addSuffix: true });
    const isExpired = isPast(parsedDate);

    return (
      <div className={cn("flex flex-col items-start", className)}>
        <span className={cn("date-cell font-medium", highlightExpired && isExpired && "text-red-500")}>{formattedDate}</span>
        <span
          className={cn(
            "text-xs text-muted-foreground",
            highlightExpired && isExpired && "text-red-500",
            relativeClassName
          )}
        >
          {relativeTime}
        </span>
      </div>
    );
  } catch (error) {
    console.error('DateDisplay: Invalid date format:', date, error);
    return <span className={className}>Invalid date</span>;
  }
};

/**
 * Compact version that shows only relative time with a tooltip showing the full date.
 * If displayTime setting is enabled, also shows hour:min:sec in the tooltip.
 */
export const CompactDateDisplay: React.FC<DateDisplayProps> = ({
  date,
  className,
  highlightExpired = false,
  ...props
}) => {
  const { displayTime } = useIdentifierDisplay();

  if (!date) {
    return <span className={className}>-</span>;
  }

  try {
    const parsedDate = parseISO(date);
    const relativeTime = formatDistanceToNow(parsedDate, { addSuffix: true });
    const effectiveFormatString = displayTime ? getDisplayDateAndTimeFormat() : getDisplayDateFormat();
    const tooltipDate = format(parsedDate, effectiveFormatString);
    const isExpired = isPast(parsedDate);

    return (
      <span
        className={cn(
          "text-sm cursor-help text-center",
          highlightExpired && isExpired && "text-red-500",
          className
        )}
        title={tooltipDate}
      >
        {relativeTime}
      </span>
    );
  } catch (error) {
    console.error('CompactDateDisplay: Invalid date format:', date, error);
    return <span className={className}>Invalid date</span>;
  }
};
