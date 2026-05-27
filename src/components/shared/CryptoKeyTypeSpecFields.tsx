'use client';

import { Label } from '@/components/ui/label';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CryptoSelectOption } from '@/lib/crypto-key-fields';

interface CryptoKeyTypeSpecFieldsProps {
  idPrefix: string;
  keyTypeLabel?: string;
  keyTypeValue: string;
  keyTypeOptions: CryptoSelectOption[];
  onKeyTypeChange: (value: string) => void;
  keySpecLabel: string;
  keySpecValue: string;
  keySpecOptions: CryptoSelectOption[];
  onKeySpecChange: (value: string) => void;
  disabled?: boolean;
  keySpecDisabled?: boolean;
}

export function CryptoKeyTypeSpecFields({
  idPrefix,
  keyTypeLabel = 'Key Type',
  keyTypeValue,
  keyTypeOptions,
  onKeyTypeChange,
  keySpecLabel,
  keySpecValue,
  keySpecOptions,
  onKeySpecChange,
  disabled = false,
  keySpecDisabled = false,
}: CryptoKeyTypeSpecFieldsProps) {
  const selectedKeySpecOption = keySpecOptions.find((option) => option.value === keySpecValue);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-type`}>{keyTypeLabel}</Label>
        <Select value={keyTypeValue} onValueChange={onKeyTypeChange} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-type`} className="mt-1">
            <SelectValue placeholder="Select key type" />
          </SelectTrigger>
          <SelectContent>
            {keyTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-spec`}>{keySpecLabel}</Label>
        <Select value={keySpecValue} onValueChange={onKeySpecChange} disabled={keySpecDisabled}>
          <SelectTrigger id={`${idPrefix}-spec`} className="mt-1">
            <SelectValue placeholder="Select key specification" />
          </SelectTrigger>
          <SelectContent>
            {keySpecOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} textValue={option.label}>
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <div className="flex shrink-0 items-center">
                    <KeyStrengthIndicator algorithm={keyTypeValue} size={option.value} variant="selector" />
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedKeySpecOption ? (
          <div className="mt-2 flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Security strength</span>
            <div className="flex shrink-0 items-center">
              <KeyStrengthIndicator algorithm={keyTypeValue} size={selectedKeySpecOption.value} variant="selector" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
