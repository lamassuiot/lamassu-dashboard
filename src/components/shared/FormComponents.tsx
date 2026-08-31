import React from 'react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from '@/components/ui/switch';
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SWITCH_ITEM_STYLES = "flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background";

export const SectionHeader: React.FC<{
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** When true, skips the <CardHeader> wrapper (and its card-shaped padding)
   * for use outside a <Card> ancestor. Defaults to false. */
  bare?: boolean;
}> = ({ icon: Icon, title, description, action, bare }) => {
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <CardTitle className="text-sm font-semibold leading-none">{title}</CardTitle>
          {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
        </div>
      </div>
      {action}
    </div>
  );

  return bare ? content : <CardHeader>{content}</CardHeader>;
};

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
