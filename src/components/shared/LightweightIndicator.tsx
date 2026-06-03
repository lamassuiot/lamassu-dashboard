'use client';

import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Cpu, Feather } from 'lucide-react';

interface ResourceConsumptionIndicatorProps {
  algorithm: string;
}

const getResourceConsumptionIcon = (algorithm: string): { icon: React.ReactNode; description: string; details: string } => {
  const alg = algorithm.toLowerCase();
  
  if (alg.includes('ascon')) {
    return {
      icon: <Feather className="h-4 w-4 text-green-600" />,
      description: 'Lightweight Resources',
      details: 'Optimized for IoT and constrained devices with minimal memory and processing requirements thanks to the NIST official lightweight algorithm ascon. '
    };
  }
  
  if (alg.includes('aes')) {
    return {
      icon: <Cpu className="h-4 w-4 text-yellow-600" />,
      description: 'Standard Resources',
      details: 'Standard resource requirements that constrained devices could suffer specially if low RAM and/or no hardware acceleration for AES'
    };
  }
  
  return {
    icon: <Cpu className="h-4 w-4 text-yellow-600" />,
    description: 'Standard Resources',
    details: 'Standard resource requirements for typical applications with moderate memory and processing needs.'
  };
};

export function ResourceConsumptionIndicator({ algorithm }: ResourceConsumptionIndicatorProps) {
  const { icon, description, details } = getResourceConsumptionIcon(algorithm);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">
            {icon}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1 max-w-xs">
            <div className="font-medium">{description}</div>
            <div className="text-muted-foreground">{details}</div>
            <div className="text-muted-foreground text-xs mt-1">
              {algorithm.toLowerCase().includes('ascon') 
                ? 'Ideal for: Smart sensors, wearables, IoT devices, battery-powered systems with no AES hardware acceleration '
                : 'Ideal for: Cloud servers, desktops, mobile devices, high-throughput applications, especially those with AES hardware acceleration'
              }
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}