"use client";

import * as React from 'react';

import { Input } from '@/components/ui/input';

export interface TimedInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  delay?: number;
}

export const TimedInput = React.forwardRef<HTMLInputElement, TimedInputProps>(
  ({ value, onChange, delay = 500, ...props }, ref) => {
    const [draftValue, setDraftValue] = React.useState(value);

    React.useEffect(() => {
      setDraftValue(value);
    }, [value]);

    React.useEffect(() => {
      if (draftValue === value) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        onChange(draftValue);
      }, delay);

      return () => window.clearTimeout(timeoutId);
    }, [delay, draftValue, onChange, value]);

    return (
      <Input
        {...props}
        ref={ref}
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
      />
    );
  }
);

TimedInput.displayName = 'TimedInput';
