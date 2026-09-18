'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CryptoSelectOption } from '@/lib/crypto-key-fields';

/** Groups options by their `group` field, preserving first-seen order. Options without a group are left ungrouped. */
function groupOptions(options: CryptoSelectOption[]): { group?: string; options: CryptoSelectOption[] }[] {
  const groups: { group?: string; options: CryptoSelectOption[] }[] = [];
  for (const option of options) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.group === option.group) {
      lastGroup.options.push(option);
    } else {
      groups.push({ group: option.group, options: [option] });
    }
  }
  return groups;
}

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
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-type`}>{keyTypeLabel}</Label>
        <Select value={keyTypeValue} onValueChange={onKeyTypeChange} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-type`} className="mt-1">
            <SelectValue placeholder="Select key type" />
          </SelectTrigger>
          <SelectContent>
            {groupOptions(keyTypeOptions).map((section, index) => {
              const items = section.options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ));

              if (!section.group) return items;

              return (
                <React.Fragment key={section.group}>
                  {index > 0 && <SelectSeparator />}
                  <SelectGroup>
                    <SelectLabel>{section.group}</SelectLabel>
                    {items}
                  </SelectGroup>
                </React.Fragment>
              );
            })}
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
      </div>
    </div>
  );
}
