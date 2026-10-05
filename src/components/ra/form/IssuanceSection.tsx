'use client';

import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { ChevronsUpDown, Loader2 } from 'lucide-react';

import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { SigningProfileForm, type SigningProfileFormValues } from '@/components/shared/SigningProfileForm';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ApiSigningProfile } from '@/lib/ca-data';
import { withDefaultValidationCa } from '@/lib/dms-form';
import type { IssuanceProfileMode } from '@/lib/ra-form';
import { ChoiceList, RaFieldGroup, RaFormSection } from './RaFormSection';
import { fieldError, listedIssues, type RaSectionProps } from './types';

const profileModeOptions = [
  { value: 'default' as const, label: 'Enrollment CA default', description: "Resolve the CA's current default profile each time a certificate is issued." },
  { value: 'existing' as const, label: 'Existing profile', description: 'Pin a reusable issuance profile to this RA.' },
  { value: 'inline' as const, label: 'Custom profile', description: 'Define a profile stored only on this RA.' },
];

interface IssuanceSectionProps extends RaSectionProps {
  inlineProfileForm: UseFormReturn<SigningProfileFormValues>;
  enrollmentCaDefaultProfile?: ApiSigningProfile;
}

export function IssuanceSection({ values, update, issues, touch, deps, inlineProfileForm, enrollmentCaDefaultProfile }: IssuanceSectionProps) {
  const [isCaModalOpen, setIsCaModalOpen] = useState(false);
  const enrollmentCa = values.enrollmentCaId ? deps.casById.get(values.enrollmentCaId) : undefined;
  const selectedProfile = deps.profiles.find(profile => profile.id === values.issuanceProfileId);
  const caError = fieldError(issues, 'enrollmentCa');
  const profileError = fieldError(issues, 'issuanceProfileId');

  return (
    <RaFormSection
      id="issuance"
      title="Certificate issuance"
      description="Which CA signs device certificates, and with which profile."
      issues={listedIssues(issues, ['enrollmentCa', 'issuanceProfileId'])}
    >
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <Label htmlFor="enrollmentCa">Enrollment CA</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Signs every certificate issued through this RA.</p>
          </div>
          {enrollmentCa && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsCaModalOpen(true)}>Change</Button>
          )}
        </div>
        {enrollmentCa ? (
          <CaVisualizerCard ca={enrollmentCa} allCryptoEngines={deps.cryptoEngines} className="border-border shadow-none" />
        ) : (
          <button
            id="enrollmentCa"
            type="button"
            disabled={deps.isLoading}
            onClick={() => setIsCaModalOpen(true)}
            aria-describedby={caError ? 'enrollmentCa-error' : undefined}
            className={cn(
              'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-wait',
              caError && 'border-destructive ring-3 ring-destructive/20',
            )}
          >
            <span className="flex items-center gap-2 truncate">
              {deps.isLoading && <Loader2 className="size-4 animate-spin" />}
              {deps.isLoading
                ? 'Loading CAs…'
                : values.enrollmentCaId ? `CA "${values.enrollmentCaId}" not found, select another…` : 'Select Enrollment CA…'}
            </span>
            <ChevronsUpDown className="size-4 shrink-0" />
          </button>
        )}
        {caError && <FormFieldError id="enrollmentCa-error" title={caError} />}
      </div>

      <RaFieldGroup title="Issuance profile">
        <ChoiceList<IssuanceProfileMode>
          name="issuanceProfileMode"
          value={values.issuanceProfileMode}
          onChange={mode => update({ issuanceProfileMode: mode, ...(mode !== 'existing' && { issuanceProfileId: null }) })}
          options={profileModeOptions}
        />

        {values.issuanceProfileMode === 'default' && (
          enrollmentCaDefaultProfile
            ? <IssuanceProfileCard profile={enrollmentCaDefaultProfile} />
            : (
              <p className="text-sm text-muted-foreground">
                {enrollmentCa ? 'This CA has no default profile yet.' : 'Select an Enrollment CA to preview its default profile.'}
              </p>
            )
        )}

        {values.issuanceProfileMode === 'existing' && (
          <div className="space-y-3">
            <Select
              value={values.issuanceProfileId ?? ''}
              onValueChange={id => {
                touch('issuanceProfileId');
                update({ issuanceProfileId: id });
              }}
            >
              <SelectTrigger aria-label="Issuance profile" aria-invalid={!!profileError} aria-describedby={profileError ? 'issuanceProfile-error' : undefined}>
                <SelectValue placeholder="Select an issuance profile…" />
              </SelectTrigger>
              <SelectContent>
                {deps.profiles.map(profile => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {profileError && <FormFieldError id="issuanceProfile-error" title={profileError} />}
            {selectedProfile && <IssuanceProfileCard profile={selectedProfile} />}
          </div>
        )}

        {values.issuanceProfileMode === 'inline' && (
          <Form {...inlineProfileForm}>
            <div className="border-l-2 pl-4">
              <SigningProfileForm form={inlineProfileForm} compact hideBasicInformation />
            </div>
          </Form>
        )}
      </RaFieldGroup>

      <CaSelectorModal
        isOpen={isCaModalOpen}
        onOpenChange={setIsCaModalOpen}
        title="Select Enrollment CA"
        description="Choose the CA that will issue device certificates."
        availableCAs={deps.cas}
        isLoadingCAs={deps.isLoading}
        errorCAs={deps.error}
        loadCAsAction={deps.reload}
        allCryptoEngines={deps.cryptoEngines}
        currentSelectedCaId={values.enrollmentCaId}
        onCaSelected={ca => {
          // Devices re-enroll with the certificate this CA issues, so trust it for re-enrollment by default.
          update({
            enrollmentCaId: ca.id,
            additionalValidationCaIds: values.additionalValidationCaIds.includes(ca.id)
              ? values.additionalValidationCaIds
              : [...values.additionalValidationCaIds, ca.id],
            reenrollmentAuth: withDefaultValidationCa(values.reenrollmentAuth, ca.id),
          });
          setIsCaModalOpen(false);
        }}
      />
    </RaFormSection>
  );
}
