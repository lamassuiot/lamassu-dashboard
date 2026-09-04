
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { sileo } from '@/lib/toast';
import { Alert, AlertDescription as AlertDescUI, AlertTitle as AlertTitleUI } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Scale } from 'lucide-react';
import {
  fetchSigningProfileById,
  updateSigningProfile,
  type CreateSigningProfilePayload,
  type ApiSigningProfile,
} from '@/lib/ca-data';
import { SigningProfileForm, signingProfileSchema, type SigningProfileFormValues } from '@/components/shared/SigningProfileForm';
import { Form } from '@/components/ui/form';
import { SplitPanelLayout } from '@/components/shared/SplitPanelLayout';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

const getValidityLabel = (profile: ApiSigningProfile) => {
  if (!profile.validity) return 'Not specified';
  switch (profile.validity.type) {
    case 'Duration': return profile.validity.duration || 'Not specified';
    case 'Date':
      if (profile.validity.time?.startsWith('9999-12-31')) return 'Never expires';
      return profile.validity.time ? new Date(profile.validity.time).toLocaleDateString() : 'Not specified';
    case 'Indefinite': return 'Never expires';
    default: return 'Not specified';
  }
};

export default function EditSigningProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = searchParams.get('id');
  const isEditMode = !!profileId;

  const [profileData, setProfileData] = useState<ApiSigningProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(isEditMode);
  const [errorProfile, setErrorProfile] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
  });

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
      } else if (type === 'Indefinite') {
        validityConfig = { type: 'Indefinite' };
      }
    }
    return {
      profileName: profile.name || '',
      description: profile.description || '',
      validity: validityConfig,
      signAsCa: profile.sign_as_ca || false,
      honorSubject: profile.honor_subject,
      overrideCommonName: profile.subject?.common_name || '',
      overrideCountry: profile.subject?.country || '',
      overrideState: profile.subject?.state || '',
      overrideLocality: profile.subject?.locality || '',
      overrideOrganization: profile.subject?.organization || '',
      overrideOrgUnit: profile.subject?.organization_unit || '',
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
      extraExtendedKeyUsageOids: profile.extra_extended_key_usage_oids || [],
      honorExtensions: profile.honor_extensions,
    };
  };

  const fetchProfile = useCallback(async () => {
    if (!profileId) {
      if (isEditMode) setErrorProfile('Profile ID is missing.');
      setIsLoadingProfile(false);
      return;
    }
    setIsLoadingProfile(true);
    try {
      const data = await fetchSigningProfileById(profileId);
      setProfileData(data);
      form.reset(mapApiProfileToFormValues(data));
      setErrorProfile(null);
    } catch (error: any) {
      setErrorProfile(error.message);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [profileId, isEditMode, form]);

  useEffect(() => {
    if (isEditMode) fetchProfile();
    else setErrorProfile('No Profile ID was provided. This page is for editing existing profiles.');
  }, [fetchProfile, isEditMode]);

  async function handleSubmit(data: SigningProfileFormValues) {
    if (!profileId) {
      sileo.error({ title: 'Error', description: 'Profile ID is missing.' });
      return;
    }
    setIsSubmitting(true);

    let validityPayload: CreateSigningProfilePayload['validity'] = { type: 'Duration', duration: '1y' };
    if (data.validity.type === 'Duration' && data.validity.durationValue) {
      validityPayload = { type: 'Duration', duration: data.validity.durationValue };
    } else if (data.validity.type === 'Date' && data.validity.dateValue) {
      validityPayload = { type: 'Date', time: data.validity.dateValue.toISOString() };
    } else if (data.validity.type === 'Indefinite') {
      validityPayload = { type: 'Date', time: '9999-12-31T23:59:59.999Z' };
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
      extra_extended_key_usage_oids: data.extraExtendedKeyUsageOids || [],
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
      };
    }

    try {
      await updateSigningProfile(profileId, payload);
      sileo.success({ title: 'Profile Updated', description: `Issuance Profile "${data.profileName}" has been successfully updated.` });
      router.push('/signing-profiles');
    } catch (error: any) {
      sileo.error({ title: 'Update Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        Loading profile data...
      </div>
    );
  }

  if (errorProfile) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="-ml-2 w-fit text-muted-foreground hover:text-foreground" onClick={() => router.push('/signing-profiles')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Issuance Profiles
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitleUI>Error Loading Profile</AlertTitleUI>
          <AlertDescUI>{errorProfile}</AlertDescUI>
        </Alert>
      </div>
    );
  }

  const keyPolicyLabel = profileData
    ? [
        profileData.crypto_enforcement?.allow_rsa_keys ? 'RSA' : null,
        profileData.crypto_enforcement?.allow_ecdsa_keys ? 'ECDSA' : null,
      ].filter(Boolean).join(', ') || 'Open'
    : 'N/A';

  return (
    <BreadcrumbPage items={[{label:'Home',href:'/'},{label:'Issuance Profiles',href:'/signing-profiles'},{label:'Edit'}]} className="mb-8 w-full space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <SplitPanelLayout
            isPanelOpen
            panelWidthClassName="xl:grid-cols-[minmax(0,1fr)_300px]"
            panel={
              <Card className="h-fit overflow-hidden rounded-xl shadow-sm xl:sticky xl:top-6">
                <CardHeader className="border-b py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <Scale className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{profileData?.name}</CardTitle>
                      {profileData?.description && (
                        <CardDescription className="mt-0.5">{profileData.description}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Validity', value: profileData ? getValidityLabel(profileData) : '—' },
                      { label: 'Scope', value: profileData?.sign_as_ca ? 'CA' : 'Leaf' },
                      { label: 'Subject', value: profileData?.honor_subject ? 'CSR' : 'Override' },
                      { label: 'Key Policy', value: keyPolicyLabel },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-medium">{value}</p>
                      </div>
                    ))}
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
                <Button type="button" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => router.push('/signing-profiles')}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Issuance Profiles
                </Button>
              </div>
              <div className="pb-8 border-b">
                <h1 className="text-2xl font-bold">Edit Profile</h1>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                  Modify rules for certificate issuance, subject handling, and key policy.
                </p>
              </div>

              <SigningProfileForm form={form} />

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => router.push('/signing-profiles')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !profileData} className="min-w-36">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          </SplitPanelLayout>
        </form>
      </Form>
    </BreadcrumbPage>
  );
}
