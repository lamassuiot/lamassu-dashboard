'use client';

import { EstAuthSettingsEditor } from '@/components/ra/EstAuthSettingsEditor';
import { RenewalLifespanBar, type CertificateValidity } from '@/components/ra/RenewalLifespanBar';
import { DurationInput } from '@/components/shared/DurationInput';
import { CaListField } from './CaListField';
import { RaFieldGroup, RaFormSection, SettingSwitch, SettingSwitchList } from './RaFormSection';
import { authEditorIssueProps, fieldError, listedIssues, type RaSectionProps } from './types';

interface ReenrollmentSectionProps extends RaSectionProps {
  /** Validity of the profile that will issue certificates, used to draw the renewal timeline. */
  effectiveProfile: { name: string; validity: CertificateValidity } | null;
}

export function ReenrollmentSection({ values, update, issues, deps, effectiveProfile }: ReenrollmentSectionProps) {
  return (
    <RaFormSection
      id="reenrollment"
      title="Re-enrollment"
      description="When and how devices renew the certificates this RA issued."
      issues={listedIssues(issues, ['reenrollmentAuth', 'reenrollmentDelta', 'preventiveDelta', 'criticalDelta'])}
    >
      <EstAuthSettingsEditor
        idPrefix="reenrollment"
        value={values.reenrollmentAuth}
        onChange={reenrollmentAuth => update({ reenrollmentAuth })}
        availableCAs={deps.cas}
        allCryptoEngines={deps.cryptoEngines}
        isLoadingCAs={deps.isLoading}
        errorCAs={deps.error}
        loadCAsAction={deps.reload}
        {...authEditorIssueProps(issues, 'reenrollmentAuth')}
      />

      <RaFieldGroup title="Renewal timing">
        <div className="grid gap-4 md:grid-cols-3">
          <DurationInput
            id="reenrollmentDelta"
            label="Re-enrollment window"
            value={values.reenrollmentDelta}
            onChange={reenrollmentDelta => update({ reenrollmentDelta })}
            placeholder="e.g. 100d"
            description="Before expiry, when re-enrollment opens."
            error={fieldError(issues, 'reenrollmentDelta')}
          />
          <DurationInput
            id="preventiveDelta"
            label="Preventive warning"
            value={values.preventiveDelta}
            onChange={preventiveDelta => update({ preventiveDelta })}
            placeholder="e.g. 31d"
            description="Before expiry, when the preventive event fires."
            error={fieldError(issues, 'preventiveDelta')}
          />
          <DurationInput
            id="criticalDelta"
            label="Critical warning"
            value={values.criticalDelta}
            onChange={criticalDelta => update({ criticalDelta })}
            placeholder="e.g. 7d"
            description="Before expiry, when the critical event fires."
            error={fieldError(issues, 'criticalDelta')}
          />
        </div>
        <RenewalLifespanBar
          certificateValidity={effectiveProfile?.validity ?? null}
          issuanceProfileName={effectiveProfile?.name}
          reenrollmentWindow={values.reenrollmentDelta}
          preventiveDelta={values.preventiveDelta}
          criticalDelta={values.criticalDelta}
        />
      </RaFieldGroup>

      <RaFieldGroup title="Renewal behavior">
        <SettingSwitchList>
          <SettingSwitch
            id="revokeOnReenrollment"
            label="Revoke on re-enroll"
            description="Revoke the previous certificate once its replacement is issued."
            checked={values.revokeOnReenrollment}
            onCheckedChange={revokeOnReenrollment => update({ revokeOnReenrollment })}
          />
          <SettingSwitch
            id="allowExpiredRenewal"
            label="Allow expired renewal"
            description="Let devices re-enroll with a certificate that has already expired."
            checked={values.allowExpiredRenewal}
            onCheckedChange={allowExpiredRenewal => update({ allowExpiredRenewal })}
          />
        </SettingSwitchList>
      </RaFieldGroup>

      <CaListField
        label="Additional validation CAs"
        description="Extra CAs whose certificates are accepted when a device re-enrolls."
        emptyText="No additional validation CAs."
        addLabel="Add validation CA"
        modalDescription="Select a CA to trust for re-enrollment."
        value={values.additionalValidationCaIds}
        onChange={additionalValidationCaIds => update({ additionalValidationCaIds })}
        deps={deps}
      />
    </RaFormSection>
  );
}
