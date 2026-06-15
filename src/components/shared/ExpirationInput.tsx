
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { DurationInput } from './DurationInput';
import { Input } from '@/components/ui/input';

export type ExpirationType = "Duration" | "Date" | "Indefinite";

export interface ExpirationConfig {
  type: ExpirationType;
  durationValue?: string; // e.g., "10y", "365d"
  dateValue?: Date;       // Specific date
}

interface ExpirationInputProps {
  label: string;
  value: ExpirationConfig;
  onValueChange: (config: ExpirationConfig) => void;
  defaultType?: ExpirationType;
  defaultDuration?: string;
  defaultDate?: Date;
  idPrefix: string; // To ensure unique IDs for elements
}

export const ExpirationInput: React.FC<ExpirationInputProps> = ({
  label,
  value,
  onValueChange,
  defaultType = "Duration",
  defaultDuration = "1y",
  defaultDate,
  idPrefix,
}) => {
  // Internal state to manage the component's UI without immediately propagating every keystroke
  const [currentType, setCurrentType] = useState<ExpirationType>(value.type || defaultType);
  const [duration, setDuration] = useState<string>(value.durationValue || defaultDuration);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value.dateValue || defaultDate);

  // Effect to sync internal state if the prop `value` changes from the parent
  useEffect(() => {
    setCurrentType(value.type);
    setDuration(value.durationValue || defaultDuration);
    setSelectedDate(value.dateValue || defaultDate);
  }, [value, defaultDuration, defaultDate]);

  const handleTypeChange = (newType: ExpirationType) => {
    setCurrentType(newType);
    // Construct the new config object and propagate it up
    let newConfig: ExpirationConfig = { type: newType };
    if (newType === "Duration") {
      newConfig.durationValue = duration;
    } else if (newType === "Date") {
      newConfig.dateValue = selectedDate || new Date(); // Default to today if no date selected yet
    }
    onValueChange(newConfig);
  };

  const handleDurationChange = (newDuration: string) => {
    setDuration(newDuration);
    if (currentType === "Duration") {
      onValueChange({ type: "Duration", durationValue: newDuration });
    }
  };

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    if (currentType === "Date" && date) {
      onValueChange({ type: "Date", dateValue: date });
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-type`}>{label}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2 items-start">
        <Select value={currentType} onValueChange={(val) => handleTypeChange(val as ExpirationType)}>
          <SelectTrigger id={`${idPrefix}-type`}>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Duration">Duration</SelectItem>
            <SelectItem value="Date">Specific Date</SelectItem>
            <SelectItem value="Indefinite">Indefinite</SelectItem>
          </SelectContent>
        </Select>

        {currentType === "Duration" && (
          <DurationInput
            id={`${idPrefix}-duration`}
            label=""
            value={duration}
            onChange={handleDurationChange}
            placeholder="e.g., 10y, 365d, 2w"
            description="Valid units: y, w, d, h, m, s."
          />
        )}
        {currentType === "Date" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id={`${idPrefix}-date-picker`}
                variant="ghost"
                className={cn(
                  "h-8 w-full justify-start bg-input/50 px-2.5 text-left font-normal hover:bg-input/70",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate && isValid(selectedDate) ? format(selectedDate, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        )}
        {currentType === "Indefinite" && (
          <Input
            id={`${idPrefix}-indefinite`}
            value="Never Expires (9999-12-31)"
            readOnly
            className="bg-muted/50"
          />
        )}
      </div>
    </div>
  );
};
