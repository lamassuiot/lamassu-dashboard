import { describe, expect, it, vi } from 'vitest';
import type { QuantumSafeComplianceResult } from '@/lib/cbom-api';
import { runCompliancePolicyChecks } from '@/lib/cbom-compliance';

const makeResult = (policyName: string): QuantumSafeComplianceResult => ({
  complianceServiceName: 'compliance-service',
  policyName,
  findings: [],
  complianceLevels: [],
  defaultComplianceLevel: 0,
  globalComplianceStatus: true,
  error: false,
});

describe('runCompliancePolicyChecks', () => {
  it('starts one check for every selected policy before waiting for responses', async () => {
    const resolvers = new Map<string, (result: QuantumSafeComplianceResult) => void>();
    const runner = vi.fn((_: object, policyId: string) =>
      new Promise<QuantumSafeComplianceResult>((resolve) => {
        resolvers.set(policyId, resolve);
      }),
    );

    const batchPromise = runCompliancePolicyChecks(
      {},
      ['quantum_safe', 'pqc', 'eccg_v2'],
      'token',
      runner,
    );

    await Promise.resolve();
    expect(runner).toHaveBeenCalledTimes(3);
    expect(runner.mock.calls.map((call) => call[1])).toEqual([
      'quantum_safe',
      'pqc',
      'eccg_v2',
    ]);

    resolvers.get('quantum_safe')?.(makeResult('Quantum safe'));
    resolvers.get('pqc')?.(makeResult('PQC'));
    resolvers.get('eccg_v2')?.(makeResult('ECCG v2'));

    const batch = await batchPromise;
    expect(Object.keys(batch.results)).toEqual(['quantum_safe', 'pqc', 'eccg_v2']);
    expect(batch.failures).toEqual([]);
  });

  it('preserves successful policy results when another request fails', async () => {
    const runner = vi.fn(async (_: object, policyId: string) => {
      if (policyId === 'pqc') {
        throw new Error('PQC service unavailable');
      }
      return makeResult(policyId);
    });

    const batch = await runCompliancePolicyChecks(
      {},
      ['quantum_safe', 'pqc'],
      'token',
      runner,
    );

    expect(Object.keys(batch.results)).toEqual(['quantum_safe']);
    expect(batch.failures).toHaveLength(1);
    expect(batch.failures[0].policyId).toBe('pqc');
  });
});
