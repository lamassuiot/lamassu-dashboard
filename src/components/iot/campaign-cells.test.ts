import { describe, expect, it } from 'vitest';
import { deriveBatchPlan } from './campaign-cells';
import type { CampaignItem } from '@/types/iot';

// What hawkbit mode reports for a batch of `perBatch` devices over `total` targeted devices: the
// first batch's share as a whole percent, the way the ota repo's readGroupShape rounds it.
function hawkbitCampaign(total: number, perBatch: number, extra: Partial<CampaignItem> = {}): CampaignItem {
  return {
    id: '1',
    group_id: 'g',
    name: 'c',
    exec_date: '2026-09-28T10:00:00Z',
    total_devices: total,
    pending_count: total,
    rollout_type: 'percentage',
    rollout_value: Math.round((perBatch / total) * 100),
    ...extra,
  };
}

const sizes = (c: CampaignItem, backend: string) => deriveBatchPlan(c, backend)!.batches.map((b) => b.size);

describe('deriveBatchPlan (hawkbit)', () => {
  it.each([
    [8, 2, [2, 2, 2, 2]],
    [8, 3, [3, 3, 2]],
    [7, 2, [2, 2, 2, 1]],
    [10, 3, [3, 3, 3, 1]],
    [8, 1, [1, 1, 1, 1, 1, 1, 1, 1]],
    [99, 3, Array(33).fill(3)],
  ])('%i devices in batches of %i', (total, per, want) => {
    expect(sizes(hawkbitCampaign(total, per), 'hawkbit')).toEqual(want);
  });

  it('shows one batch when the batch covers the whole group', () => {
    expect(sizes(hawkbitCampaign(8, 8), 'hawkbit')).toEqual([8]);
  });

  it('puts the test device in its own first batch, then batches the rest', () => {
    const plan = deriveBatchPlan(hawkbitCampaign(9, 2, { test_device_id: 'dev-1' }), 'hawkbit')!;
    expect(plan.batches.map((b) => b.size)).toEqual([1, 2, 2, 2, 2]);
    expect(plan.batches.map((b) => b.label)).toEqual(['Test device', 'Batch 1', 'Batch 2', 'Batch 3', 'Batch 4']);
  });

  it('locates the in-flight batch from how many devices have been dispatched', () => {
    const plan = deriveBatchPlan(
      hawkbitCampaign(8, 2, { pending_count: 4, active_count: 2, completed_count: 2 }),
      'hawkbit',
    )!;
    expect(plan.current).toBe(2);
    expect(plan.batches.map((b) => b.state)).toEqual(['done', 'running', 'pending', 'pending']);
  });
});

describe('deriveBatchPlan (native)', () => {
  it('keeps fixed-size batches', () => {
    const c: CampaignItem = { ...hawkbitCampaign(8, 2), rollout_type: 'numeric', rollout_value: 2 };
    expect(sizes(c, 'native')).toEqual([2, 2, 2, 2]);
  });

  it('floors a percentage batch', () => {
    const c: CampaignItem = { ...hawkbitCampaign(8, 2), rollout_type: 'percentage', rollout_value: 20 };
    expect(sizes(c, 'native')).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
