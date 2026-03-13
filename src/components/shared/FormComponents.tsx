import React from 'react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from '@/components/ui/switch';
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Constants for better maintainability
const SECTION_HEADER_STYLES = "border-b py-4";
const SECTION_TITLE_STYLES = "flex items-center text-lg";
const SWITCH_ITEM_STYLES = "flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background";

// Helper component for section headers
export const SectionHeader: React.FC<{
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <CardHeader className={SECTION_HEADER_STYLES}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <CardTitle className={SECTION_TITLE_STYLES}>
          <Icon className="mr-3 h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {action}
    </div>
  </CardHeader>
);

// Helper component for switch-based form fields
export const SwitchFormField: React.FC<{
  control: any;
  name: string;
  label: string;
  description: string;
  icon?: React.ElementType;
  disabled?: boolean;
}> = ({ control, name, label, description, icon: Icon, disabled = false }) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem className={SWITCH_ITEM_STYLES}>
        <div className="space-y-0.5">
          <FormLabel className="flex items-center">
            {Icon && <Icon className="mr-2 h-4 w-4 text-muted-foreground" />}
            {label}
          </FormLabel>
          <FormDescription>{description}</FormDescription>
        </div>
        <FormControl>
          <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
        </FormControl>
      </FormItem>
    )}
  />
);
