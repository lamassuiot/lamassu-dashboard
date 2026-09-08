'use client';

import { Loader2, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FormValidationSummary } from '@/components/shared/FormValidationSummary';

interface FormSubmitFooterProps {
  errors?: readonly string[];
  warnings?: readonly string[];
  isSubmitting: boolean;
  idleLabel: string;
  submittingLabel: string;
}

export function FormSubmitFooter({
  errors = [],
  warnings = [],
  isSubmitting,
  idleLabel,
  submittingLabel,
}: FormSubmitFooterProps) {
  return (
    <>
      <Separator />
      <div className="space-y-3 pt-6">
        <FormValidationSummary errors={errors} warnings={warnings} />
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || errors.length > 0}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            {isSubmitting ? submittingLabel : idleLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
