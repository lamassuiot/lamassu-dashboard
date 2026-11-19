'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface StepperProps {
  currentStep: number;
  steps: string[];
  /** `vertical` renders a compact rail, suited to wide-but-short containers. */
  orientation?: 'horizontal' | 'vertical';
  /** Optional one-line hint under each step label (vertical only). */
  descriptions?: string[];
  className?: string;
}

function VerticalStepper({ currentStep, steps, descriptions, className }: Omit<StepperProps, 'orientation'>) {
  return (
    <ol className={cn('flex flex-col', className)}>
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;
        const isLast = index === steps.length - 1;
        return (
          <li key={label} className="relative flex gap-3 pb-5 last:pb-0" aria-current={isActive ? 'step' : undefined}>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[11px] top-7 bottom-1 w-px transition-colors',
                  isCompleted ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                isCompleted && 'bg-primary text-primary-foreground',
                isActive && 'bg-background text-primary ring-2 ring-primary',
                !isCompleted && !isActive && 'bg-muted text-muted-foreground ring-1 ring-border',
              )}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : stepNumber}
            </span>
            <div className="min-w-0 pt-0.5">
              <p
                className={cn(
                  'text-sm leading-5',
                  isActive ? 'font-semibold text-foreground' : isCompleted ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </p>
              {descriptions?.[index] && (
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{descriptions[index]}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const Stepper: React.FC<StepperProps> = ({ currentStep, steps, orientation = 'horizontal', descriptions, className }) => {
  if (orientation === 'vertical') {
    return <VerticalStepper currentStep={currentStep} steps={steps} descriptions={descriptions} className={className} />;
  }

  return (
    <div className={cn('flex items-center space-x-2 sm:space-x-4 mb-6 sm:mb-8', className)}>
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;
        return (
          <React.Fragment key={stepNumber}>
            <div className="flex flex-col items-center space-y-1">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center font-bold transition-colors text-xs sm:text-sm",
                isCompleted ? "bg-primary text-primary-foreground" :
                isActive ? "bg-primary/20 border-2 border-primary text-primary" :
                "bg-muted border-2 border-border text-muted-foreground"
              )}>
                {isCompleted ? <Check className="h-5 w-5" /> : stepNumber}
              </div>
              <p className={cn(
                "text-xs font-medium text-center",
                isActive || isCompleted ? "text-primary" : "text-muted-foreground"
              )}>{label}</p>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 transition-colors mt-[-1rem]",
                isCompleted ? "bg-primary" : "bg-border"
              )}></div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
