import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runComplianceCheck } from '@/lib/cbom-api';

const CBOM_API_BASE_URL = 'https://cbom.test.lamassu.io';

function createComplianceResponse(): Response {
  return new Response(
    JSON.stringify({
      complianceServiceName: 'test',
      policyName: 'test',
      findings: [],
      complianceLevels: [],
      defaultComplianceLevel: 0,
      globalComplianceStatus: true,
      error: false,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('runComplianceCheck', () => {
  beforeEach(() => {
    (window as typeof window & {
      lamassuConfig?: { LAMASSU_CBOM_API: string };
    }).lamassuConfig = { LAMASSU_CBOM_API: CBOM_API_BASE_URL };

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      return Promise.resolve(createComplianceResponse());
    }));
  });

  afterEach(() => {
    delete (window as typeof window & { lamassuConfig?: unknown }).lamassuConfig;
    vi.unstubAllGlobals();
  });

  it('includes policyIdentifier for the quantum_safe policy', async () => {
    await runComplianceCheck({ components: [] }, 'quantum_safe', 'test-token');

    expect(fetch).toHaveBeenCalledWith(
      `${CBOM_API_BASE_URL}/compliance/check?policyIdentifier=quantum_safe`,
      expect.any(Object),
    );
  });

  it('includes policyIdentifier for an external policy', async () => {
    await runComplianceCheck({ components: [] }, 'pqc', 'test-token');

    expect(fetch).toHaveBeenCalledWith(
      `${CBOM_API_BASE_URL}/compliance/check?policyIdentifier=pqc`,
      expect.any(Object),
    );
  });
});
