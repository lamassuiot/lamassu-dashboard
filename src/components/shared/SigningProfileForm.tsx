
'use client';

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, KeyRound, ListChecks, Info, Shield } from "lucide-react";
import { Switch } from '@/components/ui/switch';
import { Textarea } from "@/components/ui/textarea";
import { ExpirationInput } from '@/components/shared/ExpirationInput';
import { SwitchFormField } from '@/components/shared/FormComponents';
import { cn, formatCertificateUsageLabel } from '@/lib/utils';
import {
  CA_KEY_USAGES,
  CODE_SIGNING_EXTENDED_KEY_USAGES,
  CODE_SIGNING_KEY_USAGES,
  DEVICE_AUTH_EXTENDED_KEY_USAGES,
  SERVER_AUTH_EXTENDED_KEY_USAGES,
  TLS_KEY_USAGES,
  extendedKeyUsageOptions,
  keyUsageOptions,
} from '@/lib/certificate-usage-options';

const rsaKeyStrengths = ["2048", "3072", "4096"] as const;
const ecdsaCurves = ["P-256", "P-384", "P-521"] as const;

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

  honorExtensions: z.boolean().default(true),
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
  honorExtensions: true,
};

export const templateDefaults: Record<string, Partial<SigningProfileFormValues>> = {
  'device-auth': {
    profileName: 'IoT Device Authentication Profile',
    description: 'For authenticating IoT devices. Includes client and server authentication.',
    validity: { type: 'Duration', durationValue: '5y' },
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, enabled: true },
    keyUsages: [...TLS_KEY_USAGES],
    extendedKeyUsages: [...DEVICE_AUTH_EXTENDED_KEY_USAGES],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
    honorExtensions: true,
  },
  'code-signing': {
    profileName: 'Code Signing Profile',
    description: 'For signing application code and executables.',
    validity: { type: 'Duration', durationValue: '3y' },
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, allowedEcdsaCurves: [], enabled: true }, // Often RSA
    keyUsages: [...CODE_SIGNING_KEY_USAGES],
    extendedKeyUsages: [...CODE_SIGNING_EXTENDED_KEY_USAGES],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
    honorExtensions: true,
  },
  'server-cert': {
    profileName: 'TLS Web Server Profile',
    description: 'For standard TLS web server certificates (HTTPS).',
    validity: { type: 'Duration', durationValue: '1y' },
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, enabled: true },
    keyUsages: [...TLS_KEY_USAGES],
    extendedKeyUsages: [...SERVER_AUTH_EXTENDED_KEY_USAGES],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
    honorExtensions: true,
  },
  'ca-cert': {
    profileName: 'Intermediate CA Profile',
    description: 'For issuing intermediate CA certificates that can sign other certificates.',
    validity: { type: 'Duration', durationValue: '5y' },
    signAsCa: true,
    cryptoEnforcement: { ...defaultFormValues.cryptoEnforcement, enabled: true },
    keyUsages: [...CA_KEY_USAGES],
    extendedKeyUsages: [],
    honorKeyUsage: false,
    honorExtendedKeyUsages: false,
    honorExtensions: true,
  },
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
  enforceSignAsCa?: boolean;
  sectionAsCards?: boolean;
}

