import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface FormValidationSummaryProps {
  errors?: readonly string[];
  warnings?: readonly string[];
  className?: string;
}

export function getFormErrorMessages(errors: unknown): string[] {
  const messages = new Set<string>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;

    const error = value as Record<string, unknown>;
    if (typeof error.message === 'string' && error.message.trim()) {
      messages.add(error.message);
    }

    Object.entries(error).forEach(([key, nestedValue]) => {
      if (key !== 'message' && key !== 'ref' && key !== 'types') visit(nestedValue);
    });
  };

  visit(errors);
  return [...messages];
}

export function FormValidationSummary({
  errors = [],
  warnings = [],
  className,
}: FormValidationSummaryProps) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{errors.length} {errors.length === 1 ? 'error' : 'errors'} to resolve</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'} to review</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

interface FormFieldErrorProps {
  id?: string;
  title: string;
  description?: string;
  className?: string;
}

export function FormFieldError({ id, title, description, className }: FormFieldErrorProps) {
  return (
    <p id={id} role="alert" className={cn('flex items-center gap-1.5 text-xs text-destructive', className)}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium">{title}</span>
        {description ? ` ${description}` : null}
      </span>
    </p>
  );
}
