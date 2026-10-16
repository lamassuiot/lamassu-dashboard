'use client';

import React, { useState } from 'react';
import { useRouter } from '@/lib/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, Shield, Lock, Code, Settings2 } from "lucide-react";
import { sileo } from '@/lib/toast';
import { Loader2 } from 'lucide-react';
import {
  createSigningProfile,
  type CreateSigningProfilePayload,
} from '@/lib/ca-data';
import { SigningProfileForm, signingProfileSchema, type SigningProfileFormValues, templateDefaults, defaultFormValues } from '@/components/shared/SigningProfileForm';
import { Form } from '@/components/ui/form';
import { SplitPanelLayout } from '@/components/shared/SplitPanelLayout';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { MethodChooser, type MethodOptionGroup } from '@/components/shared/MethodChooser';
import { FormValidationSummary, getFormErrorMessages } from '@/components/shared/FormValidationSummary';


const templateMetadata = [
    { id: 'blank', title: 'Blank Template', description: 'Start with an empty, default profile.', icon: FileText },
    { id: 'device-auth', title: 'IoT Device Auth', description: 'For standard device client/server authentication.', icon: Shield },
    { id: 'server-cert', title: 'TLS Web Server', description: 'Standard profile for HTTPS web servers.', icon: Lock },
    { id: 'code-signing', title: 'Code Signing', description: 'For signing application binaries and code.', icon: Code },
    { id: 'ca-cert', title: 'Intermediate CA', description: 'Profile for creating a new sub-CA.', icon: Settings2 },
];

const templateGroups: MethodOptionGroup[] = [
    {
        id: 'blank',
        label: 'Start from Scratch',
        description: 'Begin with default values and configure every rule yourself.',
        options: templateMetadata.filter(t => t.id === 'blank'),
    },
    {
        id: 'templates',
        label: 'Templates',
        description: 'Pre-filled rules for common certificate types. Every value can be edited before the profile is created.',
        options: templateMetadata.filter(t => t.id !== 'blank'),
    },
];


export default function CreateSigningProfilePage() {
  const router = useRouter();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [view, setView] = useState<'template' | 'form'>('template');
  const [initialFormValues, setInitialFormValues] = useState<SigningProfileFormValues | null>(defaultFormValues);
  
  const form = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
    values: initialFormValues || defaultFormValues,
    mode: 'onChange',
  });

  React.useEffect(() => {
    if (view === 'form') void form.trigger();
  }, [form, view]);

  const validationErrors = getFormErrorMessages(form.formState.errors);

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
            common_name: data.overrideCommonName,
            country: data.overrideCountry,
            state: data.overrideState,
            locality: data.overrideLocality,
            organization: data.overrideOrganization,
            organization_unit: data.overrideOrgUnit,
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
    <BreadcrumbPage className="space-y-5 pb-8" items={[ {label:'Home',href:'/'}, {label:'Issuance Profiles',href:'/signing-profiles'}, {label:'New'} ]}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {view === 'template' ? (
            <MethodChooser
              title="Create Issuance Profile"
              description="Start from a template, then customize certificate policy, validity, and cryptographic controls."
              groups={templateGroups}
              onSelect={handleTemplateSelect}
              back={{ label: 'Back to Issuance Profiles', onClick: () => router.push('/signing-profiles') }}
              ariaLabel="Template"
            />
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
                  <Button type="button" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => setView('template')}>
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

                <div className="space-y-3">
                  <FormValidationSummary errors={validationErrors} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button type="button" variant="secondary" onClick={() => router.push('/signing-profiles')}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting || !form.formState.isValid} className="min-w-36">
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create Profile
                    </Button>
                  </div>
                </div>
              </div>
            </SplitPanelLayout>
          )}
        </form>
      </Form>
    </BreadcrumbPage>
  );
}
