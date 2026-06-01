'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ChevronRight, FileText, Shield, Lock, Code, Settings2 } from "lucide-react";
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import { Loader2 } from 'lucide-react';
import {
  createSigningProfile,
  type CreateSigningProfilePayload,
} from '@/lib/ca-data';
import { SigningProfileForm, signingProfileSchema, type SigningProfileFormValues, templateDefaults, defaultFormValues } from '@/components/shared/SigningProfileForm';
import { Form } from '@/components/ui/form';
import { Stepper } from '@/components/shared/Stepper';
import { SplitPanelLayout } from '@/components/shared/SplitPanelLayout';


const templateMetadata = [
    { id: 'blank', title: 'Blank Template', description: 'Start with an empty, default profile.', icon: FileText },
    { id: 'device-auth', title: 'IoT Device Auth', description: 'For standard device client/server authentication.', icon: Shield },
    { id: 'server-cert', title: 'TLS Web Server', description: 'Standard profile for HTTPS web servers.', icon: Lock },
    { id: 'code-signing', title: 'Code Signing', description: 'For signing application binaries and code.', icon: Code },
    { id: 'ca-cert', title: 'Intermediate CA', description: 'Profile for creating a new sub-CA.', icon: Settings2 },
];


export default function CreateSigningProfilePage() {
  const router = useRouter();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [view, setView] = useState<'template' | 'form'>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [initialFormValues, setInitialFormValues] = useState<SigningProfileFormValues | null>(defaultFormValues);
  
  const form = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
    values: initialFormValues || defaultFormValues,
  });

  async function handleSubmit(data: SigningProfileFormValues) {
    setIsSubmitting(true);

    let validityPayload: { type: 'Duration' | 'Date'; duration?: string; time?: string } = { type: 'Duration', duration: '1y' };
    if (data.validity.type === 'Duration' && data.validity.durationValue) {
        validityPayload = { type: 'Duration', duration: data.validity.durationValue };
    } else if (data.validity.type === 'Date' && data.validity.dateValue) {
        validityPayload = { type: 'Date', time: data.validity.dateValue.toISOString() };
    } else if (data.validity.type === 'Indefinite') {
        validityPayload = { type: 'Date', time: "9999-12-31T23:59:59.999Z" };
    }

    const payload: CreateSigningProfilePayload = {
        name: data.profileName,
        description: data.description,
        validity: validityPayload,
        sign_as_ca: data.signAsCa,
        honor_key_usage: data.honorKeyUsage,
        key_usage: data.keyUsages || [],
        honor_extended_key_usages: data.honorExtendedKeyUsages,
        extended_key_usages: data.extendedKeyUsages || [],
        honor_subject: data.honorSubject,
        honor_extensions: data.honorExtensions,
        crypto_enforcement: {
            enabled: data.cryptoEnforcement.enabled,
            allow_rsa_keys: data.cryptoEnforcement.allowRsa,
            allow_ecdsa_keys: data.cryptoEnforcement.allowEcdsa,
            allowed_rsa_key_sizes: data.cryptoEnforcement.allowedRsaKeySizes || [],
            allowed_ecdsa_key_sizes: data.cryptoEnforcement.allowedEcdsaCurves || [],
        },
    };
    
    if (!data.honorSubject) {
        payload.subject = {
            country: data.overrideCountry,
            state: data.overrideState,
            organization: data.overrideOrganization,
            organizational_unit: data.overrideOrgUnit,
        }
    }

    try {
        await createSigningProfile(payload);
        sileo.success({ title: "Profile Created", description: `Issuance Profile "${data.profileName}" has been successfully created.` });
        router.push('/signing-profiles');
    } catch (error: any) {
        sileo.error({ title: `Creation Failed`, description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    let newInitialValues: SigningProfileFormValues;
    if (templateId === 'blank') {
        newInitialValues = defaultFormValues;
    } else {
        const templateData = templateDefaults[templateId] || {};
        newInitialValues = { ...defaultFormValues, ...templateData };
    }
    setSelectedTemplateId(templateId);
    setInitialFormValues(newInitialValues);
    form.reset(newInitialValues);
    setView('form');
  };

  const selectedTemplate = templateMetadata.find((template) => template.id === selectedTemplateId) ?? templateMetadata[0];

  return (
    <div className="mb-8 w-full space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {view === 'template' ? (
            <div className="flex flex-col gap-8 mb-12">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
                onClick={() => router.push('/signing-profiles')}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to Issuance Profiles
              </Button>

              <div className="flex flex-col items-center gap-10 py-4">
                {/* Header */}
                <div className="text-center space-y-3 max-w-lg">
                  <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    Issuance Profile
                  </p>
                  <h1 className="text-3xl font-headline font-bold tracking-tight">
                    Create Issuance Profile
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Start from a trusted template, then customize certificate policy, validity, and cryptographic controls.
                  </p>
                </div>

                {/* Template cards — single row */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 w-full max-w-7xl">
                  {templateMetadata.map(({ id, title, description, icon: Icon }, i) => {
                    const isSelected = selectedTemplateId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedTemplateId(id)}
                        className={cn(
                          "group relative flex flex-col gap-6 rounded-xl border-2 p-8 text-left",
                          "transition-all duration-200 outline-none",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isSelected
                            ? "border-primary bg-primary/[0.03] shadow-md shadow-primary/10"
                            : "border-border bg-card hover:border-primary/35 hover:bg-muted/20 hover:shadow-sm"
                        )}
                      >
                        {/* Number + check indicator */}
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "font-mono text-[11px] font-bold tracking-widest transition-colors",
                            isSelected ? "text-primary" : "text-muted-foreground/50"
                          )}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <div className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200",
                            isSelected ? "border-primary bg-primary" : "border-muted-foreground/25"
                          )}>
                            {isSelected && (
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none" className="shrink-0">
                                <path d="M1 3L3.5 5.5L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        </div>

                        {/* Icon */}
                        <div className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200",
                          isSelected
                            ? "border-primary/20 bg-primary/10"
                            : "border-border bg-muted/50 group-hover:border-primary/20 group-hover:bg-primary/5"
                        )}>
                          <Icon className={cn(
                            "h-6 w-6 transition-colors duration-200",
                            isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
                          )} />
                        </div>

                        {/* Text */}
                        <div className="space-y-2">
                          <p className={cn(
                            "font-semibold text-sm leading-snug transition-colors",
                            isSelected ? "text-foreground" : "text-foreground/80"
                          )}>
                            {title}
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Continue */}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleTemplateSelect(selectedTemplateId)}
                  className="min-w-[140px]"
                >
                  Continue
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <SplitPanelLayout
              isPanelOpen
              panelWidthClassName="xl:grid-cols-[minmax(0,1fr)_300px]"
              panel={
                <Card className="h-fit overflow-hidden rounded-xl shadow-sm xl:sticky xl:top-6">
                  <CardHeader className="border-b py-4">
                    <CardTitle className="text-base">Selected Template</CardTitle>
                    <CardDescription>
                      You can edit any pre-filled values before creating the profile.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-muted p-2">
                        <selectedTemplate.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-none">{selectedTemplate.title}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{selectedTemplate.description}</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <p>• Review validity and CA signing behavior first.</p>
                      <p>• Enforce crypto constraints when policy requires strict key types.</p>
                      <p>• Configure KU/EKU overrides only when CSR values should be ignored.</p>
                    </div>
                  </CardContent>
                </Card>
              }
            >
              <div className="space-y-6">
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => setView('template')}>
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Change Template
                  </Button>
                </div>
                <div className="pb-8 border-b">
                  <h1 className="text-2xl font-bold">Profile Configuration</h1>
                  <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                    Define rules for certificate issuance, subject handling, and key policy.
                  </p>
                </div>

                <SigningProfileForm form={form} />

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => router.push('/signing-profiles')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="min-w-36">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create Profile
                  </Button>
                </div>
              </div>
            </SplitPanelLayout>
          )}
        </form>
      </Form>
    </div>
  );
}
