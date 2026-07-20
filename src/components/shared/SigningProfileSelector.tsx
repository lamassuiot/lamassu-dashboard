
'use client';

import React, { useState } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { Settings2, BookText, PlusCircle, ArrowLeft } from 'lucide-react';
import { CardSelector } from '@/components/shared/CardSelector';
import type { ApiSigningProfile, CreateSigningProfilePayload } from '@/lib/ca-data';
import { sileo } from '@/lib/toast';
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
  honorSubject?: boolean;
  onHonorSubjectChange?: (checked: boolean) => void;
  
  // Custom subject fields (when honorSubject is false)
  customSubjectCN?: string;
  customSubjectO?: string;
  customSubjectOU?: string;
  customSubjectC?: string;
  customSubjectST?: string;
  customSubjectL?: string;
  onCustomSubjectChange?: (field: string, value: string) => void;

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
  honorSubject,
  onHonorSubjectChange,
  customSubjectCN,
  customSubjectO,
  customSubjectOU,
  customSubjectC,
  customSubjectST,
  customSubjectL,
  onCustomSubjectChange,
  createModeEnabled = true,
  onProfileCreated,
}) => {
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
            common_name: data.overrideCommonName,
            country: data.overrideCountry,
            state: data.overrideState,
            locality: data.overrideLocality,
            organization: data.overrideOrganization,
            organization_unit: data.overrideOrgUnit,
        }
    }

    try {
        const newProfile = await createSigningProfile(payload);
        sileo.success({ title: "Profile Created", description: `Issuance Profile "${data.profileName}" has been successfully created.` });
        onProfileCreated?.(newProfile); // Callback to parent
    } catch (error: any) {
        sileo.error({ title: `Creation Failed`, description: error.message });
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
              <div className="space-y-4">
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
              </div>
            </Form>
       </div>
    );
  }

  const profileOptions = [
    { value: 'reuse' as ProfileMode, label: 'Reuse Existing', description: 'Use predefined issuance templates', icon: BookText },
    ...(inlineModeEnabled ? [{ value: 'inline' as ProfileMode, label: 'Inline Profile', description: 'Define a one-time issuance policy', icon: Settings2 }] : []),
    ...(createModeEnabled ? [{ value: 'create' as ProfileMode, label: 'Create New', description: 'Create a new reusable profile', icon: PlusCircle }] : []),
  ];

  return (
    <div className="space-y-4">
      <CardSelector
        label="Profile Mode"
        value={profileMode}
        onChange={onProfileModeChange}
        options={profileOptions}
        columns={profileOptions.length}
      />

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
                {validityWarning && <Alert variant="warning"><AlertTriangle className="h-4 w-4"/><p className="text-sm text-muted-foreground">{validityWarning}</p></Alert>}
                
                {onHonorSubjectChange !== undefined && honorSubject !== undefined && (
                  <div className="space-y-3 p-3 bg-muted/30 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <Label htmlFor="honor-subject" className="font-medium">Use Subject from CSR</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          When enabled, the certificate will use the subject from the CSR.
                        </p>
                      </div>
                      <Switch
                        id="honor-subject"
                        checked={honorSubject}
                        onCheckedChange={onHonorSubjectChange}
                      />
                    </div>
                    
                    {!honorSubject && onCustomSubjectChange && (
                      <div className="space-y-3 pt-3 border-t">
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Custom Subject Fields</h4>
                          <p className="text-xs text-muted-foreground">Override the subject from the CSR with custom values</p>
                        </div>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label htmlFor="custom-cn">Common Name (CN) *</Label>
                            <Input
                              id="custom-cn"
                              value={customSubjectCN || ''}
                              onChange={(e) => onCustomSubjectChange('CN', e.target.value)}
                              placeholder="e.g., example.com"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="custom-ou">Organizational Unit (OU)</Label>
                              <Input
                                id="custom-ou"
                                value={customSubjectOU || ''}
                                onChange={(e) => onCustomSubjectChange('OU', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="custom-o">Organization (O)</Label>
                              <Input
                                id="custom-o"
                                value={customSubjectO || ''}
                                onChange={(e) => onCustomSubjectChange('O', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="custom-l">Locality (L)</Label>
                              <Input
                                id="custom-l"
                                value={customSubjectL || ''}
                                onChange={(e) => onCustomSubjectChange('L', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="custom-st">State/Province (ST)</Label>
                              <Input
                                id="custom-st"
                                value={customSubjectST || ''}
                                onChange={(e) => onCustomSubjectChange('ST', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="custom-c">Country (C)</Label>
                              <Input
                                id="custom-c"
                                value={customSubjectC || ''}
                                onChange={(e) => onCustomSubjectChange('C', e.target.value)}
                                placeholder="e.g., US"
                                maxLength={2}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
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
