"use client";

import React from 'react';
import { format, parseISO, formatDistanceToNow, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { getDisplayDateFormat, getDisplayDateAndTimeFormat } from '@/lib/config';

interface DateDisplayProps {
  date: string | number; // ISO date string, unix timestamp (seconds/ms), or numeric string
  formatString?: string; // date-fns format string, defaults to 'MMM dd, yyyy'
  className?: string;
  showRelative?: boolean; // Whether to show relative time, defaults to true
  relativeClassName?: string; // Additional className for relative time
  highlightExpired?: boolean; // Whether to highlight expired dates in red, defaults to false
}

const parseDateInput = (value: string | number): Date => {
  if (typeof value === 'number') {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp);
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const numericValue = Number(trimmed);
    const timestamp = trimmed.length <= 10 ? numericValue * 1000 : numericValue;
    return new Date(timestamp);
  }

  return parseISO(trimmed);
};

/**
 * DateDisplay component that shows a formatted date with humanized relative time below it.
 * Uses date-fns for consistent date handling across the application.
 * If displayTime setting is enabled, also shows hour:min:sec.
 * 
 * @param date - ISO date string to display
 * @param formatString - Optional format string for the main date display (default: 'MMM dd, yyyy')
 * @param className - Optional className for the container
 * @param showRelative - Whether to show relative time (default: true)
 * @param relativeClassName - Optional className for the relative time text
 * @param highlightExpired - Whether to highlight expired dates in red (default: false)
 */
export const DateDisplay: React.FC<DateDisplayProps> = ({
  date,
  formatString,
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
    const parsedDate = parseDateInput(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return <span className={className}>Invalid date</span>;
    }

    const effectiveFormatString = displayTime ? getDisplayDateAndTimeFormat() : (formatString ?? getDisplayDateFormat());
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
    const parsedDate = parseDateInput(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return <span className={className}>Invalid date</span>;
    }

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
