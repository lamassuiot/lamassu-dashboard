
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Scale } from "lucide-react";
import { sileo } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription as AlertDescUI, AlertTitle as AlertTitleUI } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  fetchSigningProfileById,
  updateSigningProfile,
  type CreateSigningProfilePayload,
  type ApiSigningProfile,
} from '@/lib/ca-data';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { SigningProfileForm, signingProfileSchema, type SigningProfileFormValues } from '@/components/shared/SigningProfileForm';
import { Form } from '@/components/ui/form';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';

const getValidityLabel = (profile: ApiSigningProfile) => {
  if (!profile.validity) return 'Not specified';

  switch (profile.validity.type) {
    case 'Duration':
      return profile.validity.duration || 'Not specified';
    case 'Date':
      if (profile.validity.time?.startsWith('9999-12-31')) {
        return 'Never expires';
      }
      return profile.validity.time ? new Date(profile.validity.time).toLocaleDateString() : 'Not specified';
    case 'Indefinite':
      return 'Never expires';
    default:
      return 'Not specified';
  }
};

export default function EditSigningProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileId = searchParams.get('id');
  const isEditMode = !!profileId;

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
        sileo.error({ title: "Error", description: "Authentication token or Profile ID is missing." });
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
        await updateSigningProfile(profileId, payload, user.access_token);
        sileo.success({ title: "Profile Updated", description: `Issuance Profile "${data.profileName}" has been successfully updated.` });
        navigate('/signing-profiles');
    } catch (error: any) {
        sileo.error({ title: `Update Failed`, description: error.message });
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
        <Button variant="outline" onClick={() => navigate('/signing-profiles')}>
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

  const keyPolicyLabel = profileData
    ? [
        profileData.crypto_enforcement?.allow_rsa_keys ? 'RSA' : null,
        profileData.crypto_enforcement?.allow_ecdsa_keys ? 'ECDSA' : null,
      ].filter(Boolean).join(', ') || 'Open'
    : 'N/A';

  const summaryCards = profileData ? [
    {
      label: 'Validity',
      value: getValidityLabel(profileData),
      hint: 'Default certificate lifetime',
    },
    {
      label: 'Scope',
      value: profileData.sign_as_ca ? 'CA' : 'Leaf',
      hint: profileData.sign_as_ca ? 'Can issue subordinate authorities' : 'Issues end-entity certificates',
    },
    {
      label: 'Subject',
      value: profileData.honor_subject ? 'CSR' : 'Override',
      hint: profileData.honor_subject ? 'Uses requester subject fields' : 'Uses configured subject fields',
    },
    {
      label: 'Key Policy',
      value: keyPolicyLabel,
      hint: profileData.crypto_enforcement?.enabled ? 'Restricted algorithms' : 'No crypto enforcement',
    },
  ] : [];

  return (
    <div className="mb-8 w-full space-y-6">
      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Issuance Profiles', href: '/signing-profiles' },
          {
            label: (
              <Badge variant="default" className="text-xs">
                {profileData?.name || 'Edit'}
              </Badge>
            ),
          },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate('/signing-profiles')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Issuance Profiles
          </Button>
        }
      />

      {profileData ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="h-1 w-full bg-primary" />
          <div className="px-6 py-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Editing
                  </div>
                  <Badge variant="outline">{profileData.sign_as_ca ? 'CA Signing' : 'Leaf Certificates'}</Badge>
                  {profileData.crypto_enforcement?.enabled ? <Badge variant="outline">Crypto Enforcement</Badge> : null}
                  <Badge variant="secondary">{profileData.honor_subject ? 'CSR Subject' : 'Subject Override'}</Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-background text-primary">
                      <Scale className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Edit Issuance Profile</h1>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          Modify the parameters for this certificate issuance profile.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{profileData.name}</p>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                          {profileData.description || 'No description provided.'}
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4 xl:min-w-[640px]">
                {summaryCards.map((item) => (
                  <div key={item.label}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="space-y-6">
            {profileData ? (
              <SigningProfileForm form={form} sectionAsCards />
            ) : (
              <Card className="overflow-hidden rounded-xl shadow-sm">
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">No profile data to display.</p>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => navigate('/signing-profiles')}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !profileData} className="min-w-36">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
