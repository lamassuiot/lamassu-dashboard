
'use client';

import React, { useState, useEffect, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { isValidDuration, isZeroDuration } from '@/lib/duration';

interface DurationInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  labelClassName?: string;
  error?: string;
}

export const DurationInput: React.FC<DurationInputProps> = ({
  label,
  value,
  onChange,
  description,
  className,
  labelClassName,
  error,
  ...props
}) => {
  const [isInvalid, setIsInvalid] = useState(false);
  const [isZero, setIsZero] = useState(false);
  const componentId = useId();
  const inputId = props.id || componentId;

  useEffect(() => {
    // An empty value is not considered invalid.
    if (!value) {
      setIsInvalid(false);
      setIsZero(false);
    } else if (!isValidDuration(value)) {
      setIsInvalid(true);
      setIsZero(false);
    } else if (isZeroDuration(value)) {
      setIsInvalid(true);
      setIsZero(true);
    } else {
      setIsInvalid(false);
      setIsZero(false);
    }
  }, [value]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
  }

  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={inputId} className={cn(labelClassName, (isInvalid || error) && 'text-destructive')}>
        {label}
      </Label>}
      <Input
        {...props}
        id={inputId}
        value={value}
        onChange={handleInputChange}
        aria-invalid={isInvalid || !!error}
        aria-describedby={error ? `${inputId}-error` : props['aria-describedby']}
        className={cn((isInvalid || error) && 'border-destructive focus-visible:ring-destructive', className)}
      />
      {description && !isInvalid && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {isInvalid && (
        <FormFieldError
          title={isZero ? 'Must be a duration greater than zero.' : "Invalid format. Use combined units like '1y6m30s'."}
        />
      )}
      {!isInvalid && error && <FormFieldError id={`${inputId}-error`} title={error} />}
    </div>
  );
};
