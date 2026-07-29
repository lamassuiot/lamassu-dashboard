
'use client';

import React, { useState, useEffect, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

interface DurationInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  labelClassName?: string;
}

// Regex to validate compound duration strings like '1y6m30s'
// It ensures units are in the correct order (y, w, d, h, m, s) and appear at most once.
const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;
const DURATION_PART_REGEX = /(\d+)([ywdhms])/g;

// A zero-length duration (e.g. '0s', '0d0h') matches the format above but is
// never a meaningful value for any of this input's use sites (renewal windows,
// refresh intervals, timeouts, validities) — treat it as invalid too.
function isZeroDuration(value: string): boolean {
  let total = 0;
  for (const match of value.matchAll(DURATION_PART_REGEX)) {
    total += Number.parseInt(match[1], 10);
  }
  return total === 0;
}

// Exported so callers that hydrate a duration field from stored/API data can
// fall back to a sensible default instead of displaying an invalid value.
export function isValidPositiveDuration(value: string): boolean {
  return DURATION_REGEX.test(value) && !isZeroDuration(value);
}

export const DurationInput: React.FC<DurationInputProps> = ({
  label,
  value,
  onChange,
  description,
  className,
  labelClassName,
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
    } else if (!DURATION_REGEX.test(value)) {
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
      {label && <Label htmlFor={inputId} className={cn(labelClassName, isInvalid && 'text-destructive')}>
        {label}
      </Label>}
      <Input
        id={inputId}
        value={value}
        onChange={handleInputChange}
        className={cn(isInvalid && 'border-destructive focus-visible:ring-destructive', className)}
        {...props}
      />
      {description && !isInvalid && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {isInvalid && (
         <p className="text-xs text-destructive flex items-center">
            <AlertCircle className="h-3 w-3 mr-1"/>
            {isZero
              ? 'Must be a duration greater than zero.'
              : "Invalid format. Use combined units like '1y6m30s'."}
         </p>
      )}
    </div>
  );
};
