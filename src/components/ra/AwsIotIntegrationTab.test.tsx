import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fetchAndProcessCAs, type CA } from '@/lib/ca-data';
import { createOrUpdateRa, type ApiRaItem } from '@/lib/dms-api';
import { buildRaPayload, createDefaultRaFormValues } from '@/lib/ra-form';
import { AwsIotIntegrationTab } from './AwsIotIntegrationTab';

vi.mock('@/lib/ca-data', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/ca-data')>()),
  fetchAndProcessCAs: vi.fn(),
}));
vi.mock('@/lib/dms-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/dms-api')>()),
  createOrUpdateRa: vi.fn(async () => {}),
}));
vi.mock('@/lib/toast', () => ({ sileo: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/CaVisualizerCard', () => ({ CaVisualizerCard: () => null }));

const configKey = 'lamassu.io/iot/aws.123456789012';

describe('AwsIotIntegrationTab', () => {
  it('saves the integration without the authz principal settings of the page copy of the RA', async () => {
    const ra: ApiRaItem = {
      ...buildRaPayload({
        ...createDefaultRaFormValues(0),
        name: 'Factory RA',
        id: 'factory-ra',
        enrollmentCaId: 'ca-1',
        createAuthzPrincipal: true,
        authzPolicyIds: ['policy-a'],
        authzAttributes: [{ name: 'client_id', source: 'x509.subject.cn' }],
      }),
      creation_ts: '2026-01-01T00:00:00Z',
    };
    const registration = { status: 'SUCCEEDED', registration_request_time: '2026-01-01T00:00:00Z' };
    vi.mocked(fetchAndProcessCAs).mockResolvedValue([{ id: 'ca-1', rawApiData: { metadata: { [configKey]: { registration } } } } as unknown as CA]);

    render(<AwsIotIntegrationTab ra={ra} configKey={configKey} onUpdate={() => {}} />);
    const save = await screen.findByRole('button', { name: 'Update DMS' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(createOrUpdateRa).toHaveBeenCalledTimes(1));
    const [payload, isEditMode, raId] = vi.mocked(createOrUpdateRa).mock.calls[0];
    const { authz_principal_settings: _, ...otherSettings } = ra.settings;
    expect(payload.settings).not.toHaveProperty('authz_principal_settings');
    expect(payload.settings).toEqual(otherSettings);
    expect(payload.metadata[configKey]).toMatchObject({ registration_mode: 'none', groups: ['LAMASSU'] });
    expect([isEditMode, raId]).toEqual([true, 'factory-ra']);
  });
});
