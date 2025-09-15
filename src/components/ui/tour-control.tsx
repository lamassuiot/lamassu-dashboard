'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TourControlProps {
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
  className?: string;
  onStartTour?: () => void;
}

export const TourControl: React.FC<TourControlProps> = ({
  variant = 'outline',
  size = 'sm',
  showText = false,
  className = '',
  onStartTour,
}) => {
  const handleStartTour = () => {
    // Reset the tour completion state using cookies
    document.cookie = 'lamassu-dashboard-tour-completed=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
    
    // If a custom start function is provided, use it
    if (onStartTour) {
      onStartTour();
    } else {
      // Dispatch a custom event to notify the tour system
      window.dispatchEvent(new CustomEvent('startTour'));
    }
  };

  const buttonContent = (
    <Button
      onClick={handleStartTour}
      variant={variant}
      size={size}
      className={className}
    >
      <HelpCircle className={showText ? "mr-2 h-4 w-4" : "h-4 w-4"} />
      {showText && "Take Tour"}
    </Button>
  );

  if (showText) {
    return buttonContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {buttonContent}
        </TooltipTrigger>
        <TooltipContent>
          <p>Take a guided tour of the dashboard</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
