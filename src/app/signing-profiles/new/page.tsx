'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, PlusCircle, FileText, Shield, Lock, Code, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
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
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [view, setView] = useState<'template' | 'form'>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [initialFormValues, setInitialFormValues] = useState<SigningProfileFormValues | null>(defaultFormValues);
  
  const form = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
    values: initialFormValues || defaultFormValues,
  });

  async function handleSubmit(data: SigningProfileFormValues) {
    if (!user?.access_token) {
        toast({ title: "Error", description: "Authentication token is missing.", variant: "destructive" });
        return;
    }

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
        await createSigningProfile(payload, user.access_token);
        toast({ title: "Profile Created", description: `Issuance Profile "${data.profileName}" has been successfully created.` });
        router.push('/signing-profiles');
    } catch (error: any) {
        toast({ title: `Creation Failed`, description: error.message, variant: "destructive" });
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
      <div className="flex flex-col gap-4 p-1 sm:flex-row sm:items-start sm:justify-between sm:p-0">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PlusCircle className="h-4 w-4" />
            Issuance Profile Wizard
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Issuance Profile</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Start from a trusted template, then customize certificate policy, validity, and cryptographic controls.
          </p>
          <div className="max-w-xl pt-2">
            <Stepper currentStep={view === 'template' ? 1 : 2} steps={["Choose Template", "Configure Profile"]} />
          </div>
        </div>
        <Button variant="outline" onClick={() => router.push('/signing-profiles')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Issuance Profiles
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {view === 'template' ? (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Select a starting template</h2>
                <p className="text-sm text-muted-foreground">
                  Choose a baseline profile for common PKI use cases, or start blank.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {templateMetadata.map(({ id, title, description, icon: Icon }) => {
                  const isActive = selectedTemplateId === id;

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleTemplateSelect(id)}
                      className="text-left"
                    >
                      <Card
                        className={`h-full border transition-all hover:border-primary/50 hover:shadow-md ${
                          isActive ? 'border-primary ring-1 ring-primary/30' : ''
                        }`}
                      >
                        <CardHeader className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="rounded-md bg-muted p-2">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <CardTitle className="text-base">{title}</CardTitle>
                            </div>
                            {isActive ? <Badge variant="default">Selected</Badge> : null}
                          </div>
                          <CardDescription className="text-xs">{description}</CardDescription>
                        </CardHeader>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <SplitPanelLayout
              isPanelOpen
              panelWidthClassName="xl:grid-cols-[minmax(0,1fr)_300px]"
              panel={
                <Card className="h-fit xl:sticky xl:top-6">
                  <CardHeader>
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
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Profile Configuration</CardTitle>
                      <CardDescription>
                        Define rules for certificate issuance, subject handling, and key policy.
                      </CardDescription>
                    </div>
                    <Button type="button" variant="ghost" onClick={() => setView('template')}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Change Template
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <SigningProfileForm form={form} />
                </CardContent>
                <CardFooter className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => router.push('/signing-profiles')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="min-w-36">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create Profile
                  </Button>
                </CardFooter>
              </Card>
            </SplitPanelLayout>
          )}
        </form>
      </Form>
    </div>
  );
}
