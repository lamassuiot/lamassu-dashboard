
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
  rolloutType: z.enum(["fixed", "percentage"]),
  rolloutValue: z.coerce.number().int().positive("Rollout value must be a positive integer."),
  testDeviceId: z.string().optional(), // Assuming MOCK_DEVICES is still used for test device IDs for now
  updatePackId: z.string().optional(), // This will store the ID of the update pack
});

type StrategyFormValues = z.infer<typeof strategyFormSchema>;

interface UpdateStrategyFormProps {
  strategy?: UpdateStrategy; 
  availableUpdatePacks: UpdatePack[]; // Added prop for update packs
  onStrategySavedOrUpdated?: (strategy: UpdateStrategy) => void;
}

export function UpdateStrategyForm({ 
  strategy: initialStrategyData, 
  availableUpdatePacks,
  onStrategySavedOrUpdated 
}: UpdateStrategyFormProps) {

  const defaultFormValues: StrategyFormValues = {
    workflowType: "wfx.workflow.dau.direct",
    rolloutType: "percentage",
    rolloutValue: 10,
    testDeviceId: undefined,
    updatePackId: undefined, // Will store ID
  };

  const form = useForm<StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: initialStrategyData ? {
      workflowType: initialStrategyData.workflowType,
      rolloutType: initialStrategyData.rolloutType,
      rolloutValue: initialStrategyData.rolloutValue,
      testDeviceId: initialStrategyData.testDeviceId || undefined,
      updatePackId: initialStrategyData.updatePackId || undefined, // Expecting ID here
    } : defaultFormValues,
  });

  React.useEffect(() => {
    if (initialStrategyData) {
      form.reset({ 
          workflowType: initialStrategyData.workflowType,
          rolloutType: initialStrategyData.rolloutType,
          rolloutValue: initialStrategyData.rolloutValue,
          testDeviceId: initialStrategyData.testDeviceId || undefined,
          updatePackId: initialStrategyData.updatePackId || undefined,
      });
    } else {
      form.reset(defaultFormValues);
    }
  }, [initialStrategyData, form]);

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
    <Card className="w-full"> {/* Removed max-w-2xl and mx-auto for flexibility */}
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="workflowType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workflow Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select workflow type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="wfx.workflow.dau.direct">Direct</SelectItem>
                      <SelectItem value="wfx.workflow.phased.rollout">Phased</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="rolloutType"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Rollout Type</FormLabel>
                    <FormDescription>
                      Rollout: {field.value === 'fixed' ? 'Fixed number' : 'Percentage'}.
                    </FormDescription>
                  </div>
                  <FormControl>
                     <Switch
                        checked={field.value === 'percentage'}
                        onCheckedChange={(checked) => field.onChange(checked ? 'percentage' : 'fixed')}
                        aria-label={`Switch to ${field.value === 'percentage' ? 'fixed number' : 'percentage'} rollout`}
                      />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="rolloutValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rollout Value</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 10 or 100" {...field} />
                  </FormControl>
                  <FormDescription>
                    {form.getValues("rolloutType") === "percentage" ? 
                    "Percentage of devices (1-100)." : 
                    "Fixed number of devices."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="testDeviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Device ID (Optional)</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a test device" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SELECT_NONE_VALUE}>None</SelectItem>
                      {MOCK_DEVICES_FOR_TEST.map(device => (
                        <SelectItem key={device.id} value={device.id}>{device.name} ({device.id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>ID of the device to test the update on first.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="updatePackId" // This field stores the ID
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Update Pack (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? SELECT_NONE_VALUE}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an update pack" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value={SELECT_NONE_VALUE}>None (No specific pack)</SelectItem>
                      {availableUpdatePacks.map(pack => ( 
                        <SelectItem key={pack.id} value={pack.id}>{pack.name} v{pack.version}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Update pack to be used with this strategy.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 p-4 pt-6 border-t">
        <Button type="button" variant="outline" onClick={handleClearForm} className="w-full sm:w-auto">Clear Form</Button>
        <Button type="submit" onClick={form.handleSubmit(onSubmit)} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
          Save Strategy
        </Button>
      </CardFooter>
    </Card>
  );
}
