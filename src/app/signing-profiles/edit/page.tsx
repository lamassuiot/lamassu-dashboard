
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Edit } from "lucide-react"; 
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription as AlertDescUI, AlertTitle as AlertTitleUI } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  fetchSigningProfileById,
  updateSigningProfile,
  type CreateSigningProfilePayload,
  type ApiSigningProfile,
} from '@/lib/ca-data';
import { SigningProfileForm, signingProfileSchema, type SigningProfileFormValues } from '@/components/shared/SigningProfileForm';
import { Form } from '@/components/ui/form';


export default function EditSigningProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = searchParams.get('id');
  const isEditMode = !!profileId;

  const { toast } = useToast();
  const { user } = useAuth();
  
  const [profileData, setProfileData] = useState<ApiSigningProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(isEditMode);
  const [errorProfile, setErrorProfile] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
  });
  
  const fetchProfile = useCallback(async () => {
    if (!profileId || !user?.access_token) {
        if (isEditMode) setErrorProfile('Profile ID or user token is missing.');
        setIsLoadingProfile(false);
        return;
    }
    setIsLoadingProfile(true);
    try {
        const data = await fetchSigningProfileById(profileId, user.access_token);
        setProfileData(data);
        form.reset(mapApiProfileToFormValues(data)); // Reset form with fetched data
        setErrorProfile(null);
    } catch (error: any) {
        setErrorProfile(error.message);
    } finally {
        setIsLoadingProfile(false);
    }
  }, [profileId, user?.access_token, isEditMode, form]);

  useEffect(() => {
    if (isEditMode && user?.access_token) {
        fetchProfile();
    } else if (!isEditMode) {
        setErrorProfile("No Profile ID was provided. This page is for editing existing profiles.");
    }
  }, [user?.access_token, fetchProfile, isEditMode]);
  

  type ExpirationConfig = { type: 'Duration'; durationValue: string } | { type: 'Date'; dateValue: Date } | { type: 'Indefinite' };

  const mapApiProfileToFormValues = (profile: ApiSigningProfile): SigningProfileFormValues => {
    const crypto = profile.crypto_enforcement || {};
    
    let validityConfig: ExpirationConfig = { type: 'Duration', durationValue: '1y' };
    if (profile.validity) {
        const type = profile.validity.type;
        if (type === 'Duration' && profile.validity.duration) {
            validityConfig = { type: 'Duration', durationValue: profile.validity.duration };
        } else if (type === 'Date' && profile.validity.time) {
            if (profile.validity.time.startsWith('9999-12-31')) {
                validityConfig = { type: 'Indefinite' };
            } else {
                validityConfig = { type: 'Date', dateValue: new Date(profile.validity.time) };
            }
        } else if (type === "Indefinite") {
            validityConfig = { type: 'Indefinite' };
        }
    }
    
    return {
        profileName: profile.name || '',
        description: profile.description || '',
        validity: validityConfig,
        signAsCa: profile.sign_as_ca || false,
        honorSubject: profile.honor_subject,
        overrideCountry: profile.subject?.country || '',
        overrideState: profile.subject?.state || '',
        overrideOrganization: profile.subject?.organization || '',
        overrideOrgUnit: profile.subject?.organizational_unit || '',
        cryptoEnforcement: {
            enabled: crypto.enabled || false,
            allowRsa: crypto.allow_rsa_keys || false,
            allowEcdsa: crypto.allow_ecdsa_keys || false,
            allowedRsaKeySizes: crypto.allowed_rsa_key_sizes || [],
            allowedEcdsaCurves: crypto.allowed_ecdsa_key_sizes || [],
        },
        honorKeyUsage: profile.honor_key_usage,
        keyUsages: (profile.key_usage || []) as any[],
        honorExtendedKeyUsages: profile.honor_extended_key_usages,
        extendedKeyUsages: (profile.extended_key_usages || []) as any[],
        honorExtensions: profile.honor_extensions,
    };
  };

  async function handleSubmit(data: SigningProfileFormValues) {
    if (!user?.access_token || !profileId) {
        toast({ title: "Error", description: "Authentication token or Profile ID is missing.", variant: "destructive" });
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
        await updateSigningProfile(profileId, payload, user.access_token);
        toast({ title: "Profile Updated", description: `Issuance Profile "${data.profileName}" has been successfully updated.` });
        router.push('/signing-profiles');
    } catch (error: any) {
        toast({ title: `Update Failed`, description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2"/> 
        Loading profile data...
      </div>
    );
  }

  if (errorProfile) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.push('/signing-profiles')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Issuance Profiles
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitleUI>Error Loading Profile</AlertTitleUI>
          <AlertDescUI>{errorProfile}</AlertDescUI>
        </Alert>
      </div>
    );
  }

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
                  <Edit className="h-7 w-7 text-primary" />
                  <CardTitle className="text-xl font-headline">Edit Issuance Profile</CardTitle>
                  </div>
              </div>
              <CardDescription>
                  Modify the parameters for this certificate issuance profile.
              </CardDescription>
              </CardHeader>
              <CardContent>
                  {profileData ? (
                      <SigningProfileForm form={form} />
                  ) : (
                      <p className="text-muted-foreground text-center">No profile data to display.</p>
                  )}
              </CardContent>
              <CardFooter>
                  <Button type="submit" disabled={isSubmitting || !profileData} className="w-full sm:w-auto ml-auto">
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                      Save Changes
                  </Button>
              </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
