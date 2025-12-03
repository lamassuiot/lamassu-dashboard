
// src/components/iot/update-strategy-form.tsx
"use client";

import React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { UpdateStrategy, UpdatePack } from '@/types/iot'; // UpdatePack added
// MOCK_DEVICES and MOCK_UPDATE_STRATEGIES removed as strategy is global and packs are fetched
import { toast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';

const SELECT_NONE_VALUE = "_NONE_"; 

const strategyFormSchema = z.object({
  workflowType: z.enum(["wfx.workflow.dau.direct", "wfx.workflow.dau.phased"]),
  rolloutType: z.enum(["numeric", "percentage"]),
  rolloutValue: z.coerce.number().int().positive("Rollout value must be a positive integer."),
  testDeviceId: z.string().optional(), // Assuming MOCK_DEVICES is still used for test device IDs for now
  updatePackId: z.string().optional(), // This will store the ID of the update pack
  auto: z.boolean(), // Auto mode toggle - required boolean
});

type StrategyFormValues = z.infer<typeof strategyFormSchema>;

interface UpdateStrategyFormProps {
  initialStrategy?: UpdateStrategy; 
  strategy?: UpdateStrategy; // Keep for backward compatibility
  availableUpdatePacks?: UpdatePack[]; // Made optional
  defaultSelectedPackId?: string; // New prop for pre-selecting a pack
  onSave?: (strategy: UpdateStrategy) => void;
  onStrategySavedOrUpdated?: (strategy: UpdateStrategy) => void; // Keep for backward compatibility
  isSaving?: boolean;
  disableUpdatePackSelection?: boolean; // New prop to disable update pack selection
  disableWorkflowTypeSelection?: boolean; // New prop to disable workflow type selection
  showSubmitButton?: boolean; // New prop to control submit button visibility
  formId?: string; // Optional ID for the form element
}

export function UpdateStrategyForm({ 
  initialStrategy,
  strategy: legacyStrategy,
  availableUpdatePacks = [],
  defaultSelectedPackId,
  onSave,
  onStrategySavedOrUpdated,
  isSaving = false,
  disableUpdatePackSelection = false,
  disableWorkflowTypeSelection = false,
  showSubmitButton = true,
  formId,
}: UpdateStrategyFormProps) {
  // Use initialStrategy if provided, otherwise fall back to legacy strategy prop
  const initialStrategyData = initialStrategy || legacyStrategy;

  const defaultFormValues: StrategyFormValues = {
    workflowType: "wfx.workflow.dau.direct",
    rolloutType: "numeric",
    rolloutValue: 10,
    testDeviceId: undefined,
    updatePackId: defaultSelectedPackId || undefined, // Use the default selected pack
    auto: false, // Default to manual mode
  };

  const form = useForm<StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: initialStrategyData ? {
      workflowType: initialStrategyData.workflowType,
      rolloutType: initialStrategyData.rolloutType,
      rolloutValue: initialStrategyData.rolloutValue,
      testDeviceId: initialStrategyData.testDeviceId || undefined,
      updatePackId: defaultSelectedPackId || initialStrategyData.updatePackId || undefined,
      auto: initialStrategyData.auto ?? false, // Include auto in defaultValues
    } : {
      workflowType: "wfx.workflow.dau.direct",
      rolloutType: "numeric",
      rolloutValue: 10,
      testDeviceId: undefined,
      updatePackId: defaultSelectedPackId || undefined,
      auto: false, // Include auto in defaultValues
    },
  });

  React.useEffect(() => {
    if (initialStrategyData) {
      form.reset({ 
          workflowType: initialStrategyData.workflowType,
          rolloutType: initialStrategyData.rolloutType,
          rolloutValue: initialStrategyData.rolloutValue,
          testDeviceId: initialStrategyData.testDeviceId || undefined,
          updatePackId: defaultSelectedPackId || initialStrategyData.updatePackId || undefined,
          auto: initialStrategyData.auto ?? false, // Use nullish coalescing for boolean
      });
    } else {
      // When no initial strategy data, use defaults with the selected pack
      form.reset({
        workflowType: "wfx.workflow.dau.direct",
        rolloutType: "numeric",
        rolloutValue: 10,
        testDeviceId: undefined,
        updatePackId: defaultSelectedPackId || undefined,
        auto: false,
      });
    }
  }, [initialStrategyData, defaultSelectedPackId, form]);

  const onSubmit = (data: StrategyFormValues) => {
    console.log('Form submitted with data:', data);
    console.log('Auto field value:', data.auto);
    
    const processedData = { 
      ...data,
      auto: data.auto ?? false, // Ensure auto is always a boolean
    };
    
    console.log('Processed data:', processedData);
    
    if (processedData.testDeviceId === SELECT_NONE_VALUE) {
      processedData.testDeviceId = undefined;
    }
    if (processedData.updatePackId === SELECT_NONE_VALUE) {
      processedData.updatePackId = undefined;
    }

    const strategyToSave: UpdateStrategy = {
      // id and name are handled by parent if it's a global strategy concept
      ...initialStrategyData, // Carry over ID or other props if they exist
      ...processedData,
    };
    
    // Use onSave if provided, otherwise fall back to legacy callback
    const saveCallback = onSave || onStrategySavedOrUpdated;
    
    if (saveCallback) {
      saveCallback(strategyToSave);
    } else {
        // Fallback toast if no callback provided (e.g. standalone form usage)
        toast({
            title: "Strategy Form Submitted",
            description: "Data is ready (no specific save action defined by parent).",
        });
        console.log("Strategy form submitted:", strategyToSave);
    }
  };
  
  const handleClearForm = () => {
    form.reset(defaultFormValues);
    form.clearErrors();
    toast({
      title: "Form Cleared",
      description: "Strategy form has been reset.",
    });
  };

  const cardTitle = initialStrategyData?.id || initialStrategyData?.name // Check if editing an existing one
    ? `Edit Strategy` 
    : "Configure New Strategy";
  const cardDescription = initialStrategyData?.id || initialStrategyData?.name
    ? "Modify the details of the strategy."
    : "Define how firmware rollouts happen.";

  // For test device ID, still using MOCK_DEVICES. This could be fetched if needed.
  const MOCK_DEVICES_FOR_TEST = [
      { id: 'dev_001', name: 'Smart Thermostat Alpha'},
      { id: 'ecs_device1', name: 'ECS Device 1'},
      { id: 'ecs_device2', name: 'ECS Device 2'},
  ];


  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-1">
        
        <div className="grid gap-6">
          {/* Configuration Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Rollout Configuration
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="workflowType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workflow Type</FormLabel>
                    {disableWorkflowTypeSelection ? (
                      <div className="h-10 px-3 py-2 bg-muted border rounded-md flex items-center text-sm text-muted-foreground">
                        {field.value === 'wfx.workflow.dau.direct' ? 'Direct Update' : 
                         field.value === 'wfx.workflow.dau.phased' ? 'Phased Rollout' : 
                         'Not Set'}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value} disabled={disableWorkflowTypeSelection}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select workflow type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="wfx.workflow.dau.direct">Direct Update</SelectItem>
                          <SelectItem value="wfx.workflow.dau.phased">Phased Rollout</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="updatePackId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Update Pack</FormLabel>
                    {disableUpdatePackSelection ? (
                      <div className="h-10 px-3 py-2 bg-muted border rounded-md flex items-center text-sm text-muted-foreground">
                        {field.value ? (
                          availableUpdatePacks.find(pack => pack.id === field.value) 
                            ? `${availableUpdatePacks.find(pack => pack.id === field.value)?.name} v${availableUpdatePacks.find(pack => pack.id === field.value)?.version}`
                            : `Pack ID: ${field.value}`
                        ) : 'No update pack assigned'}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE} disabled={disableUpdatePackSelection}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select update pack" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE_VALUE}>None (Select later)</SelectItem>
                          {availableUpdatePacks.map(pack => ( 
                            <SelectItem key={pack.id} value={pack.id}>{pack.name} v{pack.version}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="rolloutType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Type</FormLabel>
                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md border">
                      <span className="text-sm pl-2">
                        {field.value === 'numeric' ? 'Fixed Count' : 'Percentage'}
                      </span>
                      <FormControl>
                        <Switch
                          checked={field.value === 'percentage'}
                          onCheckedChange={(checked) => field.onChange(checked ? 'percentage' : 'numeric')}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            
              <FormField
                control={form.control}
                name="rolloutValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {form.watch("rolloutType") === "percentage" ? "Percentage Value" : "Device Count"}
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder={form.watch("rolloutType") === "percentage" ? "25" : "10"} 
                          {...field} 
                          className="pr-12"
                        />
                      </FormControl>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground text-sm">
                        {form.watch("rolloutType") === "percentage" ? "%" : "devs"}
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Advanced Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Execution Settings
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="auto"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Auto Mode</FormLabel>
                      <FormDescription>
                        Automatically start rollout
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="testDeviceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Device (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select device" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE_VALUE}>None</SelectItem>
                        {MOCK_DEVICES_FOR_TEST.map(device => (
                          <SelectItem key={device.id} value={device.id}>
                            {device.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {showSubmitButton && (
          <div className="pt-4">
            <Button 
              type="submit" 
              disabled={isSaving || (!disableUpdatePackSelection && (!form.watch("updatePackId") || form.watch("updatePackId") === SELECT_NONE_VALUE))}
              className="w-full h-11 text-base font-medium shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {disableUpdatePackSelection 
                    ? (initialStrategyData?.id ? 'Update Strategy' : 'Save Strategy')
                    : (form.watch("updatePackId") && form.watch("updatePackId") !== SELECT_NONE_VALUE
                      ? `Prepare Launch`
                      : "Select Update Pack"
                    )
                  }
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