const FormSection = ({
  icon: Icon,
  title,
  description,
  cardMode,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  cardMode: boolean;
  children: React.ReactNode;
}) => {
  if (cardMode) {
    return (
      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center text-lg">
            <Icon className="mr-3 h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-6">{children}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b pb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
};

export const SigningProfileForm: React.FC<SigningProfileFormProps> = ({
  form,
  enforceSignAsCa = false,
  sectionAsCards = false,
}) => {
  // Watch form values for conditional rendering
  const watchCryptoEnforcement = form.watch("cryptoEnforcement");
  const watchHonorSubject = form.watch("honorSubject");
  const watchHonorKeyUsage = form.watch("honorKeyUsage");
  const watchHonorExtendedKeyUsages = form.watch("honorExtendedKeyUsages");

  return (
    <div className="space-y-6">
      {/* Basic Information Section */}
      <FormSection
        icon={Info}
        title="Basic Information"
        description="Core naming and descriptive metadata for this issuance profile."
        cardMode={sectionAsCards}
      >
        <div className="space-y-4">
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
        </div>
      </FormSection>

      {/* Policy Configuration Section */}
      <FormSection
        icon={Settings2}
        title="Policy Configuration"
        description="Control validity, CA scope, and subject handling for issued certificates."
        cardMode={sectionAsCards}
      >
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
          
          <SwitchFormField
            control={form.control}
            name="signAsCa"
            label="Sign as Certificate Authority"
            description="Allow certificates signed with this profile to act as intermediate CAs. This enables the `isCA:TRUE` basic constraint."
            icon={Shield}
            disabled={enforceSignAsCa}
          />
          
          <div className={cn("space-y-3 rounded-md bg-muted/30 p-3", sectionAsCards && "border")}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label htmlFor="honor-subject" className="font-medium">Honor Subject From CSR</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use the Subject DN fields from the CSR. If off, you can specify override values.
                </p>
              </div>
              <FormField
                control={form.control}
                name="honorSubject"
                render={({ field }) => (
                  <FormControl>
                    <Switch id="honor-subject" checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                )}
              />
            </div>
            
            {!watchHonorSubject && (
              <div className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="overrideCountry" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country (C)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., US (2-letter code)" maxLength={2} {...field} />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="overrideState" render={({ field }) => (
                  <FormItem>
                    <FormLabel>State / Province (ST)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., California" {...field} />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="overrideOrganization" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization (O)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., LamassuIoT Corp" {...field} />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="overrideOrgUnit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organizational Unit (OU)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Secure Devices" {...field} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className={cn("flex items-start space-x-2 rounded-md bg-muted/50 p-2 text-muted-foreground", sectionAsCards && "border")}>
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs">
                  The Common Name (CN) from the CSR's subject is always honored and used. 
                  These fields will be appended to or replace other subject attributes.
                </p>
              </div>
              </div>
            )}
          </div>
      </FormSection>

      {/* Cryptographic Settings Section */}
      <FormSection
        icon={KeyRound}
        title="Cryptographic Settings"
        description="Enforce allowed key algorithms and strength requirements for certificates issued by this profile."
        cardMode={sectionAsCards}
      >
        <div className={cn("space-y-3 rounded-md bg-muted/30 p-3", sectionAsCards && "border")}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label htmlFor="crypto-enforcement" className="font-medium">Enable Crypto Enforcement</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enforce specific key types (RSA, ECDSA) and their parameters.
              </p>
            </div>
            <FormField
              control={form.control}
              name="cryptoEnforcement.enabled"
              render={({ field }) => (
                <FormControl>
                  <Switch id="crypto-enforcement" checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              )}
            />
          </div>
            {watchCryptoEnforcement && watchCryptoEnforcement.enabled && (
              <div className="space-y-4 border-t pt-3">
              <FormField control={form.control} name="cryptoEnforcement.allowRsa" render={({ field }) => (<FormItem className={cn("flex flex-row items-center justify-between", sectionAsCards && "rounded-md border bg-background p-3")}><FormLabel>Allow RSA Keys</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
              {watchCryptoEnforcement.allowRsa && (
                <FormField control={form.control} name="cryptoEnforcement.allowedRsaKeySizes" render={() => (
                  <FormItem className="ml-4 rounded-md border bg-background p-3">
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
                )} />
              )}
              <FormField control={form.control} name="cryptoEnforcement.allowEcdsa" render={({ field }) => (<FormItem className={cn("flex flex-row items-center justify-between", sectionAsCards && "rounded-md border bg-background p-3")}><FormLabel>Allow ECDSA Keys</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
              {watchCryptoEnforcement.allowEcdsa && (
                <FormField control={form.control} name="cryptoEnforcement.allowedEcdsaCurves" render={() => (
                  <FormItem className="ml-4 rounded-md border bg-background p-3">
                    <FormLabel>Allowed ECDSA Curves</FormLabel>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 pt-2">
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
                )} />
              )}
            </div>
          )}
        </div>
      </FormSection>

      {/* Certificate Usage Policies Section */}
      <FormSection
        icon={ListChecks}
        title="Certificate Usage Policies"
        description="Define whether KU, EKU, and supported CSR extensions are honored or overridden."
        cardMode={sectionAsCards}
      >
        <div className={cn("space-y-3 rounded-md bg-muted/30 p-3", sectionAsCards && "border")}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label htmlFor="honor-key-usage" className="font-medium">Honor Key Usage From CSR</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use the Key Usage extension from the CSR. If off, specify usages below.
              </p>
            </div>
            <FormField
              control={form.control}
              name="honorKeyUsage"
              render={({ field }) => (
                <FormControl>
                  <Switch id="honor-key-usage" checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              )}
            />
          </div>
            
            {!watchHonorKeyUsage && (
              <div className="space-y-3 border-t pt-3">
              <FormField 
                control={form.control} 
                name="keyUsages"
                render={() => (
                  <FormItem>
                    <FormLabel>Key Usage</FormLabel>
                    <FormDescription>Select the allowed key usages for certificates signed with this profile.</FormDescription>
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
          )}
        </div>
          
        <div className={cn("space-y-3 rounded-md bg-muted/30 p-3", sectionAsCards && "border")}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label htmlFor="honor-extended-key-usage" className="font-medium">Honor Extended Key Usage From CSR</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use the Extended Key Usage (EKU) extension from the CSR. If off, specify EKUs below.
              </p>
            </div>
            <FormField
              control={form.control}
              name="honorExtendedKeyUsages"
              render={({ field }) => (
                <FormControl>
                  <Switch id="honor-extended-key-usage" checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              )}
            />
          </div>
          
          {!watchHonorExtendedKeyUsages && (
            <div className="space-y-3 border-t pt-3">
              <FormField 
                control={form.control} 
                name="extendedKeyUsages"
                render={() => (
                  <FormItem>
                    <FormLabel>Extended Key Usage</FormLabel>
                    <FormDescription>Select the allowed extended key usages (EKUs).</FormDescription>
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
          )}
        </div>

        <div>
          <SwitchFormField
            control={form.control}
            name="honorExtensions"
            label="Honor Certificate Extensions From CSR"
            description="Preserve certificate extensions from the Certificate Signing Request (CSR). Currently, only Subject Alternative Name (SAN) extensions are supported. Note: Key Usage (KU) and Extended Key Usage (EKU) extensions have their own dedicated switches above."
          />
        </div>
      </FormSection>
    </div>
  );
};
