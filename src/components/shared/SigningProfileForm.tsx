
'use client';

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Settings2, KeyRound, ListChecks, Info, Shield } from "lucide-react"; 
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from "@/components/ui/textarea";
import { ExpirationInput, type ExpirationConfig } from '@/components/shared/ExpirationInput';

const rsaKeyStrengths = ["2048", "3072", "4096"] as const;
const ecdsaCurves = ["P-256", "P-384", "P-521"] as const;

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

export const signingProfileSchema = z.object({
  profileName: z.string().min(3, "Profile name must be at least 3 characters long."),
  description: z.string().optional(),
  
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
      path: ["durationValue"], // Or an appropriate path
  }),

  signAsCa: z.boolean().default(false),
  
  honorSubject: z.boolean().default(true),
  overrideCountry: z.string().optional(),
  overrideState: z.string().optional(),
  overrideOrganization: z.string().optional(),
  overrideOrgUnit: z.string().optional(),

  cryptoEnforcement: z.object({
    enabled: z.boolean().default(false),
    allowRsa: z.boolean().default(false),
    allowEcdsa: z.boolean().default(false),
    allowedRsaKeySizes: z.array(z.number()).optional().default([]),
    allowedEcdsaCurves: z.array(z.number()).optional().default([]),
  }),
  
  honorKeyUsage: z.boolean().default(false),
  keyUsages: z.array(z.enum(keyUsageOptions)).optional().default([]),
  
  honorExtendedKeyUsages: z.boolean().default(false),
  extendedKeyUsages: z.array(z.enum(extendedKeyUsageOptions)).optional().default([]),
});

export type SigningProfileFormValues = z.infer<typeof signingProfileSchema>;

export const defaultFormValues: SigningProfileFormValues = {
  profileName: '',
  description: '',
  validity: { type: 'Duration', durationValue: '1y' },
  signAsCa: false,
  honorSubject: true,
  overrideCountry: '',
  overrideState: '',
  overrideOrganization: '',
  overrideOrgUnit: '',
  cryptoEnforcement: {
    enabled: false,
    allowRsa: true,
    allowEcdsa: true,
    allowedRsaKeySizes: [2048, 3072, 4096],
    allowedEcdsaCurves: [256, 384, 521],
  },
  honorKeyUsage: true,
  keyUsages: [],
  honorExtendedKeyUsages: true,
  extendedKeyUsages: [],
};

export const templateDefaults: Record<string, Partial<SigningProfileFormValues>> = {
  'device-auth': {
    profileName: 'IoT Device Authentication Profile',
    description: 'For authenticating IoT devices. Includes client and server authentication.',
    validity: { type: 'Duration', durationValue: '5y' },
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, enabled: true },
    keyUsages: ['DigitalSignature', 'KeyEncipherment'],
    extendedKeyUsages: ['ClientAuth', 'ServerAuth'],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
  },
  'code-signing': {
    profileName: 'Code Signing Profile',
    description: 'For signing application code and executables.',
    validity: { type: 'Duration', durationValue: '3y' },
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, allowedEcdsaCurves: [], enabled: true }, // Often RSA
    keyUsages: ['DigitalSignature', 'ContentCommitment'],
    extendedKeyUsages: ['CodeSigning'],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
  },
  'server-cert': {
    profileName: 'TLS Web Server Profile',
    description: 'For standard TLS web server certificates (HTTPS).',
    validity: { type: 'Duration', durationValue: '1y' },
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, enabled: true },
    keyUsages: ['DigitalSignature', 'KeyEncipherment'],
    extendedKeyUsages: ['ServerAuth'],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
  },
  'ca-cert': {
    profileName: 'Intermediate CA Profile',
    description: 'For issuing intermediate CA certificates that can sign other certificates.',
    validity: { type: 'Duration', durationValue: '5y' },
    signAsCa: true,
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, enabled: true },
    keyUsages: ['CertSign', 'CRLSign'],
    extendedKeyUsages: [],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
  },
};


const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase());
};

const mapEcdsaCurveToBitSize = (curve: string): number => {
    switch (curve) {
        case 'P-256': return 256;
        case 'P-384': return 384;
        case 'P-521': return 521;
        default: return 0;
    }
};

