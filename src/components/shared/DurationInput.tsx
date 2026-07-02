
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
  const componentId = useId();
  const inputId = props.id || componentId;

  useEffect(() => {
    // An empty value is not considered invalid.
    if (value && !DURATION_REGEX.test(value)) {
      setIsInvalid(true);
    } else {
      setIsInvalid(false);
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
            Invalid format. Use combined units like '1y6m30s'.
         </p>
      )}
    </div>
  );
};
