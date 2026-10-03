'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Save } from 'lucide-react';

import { DeviceIconSelectorModal } from '@/components/shared/DeviceIconSelectorModal';
import { getFormErrorMessages } from '@/components/shared/FormValidationSummary';
import {
  defaultFormValues,
  signingProfileSchema,
  type SigningProfileFormValues,
} from '@/components/shared/SigningProfileForm';
import type { CertificateValidity } from '@/components/ra/RenewalLifespanBar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { fetchAndProcessCAs, fetchSigningProfiles, type ApiSigningProfile, type CA } from '@/lib/ca-data';
import { createOrUpdateRa, fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { buildInlineIssuanceProfile, mapIssuanceProfileToFormValues } from '@/lib/dms-form';
import { fetchCryptoEngines } from '@/lib/kms-data';
import {
  buildRaPayload,
  createDefaultRaFormValues,
  isIssueVisible,
  raFormValuesFromApi,
  validateRaForm,
  type RaFormField,
  type RaFormIssue,
  type RaFormSectionId,
  type RaFormValues,
} from '@/lib/ra-form';
import { useRouter } from '@/lib/router';
import { sileo } from '@/lib/toast';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { cn } from '@/lib/utils';
import { DevicesSection } from './DevicesSection';
import { DistributionSection } from './DistributionSection';
import { EnrollmentSection } from './EnrollmentSection';
import { IdentitySection } from './IdentitySection';
import { IssuanceSection } from './IssuanceSection';
import { KeygenSection } from './KeygenSection';
import { RaFormHeader } from './RaFormHeader';
import { ReenrollmentSection } from './ReenrollmentSection';
import type { RaFormDependencies, RaSectionProps } from './types';

/** EST settings shown as tabs; the remaining sections are always visible above them. */
const enrollmentTabs = [
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'reenrollment', label: 'Re-enrollment' },
  { id: 'keygen', label: 'Server key generation' },
  { id: 'distribution', label: 'CA distribution' },
] as const satisfies ReadonlyArray<{ id: RaFormSectionId; label: string }>;
type EnrollmentTabId = typeof enrollmentTabs[number]['id'];

function isEnrollmentTab(section: RaFormSectionId): section is EnrollmentTabId {
  return enrollmentTabs.some(tab => tab.id === section);
}

const inlineProfileDefaultValues: SigningProfileFormValues = { ...defaultFormValues, profileName: 'Inline Profile' };

function profileValidity(profile: ApiSigningProfile | undefined): CertificateValidity | null {
  const validity = profile?.validity;
  if (!validity) return null;
  if (validity.type === 'Duration' && validity.duration) return { type: 'Duration', value: validity.duration };
  if (validity.type === 'Indefinite' || validity.time?.startsWith('9999-12-31')) return { type: 'Indefinite' };
  if (validity.time) return { type: 'Date', value: validity.time };
  return null;
}

function inlineProfileValidity(validity: SigningProfileFormValues['validity']): CertificateValidity | null {
  if (validity.type === 'Duration' && validity.durationValue) return { type: 'Duration', value: validity.durationValue };
  if (validity.type === 'Date' && validity.dateValue) return { type: 'Date', value: validity.dateValue.toISOString() };
  if (validity.type === 'Indefinite') return { type: 'Indefinite' };
  return null;
}

