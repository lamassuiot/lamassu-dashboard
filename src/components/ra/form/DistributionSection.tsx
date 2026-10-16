'use client';

import { CaListField } from './CaListField';
import { RaFieldGroup, RaFormSection, SettingSwitch, SettingSwitchList } from './RaFormSection';
import type { RaSectionProps } from './types';

export function DistributionSection({ values, update, deps }: RaSectionProps) {
  return (
    <RaFormSection
      id="distribution"
      title="CA distribution"
      description="Trust anchors returned to devices through the EST cacerts endpoint."
    >
      <RaFieldGroup title="Include automatically">
        <SettingSwitchList>
          <SettingSwitch
            id="includeSystemCa"
            label="Downstream certificate"
            description="Include the platform's downstream TLS certificate so devices can verify the EST server."
            checked={values.includeSystemCa}
            onCheckedChange={includeSystemCa => update({ includeSystemCa })}
          />
          <SettingSwitch
            id="includeEnrollmentCa"
            label="Enrollment CA"
            description="Include the CA that signs device certificates."
            checked={values.includeEnrollmentCa}
            onCheckedChange={includeEnrollmentCa => update({ includeEnrollmentCa })}
          />
        </SettingSwitchList>
      </RaFieldGroup>

      <CaListField
        label="Managed CAs"
        description="Additional CAs distributed to every device enrolled through this RA."
        emptyText="No managed CAs."
        addLabel="Add managed CA"
        modalDescription="Select a CA to include in the distribution list."
        value={values.managedCaIds}
        onChange={managedCaIds => update({ managedCaIds })}
        deps={deps}
      />
    </RaFormSection>
  );
}