interface SigningProfileFormProps {
  form: UseFormReturn<SigningProfileFormValues>;
}

export const SigningProfileForm: React.FC<SigningProfileFormProps> = ({ form }) => {
  const watchCryptoEnforcement = form.watch("cryptoEnforcement");
  const watchHonorSubject = form.watch("honorSubject");
  const watchHonorKeyUsage = form.watch("honorKeyUsage");
  const watchhonorExtendedKeyUsages = form.watch("honorExtendedKeyUsages");

  return (
    <div className="space-y-8">
        <FormField
          control={form.control}
          name="profileName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Standard IoT Device Profile" {...field} />
              </FormControl>
              <FormDescription>A unique and descriptive name for this profile.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Describe the purpose and typical use case for this profile." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Separator />
        <h3 className="text-lg font-semibold flex items-center"><Settings2 className="mr-2 h-5 w-5 text-muted-foreground"/>Policy Configuration</h3>
         <FormField
          control={form.control}
          name="validity"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                  <ExpirationInput
                      idPrefix="profile-validity"
                      label="Certificate Validity"
                      value={field.value}
                      onValueChange={field.onChange}
                  />
              </FormControl>
              <FormDescription>Default validity for certificates signed with this profile.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="signAsCa"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel className="flex items-center"><Shield className="mr-2 h-4 w-4 text-muted-foreground"/>Sign as Certificate Authority</FormLabel>
                <FormDescription>Allow certificates signed with this profile to act as intermediate CAs. This enables the `isCA:TRUE` basic constraint.</FormDescription>
              </div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )}
        />
        <FormField
            control={form.control}
            name="honorSubject"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5"><FormLabel>Honor Subject From CSR</FormLabel><FormDescription>Use the Subject DN fields from the CSR. If off, you can specify override values.</FormDescription></div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )}
        />
        {!watchHonorSubject && (
          <div className="space-y-4 p-4 border rounded-md ml-4 -mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="overrideCountry" render={({ field }) => ( <FormItem><FormLabel>Country (C)</FormLabel><FormControl><Input placeholder="e.g., US (2-letter code)" maxLength={2} {...field} /></FormControl></FormItem> )}/>
                <FormField control={form.control} name="overrideState" render={({ field }) => ( <FormItem><FormLabel>State / Province (ST)</FormLabel><FormControl><Input placeholder="e.g., California" {...field} /></FormControl></FormItem> )}/>
                <FormField control={form.control} name="overrideOrganization" render={({ field }) => ( <FormItem><FormLabel>Organization (O)</FormLabel><FormControl><Input placeholder="e.g., LamassuIoT Corp" {...field} /></FormControl></FormItem> )}/>
                <FormField control={form.control} name="overrideOrgUnit" render={({ field }) => ( <FormItem><FormLabel>Organizational Unit (OU)</FormLabel><FormControl><Input placeholder="e.g., Secure Devices" {...field} /></FormControl></FormItem> )}/>
            </div>
             <div className="flex items-start space-x-2 text-muted-foreground bg-muted/50 p-2 rounded-md"><Info className="h-4 w-4 mt-0.5 flex-shrink-0" /><p className="text-xs">The Common Name (CN) from the CSR's subject is always honored and used. These fields will be appended to or replace other subject attributes.</p></div>
          </div>
        )}
        <Separator />
        <h3 className="text-lg font-semibold flex items-center"><KeyRound className="mr-2 h-5 w-5 text-muted-foreground"/>Cryptographic Settings</h3>
        <FormField
          control={form.control}
          name="cryptoEnforcement.enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5"><FormLabel>Enable Crypto Enforcement</FormLabel><FormDescription>Enforce specific key types (RSA, ECDSA) and their parameters.</FormDescription></div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )}
        />
        {watchCryptoEnforcement && watchCryptoEnforcement.enabled && (
          <div className="space-y-4 p-4 border rounded-md ml-4 -mt-4">
            <FormField control={form.control} name="cryptoEnforcement.allowRsa" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between"><FormLabel>Allow RSA Keys</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )}/>
            {watchCryptoEnforcement.allowRsa && (
              <FormField control={form.control} name="cryptoEnforcement.allowedRsaKeySizes" render={() => (
                <FormItem className="p-3 border rounded-md bg-background ml-4">
                  <FormLabel>Allowed RSA Key Size</FormLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 pt-2">
                    {rsaKeyStrengths.map((item) => (
                      <FormField key={item} control={form.control} name="cryptoEnforcement.allowedRsaKeySizes"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl><Checkbox checked={field.value?.includes(parseInt(item, 10))} onCheckedChange={(checked) => { const intItem = parseInt(item, 10); const currentValue = field.value || []; return checked ? field.onChange([...currentValue, intItem]) : field.onChange(currentValue.filter((value) => value !== intItem)); }} /></FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">{item}-bit</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}/>
            )}
            <FormField control={form.control} name="cryptoEnforcement.allowEcdsa" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between"><FormLabel>Allow ECDSA Keys</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )}/>
            {watchCryptoEnforcement.allowEcdsa && (
              <FormField control={form.control} name="cryptoEnforcement.allowedEcdsaCurves" render={() => (
                <FormItem className="p-3 border rounded-md bg-background ml-4">
                  <FormLabel>Allowed ECDSA Curves</FormLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 pt-2">
                    {ecdsaCurves.map((item) => (
                      <FormField key={item} control={form.control} name="cryptoEnforcement.allowedEcdsaCurves"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl><Checkbox checked={field.value?.includes(mapEcdsaCurveToBitSize(item))} onCheckedChange={(checked) => { const bitSize = mapEcdsaCurveToBitSize(item); const currentValue = field.value || []; return checked ? field.onChange([...currentValue, bitSize]) : field.onChange(currentValue.filter((value) => value !== bitSize)); }} /></FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">{item}</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}/>
            )}
          </div>
        )}
        <Separator />
        <h3 className="text-lg font-semibold flex items-center"><ListChecks className="mr-2 h-5 w-5 text-muted-foreground"/>Certificate Usage Policies</h3>
         <FormField control={form.control} name="honorKeyUsage" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Honor Key Usage From CSR</FormLabel><FormDescription>Use the Key Usage extension from the CSR. If off, specify usages below.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl></FormItem> )}/>
        {!watchHonorKeyUsage && (
          <div className="ml-4 -mt-4">
            <FormField control={form.control} name="keyUsages"
              render={() => ( 
                <FormItem><FormLabel>Key Usage</FormLabel><FormDescription>Select the allowed key usages for certificates signed with this profile.</FormDescription>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 border p-3 rounded-md shadow-sm">
                    {keyUsageOptions.map((item) => (
                      <FormField key={item} control={form.control} name="keyUsages"
                        render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => { const currentValue = field.value || []; return checked ? field.onChange([...currentValue, item]) : field.onChange(currentValue.filter((value) => value !== item)); }}/></FormControl><FormLabel className="text-sm font-normal cursor-pointer">{toTitleCase(item)}</FormLabel></FormItem> )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
        <FormField control={form.control} name="honorExtendedKeyUsages" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Honor Extended Key Usage From CSR</FormLabel><FormDescription>Use the Extended Key Usage (EKU) extension from the CSR. If off, specify EKUs below.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl></FormItem> )}/>
        {!watchhonorExtendedKeyUsages && (
           <div className="ml-4 -mt-4">
            <FormField control={form.control} name="extendedKeyUsages"
              render={() => ( 
                <FormItem><FormLabel>Extended Key Usage</FormLabel><FormDescription>Select the allowed extended key usages (EKUs).</FormDescription>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 border p-3 rounded-md shadow-sm">
                    {extendedKeyUsageOptions.map((item) => (
                      <FormField key={item} control={form.control} name="extendedKeyUsages"
                        render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0"><FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => { const currentValue = field.value || []; return checked ? field.onChange([...currentValue, item]) : field.onChange(currentValue.filter((value) => value !== item)); }}/></FormControl><FormLabel className="text-sm font-normal cursor-pointer">{toTitleCase(item)}</FormLabel></FormItem> )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
           </div>
        )}
      </div>
  );
};
