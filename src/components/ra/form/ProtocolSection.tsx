'use client';

import type { RaProtocol } from '@/lib/ra-form';
import { ChoiceList, RaFormSection } from './RaFormSection';
import type { RaSectionProps } from './types';

const protocolOptions = [
  {
    value: 'EST_RFC7030' as const,
    label: 'EST (RFC 7030)',
    description: 'Enrollment over Secure Transport for certificate requests and renewals.',
  },
];

export function ProtocolSection({ values, update }: RaSectionProps) {
  return (
    <RaFormSection
      id="protocol"
      title="Protocol"
      description="The enrollment protocol devices use to talk to this Registration Authority."
    >
      <ChoiceList<RaProtocol>
        name="protocol"
        value={values.protocol}
        onChange={protocol => update({ protocol })}
        options={protocolOptions}
      />
    </RaFormSection>
  );
}
