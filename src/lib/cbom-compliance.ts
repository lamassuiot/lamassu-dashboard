import {
  runComplianceCheck,
  type QuantumSafeComplianceResult,
} from '@/lib/cbom-api';

type ComplianceCheckRunner = (
  bomData: object,
  policyIdentifier: string,
  accessToken: string,
) => Promise<QuantumSafeComplianceResult>;

export interface CompliancePolicyCheckFailure {
  policyId: string;
  reason: unknown;
}

export interface CompliancePolicyCheckBatch {
  results: Record<string, QuantumSafeComplianceResult>;
  failures: CompliancePolicyCheckFailure[];
}

export async function runCompliancePolicyChecks(
  bomData: object,
  policyIds: string[],
  accessToken: string,
  runner: ComplianceCheckRunner = runComplianceCheck,
): Promise<CompliancePolicyCheckBatch> {
  const settledChecks = await Promise.allSettled(
    policyIds.map(async (policyId) => ({
      policyId,
      result: await runner(bomData, policyId, accessToken),
    })),
  );
  const results: Record<string, QuantumSafeComplianceResult> = {};
  const failures: CompliancePolicyCheckFailure[] = [];

  settledChecks.forEach((check, index) => {
    const policyId = policyIds[index];
    if (check.status === 'fulfilled') {
      results[check.value.policyId] = check.value.result;
      return;
    }

    failures.push({ policyId, reason: check.reason });
  });

  return { results, failures };
}
