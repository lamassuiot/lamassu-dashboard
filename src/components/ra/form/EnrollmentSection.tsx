'use client';

import { EstAuthSettingsEditor } from '@/components/ra/EstAuthSettingsEditor';
import { RaFieldGroup, RaFormSection, SettingSwitch, SettingSwitchList } from './RaFormSection';
import { authEditorIssueProps, listedIssues, type RaSectionProps } from './types';

export function EnrollmentSection({ values, update, issues, deps }: RaSectionProps) {
  return (
    <RaFormSection
      id="enrollment"
      title="Enrollment"
      description="How devices authenticate when requesting their first certificate."
      issues={listedIssues(issues, ['enrollmentAuth'])}
    >
      <EstAuthSettingsEditor
        idPrefix="enrollment"
        value={values.enrollmentAuth}
        onChange={enrollmentAuth => update({ enrollmentAuth })}
        availableCAs={deps.cas}
        allCryptoEngines={deps.cryptoEngines}
        isLoadingCAs={deps.isLoading}
        errorCAs={deps.error}
        loadCAsAction={deps.reload}
        {...authEditorIssueProps(issues, 'enrollmentAuth')}
      />

      <RaFieldGroup title="Request handling">
        <SettingSwitchList>
          <SettingSwitch
            id="verifyCsrSignature"
            label="Verify CSR signature"
            description="Reject Certificate Signing Requests whose signature does not match their public key."
            checked={values.verifyCsrSignature}
            onCheckedChange={verifyCsrSignature => update({ verifyCsrSignature })}
          />
          <SettingSwitch
            id="allowReplaceableEnrollment"
            label="Allow replaceable enrollment"
            description="Let an already enrolled device enroll again, replacing its active identity certificate."
            checked={values.allowReplaceableEnrollment}
            onCheckedChange={allowReplaceableEnrollment => update({ allowReplaceableEnrollment })}
          />
        </SettingSwitchList>
      </RaFieldGroup>
    </RaFormSection>
  );
}