function useRaFormDependencies(): RaFormDependencies {
  const [cas, setCas] = useState<CA[]>([]);
  const [cryptoEngines, setCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [profiles, setProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [caList, engines, profilesResponse] = await Promise.all([fetchAndProcessCAs(), fetchCryptoEngines(), fetchSigningProfiles()]);
      setCas(caList);
      setCryptoEngines(engines);
      setProfiles(Array.isArray(profilesResponse.list) ? profilesResponse.list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CAs and profiles.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const casById = useMemo(() => new Map(cas.map(ca => [ca.id, ca])), [cas]);
  return { cas, casById, cryptoEngines, profiles, isLoading, error, reload };
}

/** Create/edit form for a Registration Authority. Pass `raId` to edit an existing one. */
export function RaForm({ raId }: { raId: string | null }) {
  const router = useRouter();
  const isEditMode = !!raId;
  const deps = useRaFormDependencies();

  const [values, setValues] = useState<RaFormValues>(() => createDefaultRaFormValues());
  const [raData, setRaData] = useState<ApiRaItem | null>(null);
  const [raLoadError, setRaLoadError] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<RaFormField>>(() => new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EnrollmentTabId>('enrollment');

  const inlineProfileForm = useForm<SigningProfileFormValues>({
    resolver: zodResolver(signingProfileSchema),
    defaultValues: inlineProfileDefaultValues,
    mode: 'onChange',
  });
  const watchedInlineValidity = inlineProfileForm.watch('validity');

  const update = useCallback((patch: Partial<RaFormValues>) => setValues(prev => ({ ...prev, ...patch })), []);
  const touch = useCallback((field: RaFormField) => {
    setTouched(prev => (prev.has(field) ? prev : new Set(prev).add(field)));
  }, []);

  useEffect(() => {
    if (!raId) return;
    let cancelled = false;
    fetchRaById(raId)
      .then(ra => {
        if (cancelled) return;
        const { values: loaded, inlineProfile } = raFormValuesFromApi(ra);
        if (inlineProfile) {
          const profileValues = mapIssuanceProfileToFormValues(inlineProfile);
          inlineProfileForm.reset({
            ...profileValues,
            profileName: profileValues.profileName.trim().length >= 3 ? profileValues.profileName : inlineProfileDefaultValues.profileName,
          });
        }
        setValues(loaded);
        setRaData(ra);
      })
      .catch(err => !cancelled && setRaLoadError(err instanceof Error ? err.message : 'Failed to load the Registration Authority.'));
    return () => { cancelled = true; };
  }, [raId, inlineProfileForm]);

  useEffect(() => {
    if (values.issuanceProfileMode === 'inline') void inlineProfileForm.trigger();
  }, [inlineProfileForm, values.issuanceProfileMode]);

  const enrollmentCa = values.enrollmentCaId ? deps.casById.get(values.enrollmentCaId) : undefined;
  const enrollmentCaDefaultProfile = deps.profiles.find(profile => profile.id === enrollmentCa?.defaultProfileId);

  const effectiveProfile = useMemo(() => {
    if (values.issuanceProfileMode === 'inline') {
      const validity = inlineProfileValidity(watchedInlineValidity);
      return validity && { name: 'Custom profile', validity };
    }
    const profile = values.issuanceProfileMode === 'existing'
      ? deps.profiles.find(p => p.id === values.issuanceProfileId)
      : enrollmentCaDefaultProfile;
    const validity = profileValidity(profile);
    return profile && validity ? { name: profile.name, validity } : null;
  }, [values.issuanceProfileMode, values.issuanceProfileId, watchedInlineValidity, deps.profiles, enrollmentCaDefaultProfile]);

  const inlineProfileErrors = values.issuanceProfileMode === 'inline' ? getFormErrorMessages(inlineProfileForm.formState.errors) : [];
  const allIssues = validateRaForm(values, {
    isEditMode,
    enrollmentCaName: enrollmentCa?.name,
    enrollmentCaHasDefaultProfile: deps.isLoading || !enrollmentCa ? undefined : !!enrollmentCaDefaultProfile,
    inlineProfileErrors,
  });
  const visibleIssues = allIssues.filter(issue => isIssueVisible(issue, submitAttempted, touched));
  const issuesFor = (section: RaFormSectionId) => visibleIssues.filter(issue => issue.section === section);

  const countIssues = (section: RaFormSectionId) => {
    const sectionIssues = issuesFor(section);
    return {
      errors: sectionIssues.filter(issue => issue.severity === 'error').length,
      warnings: sectionIssues.filter(issue => issue.severity === 'warning').length,
    };
  };

  const goToSection = (section: RaFormSectionId) => {
    if (isEnrollmentTab(section)) setActiveTab(section);
    // Wait for the tab panel to mount before scrolling to it.
    requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);

    const inlineProfileValid = values.issuanceProfileMode !== 'inline' || await inlineProfileForm.trigger();
    const firstError = allIssues.find(issue => issue.severity === 'error');
    if (firstError || !inlineProfileValid) {
      goToSection(firstError?.section ?? 'issuance');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = buildRaPayload(
        { ...values, id: raId ?? values.id },
        {
          metadata: raData?.metadata,
          inlineProfile: values.issuanceProfileMode === 'inline' ? buildInlineIssuanceProfile(inlineProfileForm.getValues()) : undefined,
        },
      );
      await createOrUpdateRa(payload, isEditMode, raId);
      sileo.success({
        title: isEditMode ? 'Changes saved' : 'Registration Authority created',
        description: `"${payload.name}" ${isEditMode ? 'was updated' : 'is ready to enroll devices'}.`,
      });
      if (!isEditMode) router.push('/registration-authorities');
    } catch (error) {
      sileo.error({ title: 'Operation Failed', description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (raLoadError) {
    return (
      <Alert variant="destructive" className="mx-auto w-[80%]">
        <AlertTriangle className="size-4" />
        <AlertTitle>Could not load Registration Authority</AlertTitle>
        <AlertDescription>{raLoadError}</AlertDescription>
      </Alert>
    );
  }

  if (isEditMode && !raData) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading Registration Authority…
      </div>
    );
  }

  const sectionProps = (section: RaFormSectionId): RaSectionProps => ({ values, update, touch, deps, issues: issuesFor(section) });
  const errorCount = visibleIssues.filter(issue => issue.severity === 'error').length;
  const warningIssues = visibleIssues.filter(issue => issue.severity === 'warning');

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mx-auto w-[80%]">
        <RaFormHeader values={values} isEditMode={isEditMode} enrollmentCaName={enrollmentCa?.name} onEditIcon={() => setIsIconModalOpen(true)} />

        {deps.error && (
          <Alert variant="destructive" className="mt-6">
            <AlertTriangle className="size-4" />
            <AlertTitle>Could not load CAs and issuance profiles</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {deps.error}
              <Button type="button" size="sm" variant="secondary" onClick={deps.reload}>Retry</Button>
            </AlertDescription>
          </Alert>
        )}

        <IdentitySection {...sectionProps('identity')} isEditMode={isEditMode} />
        <IssuanceSection
          {...sectionProps('issuance')}
          inlineProfileForm={inlineProfileForm}
          enrollmentCaDefaultProfile={enrollmentCaDefaultProfile}
        />
        <DevicesSection {...sectionProps('devices')} onOpenIconPicker={() => setIsIconModalOpen(true)} />

        <Tabs value={activeTab} onValueChange={tab => setActiveTab(tab as EnrollmentTabId)} className="w-full">
          <div className="overflow-x-auto overflow-y-hidden border-b bg-primary/5">
            <TabsList className={pageTabsListClass}>
              {enrollmentTabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className={pageTabsTriggerClass}>
                  {tab.label}
                  <IssueMarker {...countIssues(tab.id)} />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="enrollment"><EnrollmentSection {...sectionProps('enrollment')} /></TabsContent>
          <TabsContent value="reenrollment"><ReenrollmentSection {...sectionProps('reenrollment')} effectiveProfile={effectiveProfile} /></TabsContent>
          <TabsContent value="keygen"><KeygenSection {...sectionProps('keygen')} /></TabsContent>
          <TabsContent value="distribution"><DistributionSection {...sectionProps('distribution')} /></TabsContent>
        </Tabs>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
        <div className="mx-auto flex w-[80%] items-center justify-between gap-4">
          <FooterStatus
            errorCount={errorCount}
            pendingCount={allIssues.filter(issue => issue.severity === 'error').length}
            warnings={warningIssues}
            onJump={goToSection}
            firstErrorSection={visibleIssues.find(issue => issue.severity === 'error')?.section}
            isEditMode={isEditMode}
          />
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="secondary" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              {isSubmitting ? 'Saving…' : isEditMode ? 'Save changes' : 'Create RA'}
            </Button>
          </div>
        </div>
      </div>

      <DeviceIconSelectorModal
        isOpen={isIconModalOpen}
        onOpenChange={setIsIconModalOpen}
        currentSelectedIconName={values.deviceIcon.name}
        initialIconColor={values.deviceIcon.color}
        initialBgColor={values.deviceIcon.bgColor}
        onIconSelected={name => setValues(prev => ({ ...prev, deviceIcon: { ...prev.deviceIcon, name } }))}
        onColorsChange={({ iconColor, bgColor }) => setValues(prev => ({ ...prev, deviceIcon: { ...prev.deviceIcon, color: iconColor, bgColor } }))}
      />
    </form>
  );
}

interface FooterStatusProps {
  /** Visible errors (shown after a submit attempt or once their field is touched). */
  errorCount: number;
  /** All errors, including required fields not yet surfaced. */
  pendingCount: number;
  warnings: readonly RaFormIssue[];
  firstErrorSection?: RaFormSectionId;
  onJump: (section: RaFormSectionId) => void;
  isEditMode: boolean;
}

function FooterStatus({ errorCount, pendingCount, warnings, firstErrorSection, onJump, isEditMode }: FooterStatusProps) {
  const jumpClass = 'flex min-w-0 items-center gap-2 rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (errorCount > 0 && firstErrorSection) {
    return (
      <button type="button" className={cn(jumpClass, 'text-destructive')} onClick={() => onJump(firstErrorSection)}>
        <AlertTriangle className="size-4 shrink-0" />
        <span className="truncate">{errorCount} {errorCount === 1 ? 'issue' : 'issues'} to fix: go to first</span>
      </button>
    );
  }
  if (warnings.length > 0) {
    return (
      <button type="button" className={cn(jumpClass, 'text-amber-700 dark:text-amber-400')} onClick={() => onJump(warnings[0].section)}>
        <AlertTriangle className="size-4 shrink-0" />
        <span className="truncate">{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'} to review</span>
      </button>
    );
  }
  if (pendingCount > 0) {
    return (
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <CircleDashed className="size-4 shrink-0" />
        <span className="truncate">{pendingCount} required {pendingCount === 1 ? 'setting' : 'settings'} left</span>
      </p>
    );
  }
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 shrink-0 text-primary" />
      <span className="truncate">{isEditMode ? 'Ready to save. Changes apply to future enrollments.' : 'Ready to create.'}</span>
    </p>
  );
}

/** Error count (red) or warning dot (amber) shown next to a tab label. */
function IssueMarker({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors > 0) {
    return (
      <span className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-4 text-white" aria-label={`${errors} ${errors === 1 ? 'error' : 'errors'}`}>
        {errors}
      </span>
    );
  }
  if (warnings > 0) {
    return <span className="size-2 rounded-full bg-amber-500" aria-label={`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`} />;
  }
  return null;
}
