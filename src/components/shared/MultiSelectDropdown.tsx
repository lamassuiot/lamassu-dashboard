

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
import { Badge } from '@/components/ui/badge';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  id?: string;
  options: Option[];
  allOptionValues?: string[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
  buttonText?: string;
  className?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  id,
  options,
  allOptionValues = [],
  selectedValues,
  onChange,
  buttonText = "Select options...",
  className,
}) => {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn("w-full justify-between font-normal h-auto min-h-10", className)}
        >
          <div className="flex flex-wrap gap-1 items-center">
            {selectedLabels.length > 0 ? (
              selectedLabels.map((label) => <Badge key={label} variant="secondary">{label}</Badge>)
            ) : (
              <span className="text-muted-foreground">{buttonText}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel>Select Sources</DropdownMenuLabel>
        <div className="flex justify-between px-2 py-1">
            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={handleSelectAll}>Select All</Button>
            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={handleClear}>Clear</Button>
        </div>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selectedValues.includes(option.value)}
            onCheckedChange={() => handleSelect(option.value)}
            onSelect={(e) => e.preventDefault()} // Prevent menu from closing on item click
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
