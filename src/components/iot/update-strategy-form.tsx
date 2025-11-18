
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpdateStrategy, UpdatePack } from '@/types/iot'; // UpdatePack added
// MOCK_DEVICES and MOCK_UPDATE_STRATEGIES removed as strategy is global and packs are fetched
import { toast } from "@/hooks/use-toast";
import { Rocket } from 'lucide-react';

const SELECT_NONE_VALUE = "_NONE_"; 

const strategyFormSchema = z.object({
  workflowType: z.enum(["wfx.workflow.dau.direct", "wfx.workflow.phased.rollout"]),
  rolloutType: z.enum(["numeric", "percentage"]),
  rolloutValue: z.coerce.number().int().positive("Rollout value must be a positive integer."),
  testDeviceId: z.string().optional(), // Assuming MOCK_DEVICES is still used for test device IDs for now
  updatePackId: z.string().optional(), // This will store the ID of the update pack
});

type StrategyFormValues = z.infer<typeof strategyFormSchema>;

interface UpdateStrategyFormProps {
  strategy?: UpdateStrategy; 
  availableUpdatePacks: UpdatePack[]; // Added prop for update packs
  defaultSelectedPackId?: string; // New prop for pre-selecting a pack
  onStrategySavedOrUpdated?: (strategy: UpdateStrategy) => void;
}

export function UpdateStrategyForm({ 
  strategy: initialStrategyData, 
  availableUpdatePacks,
  defaultSelectedPackId,
  onStrategySavedOrUpdated 
}: UpdateStrategyFormProps) {

  const defaultFormValues: StrategyFormValues = {
    workflowType: "wfx.workflow.dau.direct",
    rolloutType: "numeric",
    rolloutValue: 10,
    testDeviceId: undefined,
    updatePackId: defaultSelectedPackId || undefined, // Use the default selected pack
  };

  const form = useForm<StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: initialStrategyData ? {
      workflowType: initialStrategyData.workflowType,
      rolloutType: initialStrategyData.rolloutType,
      rolloutValue: initialStrategyData.rolloutValue,
      testDeviceId: initialStrategyData.testDeviceId || undefined,
      updatePackId: defaultSelectedPackId || initialStrategyData.updatePackId || undefined,
    } : {
      workflowType: "wfx.workflow.dau.direct",
      rolloutType: "numeric",
      rolloutValue: 10,
      testDeviceId: undefined,
      updatePackId: defaultSelectedPackId || undefined,
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
      });
    } else {
      // When no initial strategy data, use defaults with the selected pack
      form.reset({
        workflowType: "wfx.workflow.dau.direct",
        rolloutType: "numeric",
        rolloutValue: 10,
        testDeviceId: undefined,
        updatePackId: defaultSelectedPackId || undefined,
      });
    }
  }, [initialStrategyData, defaultSelectedPackId, form]);

  const onSubmit = (data: StrategyFormValues) => {
    const processedData = { ...data };
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
    
    if (onStrategySavedOrUpdated) {
      onStrategySavedOrUpdated(strategyToSave);
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Main Configuration Card */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-primary/10">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-primary">Rollout Configuration</CardTitle>
            <CardDescription className="text-sm">Configure how firmware updates will be deployed to your device fleet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Workflow and Update Pack Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="workflowType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm font-medium text-foreground">Workflow Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11 bg-background border-primary/20 focus:border-primary">
                          <SelectValue placeholder="Select workflow type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="wfx.workflow.dau.direct">Direct Update</SelectItem>
                        <SelectItem value="wfx.workflow.phased.rollout">Phased Rollout</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      {field.value === 'wfx.workflow.dau.direct' 
                        ? 'Deploy immediately to all targeted devices' 
                        : 'Deploy in controlled phases with monitoring'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="updatePackId"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm font-medium text-foreground">Update Pack</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE}>
                      <FormControl>
                        <SelectTrigger className="h-11 bg-background border-primary/20 focus:border-primary">
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
                    <FormDescription className="text-xs">Choose the update pack to deploy</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Rollout Configuration Section */}
            <div className="bg-background/50 rounded-lg p-4 border border-primary/10">
              <h4 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full"></div>
                Rollout Targeting
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="rolloutType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-sm font-medium text-foreground">Target Type</FormLabel>
                      <div className="flex items-center justify-between p-4 bg-background rounded-md border border-primary/20 hover:border-primary/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full transition-colors ${
                            field.value === 'numeric' ? 'bg-blue-500' : 'bg-orange-500'
                          }`}></div>
                          <div>
                            <div className="text-sm font-medium">
                              {field.value === 'numeric' ? 'Fixed Count' : 'Percentage'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {field.value === 'numeric' ? 'Specific number of devices' : 'Percentage of fleet'}
                            </div>
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value === 'percentage'}
                            onCheckedChange={(checked) => field.onChange(checked ? 'percentage' : 'numeric')}
                            className="data-[state=checked]:bg-orange-500"
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
                    <FormItem className="space-y-3">
                      <FormLabel className="text-sm font-medium text-foreground">
                        {form.watch("rolloutType") === "percentage" ? "Percentage Value" : "Device Count"}
                      </FormLabel>
                      <div className="flex items-center gap-3 p-3 bg-background rounded-md border border-primary/20 hover:border-primary/40 transition-colors">
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder={form.watch("rolloutType") === "percentage" ? "25" : "10"} 
                            {...field} 
                            className="w-24 h-10 text-center text-base font-semibold bg-background border-0 focus:ring-0 p-0"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground font-medium">
                          {form.watch("rolloutType") === "percentage" ? "%" : "devices"}
                        </span>
                      </div>
                      <FormDescription className="text-xs">
                        {form.watch("rolloutType") === "percentage" 
                          ? "Percentage of total devices (1-100)" 
                          : "Number of devices to update"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Device Card */}
        <Card className="border-0 shadow-sm bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-amber-800 dark:text-amber-200">
              Test Device (Optional)
            </CardTitle>
            <CardDescription className="text-sm text-amber-700 dark:text-amber-300">
              Validate your update on a single device before full deployment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="testDeviceId"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-sm font-medium text-foreground">Select Test Device</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE}>
                    <FormControl>
                      <SelectTrigger className="h-11 bg-background border-amber-200 dark:border-amber-800 focus:border-amber-500">
                        <SelectValue placeholder="Choose a test device" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SELECT_NONE_VALUE}>Skip testing</SelectItem>
                      {MOCK_DEVICES_FOR_TEST.map(device => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.name}
                          <span className="text-xs text-muted-foreground">({device.id})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs text-amber-600 dark:text-amber-400">
                    Recommended for production deployments to catch issues early
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-primary/10">
          <Button 
            type="submit" 
            disabled={!form.watch("updatePackId") || form.watch("updatePackId") === SELECT_NONE_VALUE}
            className="w-full h-12 bg-primary hover:bg-primary/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Rocket className="h-5 w-5 mr-2" />
            {form.watch("updatePackId") && form.watch("updatePackId") !== SELECT_NONE_VALUE
              ? `Prepare launch for ${availableUpdatePacks.find(pack => pack.id === form.watch("updatePackId"))?.name || 'Update Pack'}`
              : "Select an update pack to continue"
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}
