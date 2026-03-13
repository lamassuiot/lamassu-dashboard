'use client';

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CalendarDays, ListChecks } from "lucide-react";
import { ExpirationInput } from '@/components/shared/ExpirationInput';
import { formatCertificateUsageLabel } from '@/lib/utils';

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
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Validity</h3>
        </div>
        <div className="space-y-4">
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
        </div>
      </div>

      {/* Certificate Usage Policies Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Certificate Usage Policies</h3>
        </div>
        <div className="space-y-4 bg-muted/30 p-4 rounded-lg border">
          <div className="space-y-3">
            <FormField 
              control={form.control} 
              name="keyUsages"
              render={() => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Key Usage</FormLabel>
                  <FormDescription className="text-xs">Select the key usages for the CA certificate.</FormDescription>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 p-3 rounded-md bg-background">
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
                              {formatCertificateUsageLabel(item)}
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

          <div className="space-y-3">
            <FormField 
              control={form.control} 
              name="extendedKeyUsages"
              render={() => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Extended Key Usage</FormLabel>
                  <FormDescription className="text-xs">Select the extended key usages (EKUs) for the CA certificate.</FormDescription>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 p-3 rounded-md bg-background">
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
                              {formatCertificateUsageLabel(item)}
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
        </div>
      </div>
    </div>
  );
};
