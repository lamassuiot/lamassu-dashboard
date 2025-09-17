
'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { Settings2, BookText, PlusCircle, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiSigningProfile, CreateSigningProfilePayload } from '@/lib/ca-data';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSigningProfile } from '@/lib/ca-data';
import { Form } from '../ui/form';
import { signingProfileSchema, type SigningProfileFormValues, defaultFormValues } from './SigningProfileForm';
import { SigningProfileForm } from './SigningProfileForm';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { KEY_USAGE_OPTIONS, EKU_OPTIONS } from '@/lib/form-options';
import { Alert } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { ExpirationInput, type ExpirationConfig } from './ExpirationInput';


export type ProfileMode = 'reuse' | 'inline' | 'create';

interface SigningProfileSelectorProps {
  profileMode: ProfileMode;
  onProfileModeChange: (mode: ProfileMode) => void;
  availableProfiles: ApiSigningProfile[];
  isLoadingProfiles: boolean;
  selectedProfileId: string | null;
  onProfileIdChange: (id: string | null) => void;
  
  // Props for inline mode
  inlineModeEnabled?: boolean;
  validity?: ExpirationConfig;
  onValidityChange?: (config: ExpirationConfig) => void;
  validityWarning?: string | null;
  keyUsages?: string[];
  onKeyUsageChange?: (usage: string, checked: boolean) => void;
  extendedKeyUsages?: string[];
  onExtendedKeyUsageChange?: (usage: string, checked: boolean) => void;

  createModeEnabled?: boolean;
  onProfileCreated?: (newProfile: ApiSigningProfile) => void;
}


