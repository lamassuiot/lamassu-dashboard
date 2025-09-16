import React from 'react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from '@/components/ui/switch';
import { CardHeader, CardTitle } from "@/components/ui/card";

// Constants for better maintainability
const SECTION_HEADER_STYLES = "bg-primary border-b border-primary/20 py-3 mb-5";
const SECTION_TITLE_STYLES = "text-base font-semibold flex items-center text-primary-foreground";
const SWITCH_ITEM_STYLES = "flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background";

// Helper component for section headers
export const SectionHeader: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <CardHeader className={SECTION_HEADER_STYLES}>
    <CardTitle className={SECTION_TITLE_STYLES}>
      <Icon className="mr-2 h-4 w-4" />
      {title}
    </CardTitle>
  </CardHeader>
);

// Helper component for switch-based form fields
export const SwitchFormField: React.FC<{
  control: any;
  name: string;
  label: string;
  description: string;
  icon?: React.ElementType;
}> = ({ control, name, label, description, icon: Icon }) => (
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
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        </FormControl>
      </FormItem>
    )}
  />
);