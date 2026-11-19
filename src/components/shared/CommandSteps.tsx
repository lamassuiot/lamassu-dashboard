'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CommandStepProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}

/** One entry of a {@link CommandSteps} list; numbering comes from its position. */
export const CommandStep: React.FC<CommandStepProps> = ({ title, description, children }) => (
  <>
    <h4 className="text-sm font-semibold leading-6 text-foreground">{title}</h4>
    {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    {children && <div className="mt-3 space-y-3">{children}</div>}
  </>
);

interface CommandStepsProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Numbered, vertically connected list of instructions. Falsy children are skipped so
 * conditional steps keep a contiguous numbering.
 */
export const CommandSteps: React.FC<CommandStepsProps> = ({ children, className }) => {
  const steps = React.Children.toArray(children).filter(Boolean);
  return (
    <ol className={cn('relative', className)}>
      {steps.map((step, index) => (
        <li key={index} className="relative flex gap-4 pb-8 last:pb-0">
          {index < steps.length - 1 && (
            <span aria-hidden className="absolute left-3.5 top-8 bottom-0 w-px -translate-x-1/2 bg-border" />
          )}
          <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">{step}</div>
        </li>
      ))}
    </ol>
  );
};

/** Inline `code` chip for filenames and identifiers inside prose. */
export const InlineCode: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="rounded border bg-muted/60 px-1 py-0.5 font-mono text-[0.8em] text-foreground">{children}</code>
);
