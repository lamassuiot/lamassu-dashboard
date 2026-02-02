
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
  const [initialFormValues, setInitialFormValues] = useState<SigningProfileFormValues | null>(defaultFormValues);
  
  const form = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
    values: initialFormValues || defaultFormValues, // Use values to re-initialize on template selection
  });

  async function handleSubmit(data: SigningProfileFormValues) {
    if (!user?.access_token) {
        toast({ title: "Error", description: "Authentication token is missing.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);

    let validityPayload: { type: string; duration?: string; time?: string } = { type: 'Duration', duration: '1y' };
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
        validity: validityPayload as { type: "Duration" | "Date"; duration?: string; time?: string },
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
    setInitialFormValues(newInitialValues);
    form.reset(newInitialValues); // Explicitly reset the form with new values
    setView('form');
  };

  return (
    <div className="w-full space-y-6 mb-8">
      <Button variant="outline" onClick={() => router.push('/signing-profiles')} className="mb-0">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Issuance Profiles
      </Button>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <Card className="shadow-lg">
              <CardHeader>
              <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                  <PlusCircle className="h-7 w-7 text-primary" />
                  <CardTitle className="text-xl font-headline">Create Issuance Profile</CardTitle>
                  </div>
                  {view === 'form' && (
                  <Button variant="ghost" onClick={() => setView('template')}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back to Templates
                  </Button>
                  )}
              </div>
              <CardDescription>
                  {view === 'template' ? 'Select a template to start with or begin with a blank slate.' : 
                  'Define the parameters for the new certificate issuance profile.'}
              </CardDescription>
              </CardHeader>
              <CardContent>
                  {view === 'template' ? (
                      <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {templateMetadata.map(({ id, title, description, icon: Icon }) => (
                                  <Card key={id} className="hover:shadow-md hover:border-primary/50 transition-shadow cursor-pointer flex flex-col" onClick={() => handleTemplateSelect(id)}>
                                      <CardHeader className="flex-grow">
                                          <div className="flex items-center space-x-3 mb-2">
                                              <div className="p-2 bg-muted rounded-md"><Icon className="h-6 w-6 text-primary"/></div>
                                              <h3 className="font-semibold">{title}</h3>
                                          </div>
                                          <p className="text-xs text-muted-foreground">{description}</p>
                                      </CardHeader>
                                  </Card>
                              ))}
                          </div>
                      </div>
                  ) : (
                      <SigningProfileForm form={form} />
                  )}
              </CardContent>
              {view === 'form' && (
                      <CardFooter>
                      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto ml-auto">
                          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                          Create Profile
                      </Button>
                  </CardFooter>
              )}
          </Card>
        </form>
      </Form>
    </div>
  );
}
