import React from 'react';
import { cn } from '@/lib/utils';

interface NodeStatusIndicatorProps {
  status: 'loading' | 'success' | 'error' | 'idle';
  variant?: 'border' | 'background' | 'glow';
  children: React.ReactNode;
  className?: string;
}

export const NodeStatusIndicator: React.FC<NodeStatusIndicatorProps> = ({
  status,
  variant = 'border',
  children,
  className
}) => {
  const getStatusStyles = () => {
    const baseStyles = 'relative';
    
    switch (status) {
      case 'loading':
        return cn(baseStyles, className);
      case 'success':
        return cn(baseStyles, 'border-green-500 bg-green-50', className);
      case 'error':
        return cn(baseStyles, 'border-red-500 bg-red-50', className);
      default:
        return cn(baseStyles, className);
    }
  };

  const renderLoadingAnimation = () => {
    // Disabled spinning borders - return null to remove animation
    return null;
  };

  return (
    <div className={getStatusStyles()}>
      {renderLoadingAnimation()}
      {children}
    </div>
  );
};
