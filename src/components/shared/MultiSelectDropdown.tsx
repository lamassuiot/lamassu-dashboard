

'use client';

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
  group?: string;
  icon?: React.ReactNode | React.ElementType;
}

interface MultiSelectDropdownProps {
  id?: string;
  options: Option[];
  allOptionValues?: string[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
  buttonText?: string;
  className?: string;
  contentClassName?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  id,
  options,
  allOptionValues = [],
  selectedValues,
  onChange,
  buttonText = "Select options...",
  className,
  contentClassName,
}) => {
  const renderOptionIcon = (icon: Option['icon']) => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || typeof icon === 'object') {
      const Icon = icon as React.ElementType;
      return <Icon className="h-3.5 w-3.5 shrink-0" />;
    }
    return icon;
  };

  const handleSelect = (value: string) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    onChange(newSelected);
  };

  const handleSelectAll = () => {
    onChange(allOptionValues.length > 0 ? allOptionValues : options.map(o => o.value));
  };

  const handleClear = () => {
    onChange([]);
  };

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  const selectedSummary =
    selectedLabels.length <= 2
      ? selectedLabels.join(', ')
      : `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          variant="ghost"
          className={cn("h-8 w-full justify-between gap-2 bg-input/50 px-2.5 font-normal hover:bg-input/70", className)}
          title={selectedLabels.length > 0 ? selectedLabels.join(', ') : buttonText}
        >
          <div className="min-w-0 flex-1 truncate text-left">
            {selectedLabels.length > 0 ? (
              <span className="block truncate">{selectedSummary}</span>
            ) : (
              <span className="text-muted-foreground">{buttonText}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn('w-56', contentClassName)} align="end">
        <DropdownMenuLabel>Select options</DropdownMenuLabel>
        <div className="flex justify-between px-2 py-1">
            <Button variant="link" className="p-0 h-auto text-xs" onClick={handleSelectAll}>Select All</Button>
            <Button variant="link" className="p-0 h-auto text-xs" onClick={handleClear}>Clear</Button>
        </div>
        <DropdownMenuSeparator />
        {options.map((option, index) => {
          const previousGroup = options[index - 1]?.group;
          const shouldRenderGroup = option.group && option.group !== previousGroup;

          return (
            <React.Fragment key={option.value}>
              {shouldRenderGroup && (
                <>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{option.group}</DropdownMenuLabel>
                </>
              )}
              <DropdownMenuCheckboxItem
                checked={selectedValues.includes(option.value)}
                onCheckedChange={() => handleSelect(option.value)}
                onSelect={(e) => e.preventDefault()} // Prevent menu from closing on item click
              >
                {renderOptionIcon(option.icon)}
                {option.label}
              </DropdownMenuCheckboxItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
