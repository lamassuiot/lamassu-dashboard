'use client';

import React from 'react';
import { Stepper } from '@/components/shared/Stepper';

export interface DockedWizardStep {
  label: string;
  description?: string;
}

interface DockedWizardLayoutProps {
  steps: readonly DockedWizardStep[];
  currentStep: number;
  /** Content of the current step. */
  children: React.ReactNode;
  /** Shown above the footer buttons, e.g. a validation summary. */
  footerNotice?: React.ReactNode;
  /** Left side of the footer, usually Cancel. */
  footerStart?: React.ReactNode;
  /** Right side of the footer, usually Back / Next. */
  footerEnd?: React.ReactNode;
}

/**
 * Body of a wizard rendered inside a `BottomDockPanel`: a vertical step rail on the left,
 * the scrollable step content (a `@container`, so steps can adapt to the panel width) and
 * a footer with the navigation buttons.
 */
export function DockedWizardLayout({
  steps,
  currentStep,
  children,
  footerNotice,
  footerStart,
  footerEnd,
}: Readonly<DockedWizardLayoutProps>) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 overflow-y-auto border-r bg-muted/20 px-5 py-5 md:block">
        <Stepper
          orientation="vertical"
          currentStep={currentStep}
          steps={steps.map(step => step.label)}
          descriptions={steps.map(step => step.description ?? '')}
        />
      </aside>
      <div className="flex min-h-0 flex-col">
        <div className="@container min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </div>
        <footer className="shrink-0 space-y-3 border-t bg-muted/10 px-4 py-3 md:px-6">
          {footerNotice}
          <div className="flex items-center justify-between gap-2">
            <div>{footerStart}</div>
            <div className="flex items-center gap-2">{footerEnd}</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
