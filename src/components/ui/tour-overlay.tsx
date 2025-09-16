'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TourStep {
  id: string;
  target: string; // CSS selector for the element to highlight
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  offset?: { x: number; y: number };
}

interface TourOverlayProps {
  steps: TourStep[];
  isVisible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export const TourOverlay: React.FC<TourOverlayProps> = ({
  steps,
  isVisible,
  onComplete,
  onSkip,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipSize, setTooltipSize] = useState({ width: 350, height: 220 });

  const calculateTooltipPosition = useCallback((element: HTMLElement, step: TourStep) => {
    const tooltip = tooltipSize; // Use dynamic tooltip size
    const offset = step.offset || { x: 0, y: 0 };
    
    // Special handling for welcome/completion steps - center on screen
    if (step.id === 'welcome' || step.id === 'completion' || step.target === 'body') {
      const x = (window.innerWidth - tooltip.width) / 2 + offset.x;
      const y = (window.innerHeight - tooltip.height) / 2 + offset.y;
      return { x, y };
    }

    if (!element) return { x: 0, y: 0 };

    const rect = element.getBoundingClientRect();
    let x = 0;
    let y = 0;

    switch (step.position || 'bottom') {
      case 'top':
        x = rect.left + rect.width / 2 - tooltip.width / 2 + offset.x;
        y = rect.top - tooltip.height - 10 + offset.y;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2 - tooltip.width / 2 + offset.x;
        y = rect.bottom + 10 + offset.y;
        break;
      case 'left':
        x = rect.left - tooltip.width - 10 + offset.x;
        y = rect.top + rect.height / 2 - tooltip.height / 2 + offset.y;
        break;
      case 'right':
        x = rect.right + 10 + offset.x;
        y = rect.top + rect.height / 2 - tooltip.height / 2 + offset.y;
        break;
    }

    // Keep tooltip within viewport bounds
    const padding = 10;
    x = Math.max(padding, Math.min(x, window.innerWidth - tooltip.width - padding));
    y = Math.max(padding, Math.min(y, window.innerHeight - tooltip.height - padding));

    return { x, y };
  }, [tooltipSize]);

  const highlightElement = useCallback((selector: string, step: TourStep) => {
    // For welcome/completion steps, don't highlight any specific element
    if (step.id === 'welcome' || step.id === 'completion' || step.target === 'body') {
      setTargetElement(null);
      const position = calculateTooltipPosition(null as any, step);
      setTooltipPosition(position);
      return;
    }

    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      setTargetElement(element);
      const position = calculateTooltipPosition(element, step);
      setTooltipPosition(position);
      
      // Scroll element into view if needed
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }
  }, [calculateTooltipPosition]);

  useEffect(() => {
    if (isVisible && steps[currentStep]) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        highlightElement(steps[currentStep].target, steps[currentStep]);
        
        // Calculate tooltip size after DOM update
        const tooltipElement = document.querySelector('[data-tour-tooltip]') as HTMLElement;
        if (tooltipElement) {
          const rect = tooltipElement.getBoundingClientRect();
          setTooltipSize({ width: rect.width, height: rect.height });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentStep, isVisible, steps, highlightElement]);

  useEffect(() => {
    const handleResize = () => {
      if (targetElement && steps[currentStep]) {
        // Recalculate tooltip size on resize
        const tooltipElement = document.querySelector('[data-tour-tooltip]') as HTMLElement;
        if (tooltipElement) {
          const rect = tooltipElement.getBoundingClientRect();
          setTooltipSize({ width: rect.width, height: rect.height });
        }
        
        const position = calculateTooltipPosition(targetElement, steps[currentStep]);
        setTooltipPosition(position);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [targetElement, currentStep, steps, calculateTooltipPosition]);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getHighlightStyle = () => {
    if (!targetElement) return {};

    const rect = targetElement.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    };
  };

  if (!isVisible || !steps[currentStep]) return null;

  const currentStepData = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50">
      {/* Highlight cutout - show for non-welcome/completion steps */}
      {targetElement && (
        <div
          className="absolute border-2 border-primary rounded-lg shadow-lg transition-all duration-300 ease-in-out"
          style={{
            ...getHighlightStyle(),
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
            backgroundColor: 'transparent',
            zIndex: 51,
          }}
        />
      )}
      
      {/* Base overlay background for non-highlighted areas */}
      {!targetElement && (
        <div className="absolute inset-0 bg-black/50" />
      )}

      {/* Tooltip */}
      <Card
        data-tour-tooltip
        className="absolute w-[350px] bg-background shadow-xl border-2 transition-all duration-300 ease-in-out z-52 opacity-100"
        style={{
          left: tooltipPosition.x,
          top: tooltipPosition.y,
          backgroundColor: 'hsl(var(--background))',
          boxShadow: 'rgb(255, 255, 255) 0px 0px 0px 0px;',
          zIndex: 52,
          opacity: 1,
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              {currentStepData.title}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Step {currentStep + 1} of {steps.length}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-4">
            {currentStepData.content}
          </p>
          
          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-1 mb-4">
            <div
              className="bg-primary h-1 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prevStep}
                disabled={currentStep === 0}
                className="text-xs"
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="text-xs"
              >
                <SkipForward className="h-3 w-3 mr-1" />
                Skip Tour
              </Button>
            </div>
            <Button
              size="sm"
              onClick={nextStep}
              className="text-xs"
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
              {currentStep !== steps.length - 1 && (
                <ChevronRight className="h-3 w-3 ml-1" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
