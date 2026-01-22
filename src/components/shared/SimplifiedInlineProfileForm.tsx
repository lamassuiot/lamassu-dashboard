'use client';

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CalendarDays, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ExpirationInput } from '@/components/shared/ExpirationInput';
import { SectionHeader } from '@/components/shared/FormComponents';

const NESTED_CONTAINER_STYLES = "space-y-4 p-4 border rounded-md ml-4 -mt-4 bg-background";

const keyUsageOptions = [
  "DigitalSignature", "ContentCommitment", "KeyEncipherment", "DataEncipherment",
  "KeyAgreement", "CertSign", "CRLSign", "EncipherOnly", "DecipherOnly"
] as const;
type KeyUsageOption = typeof keyUsageOptions[number];

const extendedKeyUsageOptions = [
  "ServerAuth", "ClientAuth", "CodeSigning", "EmailProtection",
  "TimeStamping", "OCSPSigning", "Any"
] as const;
type ExtendedKeyUsageOption = typeof extendedKeyUsageOptions[number];

/**
 * Simplified schema for inline CA certificate profile during CA creation.
 * Forces specific values:
 * - No name/description (temporary profile)
 * - Honor Subject From CSR: true (values from creation form)
 * - Enable Crypto Enforcement: false
 * - Honor Key Usage From CSR: false (inline definition)
 * - Honor Extended Key Usage From CSR: false (inline definition)
 * - Honor Certificate Extensions From CSR: false
 */
export const simplifiedInlineProfileSchema = z.object({
  validity: z.object({
    type: z.enum(["Duration", "Date", "Indefinite"]),
    durationValue: z.string().optional(),
    dateValue: z.date().optional(),
  }).refine(data => {
    if (data.type === 'Duration') return !!data.durationValue;
    if (data.type === 'Date') return !!data.dateValue;
    return true; // Indefinite is always valid
  }, {
    message: "A value is required for the selected validity type.",
    path: ["durationValue"],
  }),

  keyUsages: z.array(z.enum(keyUsageOptions)).optional().default([]),
  extendedKeyUsages: z.array(z.enum(extendedKeyUsageOptions)).optional().default([]),
});

export type SimplifiedInlineProfileFormValues = z.infer<typeof simplifiedInlineProfileSchema>;

export const defaultSimplifiedFormValues: SimplifiedInlineProfileFormValues = {
  validity: { type: 'Duration', durationValue: '1y' },
  keyUsages: ['CertSign', 'CRLSign'],
  extendedKeyUsages: [],
};

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase());
};

interface SimplifiedInlineProfileFormProps {
  form: UseFormReturn<SimplifiedInlineProfileFormValues>;
}

/**
 * Simplified inline profile form for CA creation.
 * Only shows Validity, Key Usages, and Extended Key Usages.
 * All other fields are hidden and forced to specific values.
 */
export const SimplifiedInlineProfileForm: React.FC<SimplifiedInlineProfileFormProps> = ({ form }) => {
  return (
    <div className="space-y-6">
      {/* Validity Section */}
      <Card>
        <SectionHeader icon={CalendarDays} title="Validity" />
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="validity"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <ExpirationInput
                    idPrefix="inline-profile-validity"
                    label="Certificate Validity"
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>Validity period for the CA certificate.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Certificate Usage Policies Section */}
      <Card>
        <SectionHeader icon={ListChecks} title="Certificate Usage Policies" />
        <CardContent className="space-y-6">
          <div className={NESTED_CONTAINER_STYLES}>
            <FormField 
              control={form.control} 
              name="keyUsages"
              render={() => (
                <FormItem>
                  <FormLabel>Key Usage</FormLabel>
                  <FormDescription>Select the key usages for the CA certificate.</FormDescription>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 border p-3 rounded-md shadow-sm bg-background">
                    {keyUsageOptions.map((item) => (
                      <FormField 
                        key={item} 
                        control={form.control} 
                        name="keyUsages"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value?.includes(item)} 
                                onCheckedChange={(checked) => {
                                  const currentValue = field.value || [];
                                  return checked 
                                    ? field.onChange([...currentValue, item])
                                    : field.onChange(currentValue.filter((value) => value !== item));
                                }} 
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {toTitleCase(item)}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className={NESTED_CONTAINER_STYLES}>
            <FormField 
              control={form.control} 
              name="extendedKeyUsages"
              render={() => (
                <FormItem>
                  <FormLabel>Extended Key Usage</FormLabel>
                  <FormDescription>Select the extended key usages (EKUs) for the CA certificate.</FormDescription>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 border p-3 rounded-md shadow-sm bg-background">
                    {extendedKeyUsageOptions.map((item) => (
                      <FormField 
                        key={item} 
                        control={form.control} 
                        name="extendedKeyUsages"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value?.includes(item)} 
                                onCheckedChange={(checked) => {
                                  const currentValue = field.value || [];
                                  return checked 
                                    ? field.onChange([...currentValue, item])
                                    : field.onChange(currentValue.filter((value) => value !== item));
                                }} 
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {toTitleCase(item)}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
