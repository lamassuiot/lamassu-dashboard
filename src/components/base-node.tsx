import React from 'react';
import { cn } from '@/lib/utils';

interface BaseNodeProps {
  children: React.ReactNode;
  className?: string;
}

export const BaseNode: React.FC<BaseNodeProps> = ({ children, className }) => {
  return (
    <div className={cn(
      "min-w-32 min-h-16 rounded-lg border-2 border-gray-200 bg-white shadow-sm",
      "flex items-center justify-center",
      "transition-all duration-200",
      className
    )}>
      {children}
    </div>
  );
};

interface BaseNodeContentProps {
  children: React.ReactNode;
  className?: string;
}

export const BaseNodeContent: React.FC<BaseNodeContentProps> = ({ children, className }) => {
  return (
    <div className={cn(
      "px-4 py-2 text-sm font-medium text-gray-700 text-center",
      className
    )}>
      {children}
    </div>
  );
};