export const SigningProfileSelector: React.FC<SigningProfileSelectorProps> = ({
  profileMode,
  onProfileModeChange,
  availableProfiles,
  isLoadingProfiles,
  selectedProfileId,
  onProfileIdChange,
  inlineModeEnabled = false,
  validity,
  onValidityChange,
  validityWarning,
  keyUsages,
  onKeyUsageChange,
  extendedKeyUsages,
  onExtendedKeyUsageChange,
  createModeEnabled = true,
  onProfileCreated,
}) => {
    
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
    defaultValues: defaultFormValues,
  });

  async function handleProfileCreationSubmit(data: SigningProfileFormValues, event?: React.BaseSyntheticEvent) {
    // Prevent default form submission behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!user?.access_token) {
        toast({ title: "Error", description: "Authentication token is missing.", variant: "destructive" });
        return;
    }
    
    setIsSubmitting(true);

    let validityPayload: { type: "Duration" | "Date"; duration?: string; time?: string } = { type: 'Duration', duration: '1y' };
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
        honor_extensions: true,
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
        const newProfile = await createSigningProfile(payload, user.access_token);
        toast({ title: "Profile Created", description: `Issuance Profile "${data.profileName}" has been successfully created.` });
        onProfileCreated?.(newProfile); // Callback to parent
    } catch (error: any) {
        toast({ title: `Creation Failed`, description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }


  const selectedProfile = React.useMemo(() => {
    if (profileMode === 'reuse' && selectedProfileId) {
      return availableProfiles.find(p => p.id === selectedProfileId);
    }
    return null;
  }, [profileMode, selectedProfileId, availableProfiles]);

  const cardClass = (mode: ProfileMode) => cn(
    "cursor-pointer transition-all duration-200 hover:shadow-md border-2",
    profileMode === mode 
      ? "border-primary bg-primary/5 shadow-sm" 
      : "border-border hover:border-primary/50"
  );
  
  const iconWrapperClass = (mode: ProfileMode) => cn(
    "p-2 rounded-lg",
    profileMode === mode 
      ? "bg-primary text-primary-foreground" 
      : "bg-muted text-muted-foreground"
  );

  const gridColsClass = [inlineModeEnabled, createModeEnabled].filter(Boolean).length + 1 >= 3 
    ? 'md:grid-cols-3' 
    : 'md:grid-cols-2';


  if (profileMode === 'create' && createModeEnabled) {
    return (
        <div className="pt-4 mt-4 border-t">
           <div className="flex justify-between items-center mb-4">
              <Label>Create New Reusable Profile</Label>
              <Button type="button" variant="ghost" onClick={() => onProfileModeChange('reuse')}>
                  <ArrowLeft className="mr-2 h-4 w-4"/> Back to Selection
              </Button>
           </div>
           <Form {...form}>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit(handleProfileCreationSubmit)(e);
                }} 
                className="space-y-4"
              >
                <SigningProfileForm form={form} />
                <div className="flex justify-end">
                    <Button 
                      type="button" 
                      disabled={isSubmitting}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        form.handleSubmit(handleProfileCreationSubmit)();
                      }}
                    >
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                      Create and Select Profile
                    </Button>
                </div>
              </form>
            </Form>
       </div>
    );
  }

  return (
    <div className="space-y-4">
      <Label>Profile Mode</Label>
      <div className={cn("grid grid-cols-1 gap-4", gridColsClass)}>
        <Card className={cardClass('reuse')} onClick={() => onProfileModeChange('reuse')}>
          <CardHeader ><div className="flex items-center space-x-3"><div className={iconWrapperClass('reuse')}><BookText className="h-5 w-5" /></div><div><CardTitle className="text-base">Reuse Existing Profile</CardTitle><CardDescription className="text-sm">Use predefined issuance templates</CardDescription></div></div></CardHeader>
        </Card>
        {inlineModeEnabled && (
            <Card className={cardClass('inline')} onClick={() => onProfileModeChange('inline')}>
              <CardHeader ><div className="flex items-center space-x-3"><div className={iconWrapperClass('inline')}><Settings2 className="h-5 w-5" /></div><div><CardTitle className="text-base">Inline Profile</CardTitle><CardDescription className="text-sm">Define a one-time issuance policy</CardDescription></div></div></CardHeader>
            </Card>
        )}
        {createModeEnabled && (
            <Card className={cardClass('create')} onClick={() => onProfileModeChange('create')}>
              <CardHeader ><div className="flex items-center space-x-3"><div className={iconWrapperClass('create')}><PlusCircle className="h-5 w-5" /></div><div><CardTitle className="text-base">Create New Profile</CardTitle><CardDescription className="text-sm">Create a new reusable profile</CardDescription></div></div></CardHeader>
            </Card>
        )}
      </div>

      {profileMode === 'reuse' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-select">Issuance Profile</Label>
            {isLoadingProfiles ? ( <Skeleton className="h-10 w-full md:w-1/2" /> ) : (
              <Select value={selectedProfileId || ''} onValueChange={(v) => onProfileIdChange(v)}>
                <SelectTrigger id="profile-select" className="w-full md:w-1/2"><SelectValue placeholder="Select a profile..." /></SelectTrigger>
                <SelectContent>
                  {availableProfiles.length > 0 ? ( availableProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>) ) : ( <SelectItem value="none" disabled>No profiles available</SelectItem> )}
                </SelectContent>
              </Select>
            )}
          </div>
          {selectedProfile && (
            <div className="pt-2"><IssuanceProfileCard profile={selectedProfile} /></div>
          )}
        </div>
      )}

      {profileMode === 'inline' && inlineModeEnabled && validity && onValidityChange && onKeyUsageChange && onExtendedKeyUsageChange && keyUsages && extendedKeyUsages && (
          <div className="pt-4 mt-4 border-t space-y-4">
                <ExpirationInput
                    idPrefix="inline-validity"
                    label="Certificate Validity"
                    value={validity}
                    onValueChange={onValidityChange}
                />
                {validityWarning && <Alert variant="warning"><AlertTriangle className="h-4 w-4"/><CardDescription>{validityWarning}</CardDescription></Alert>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Key Usages</Label>
                        <div className="p-3 border rounded-md mt-1 space-y-2">
                            {KEY_USAGE_OPTIONS.map(usage => (
                                <div key={usage.id} className="flex items-center space-x-2">
                                    <Checkbox id={`inline-ku-${usage.id}`} checked={keyUsages.includes(usage.id)} onCheckedChange={(c) => onKeyUsageChange(usage.id, !!c)} />
                                    <Label htmlFor={`inline-ku-${usage.id}`} className="font-normal">{usage.label}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                     <div>
                        <Label>Extended Key Usages</Label>
                        <div className="p-3 border rounded-md mt-1 space-y-2">
                             {EKU_OPTIONS.map(eku => (
                                <div key={eku.id} className="flex items-center space-x-2">
                                    <Checkbox id={`inline-eku-${eku.id}`} checked={extendedKeyUsages.includes(eku.id)} onCheckedChange={(c) => onExtendedKeyUsageChange(eku.id, !!c)} />
                                    <Label htmlFor={`inline-eku-${eku.id}`} className="font-normal">{eku.label}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
          </div>
      )}
    </div>
  );
};
