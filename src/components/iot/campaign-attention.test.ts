import { describe, expect, it } from 'vitest';
import { campaignAttentionReasons, isAwaitingBatchRelease, isNotStartedCampaign } from '@/components/iot/campaign-cells';
import type { CampaignItem } from '@/types/iot';

const campaign = (over: Partial<CampaignItem>): CampaignItem =>
  ({ id: 'c1', group_id: 'g1', name: 'c', status: 'running', auto: true, total_devices: 10, pending_count: 0, active_count: 0, completed_count: 0, failed_count: 0, ...over }) as CampaignItem;

describe('campaignAttentionReasons', () => {
  it('flags a campaign that never started', () => {
    const c = campaign({ pending_count: 10 });
    expect(isNotStartedCampaign(c)).toBe(true);
    expect(campaignAttentionReasons(c)).toEqual(['Not started']);
  });

  it('does not flag one that is only waiting for a future scheduled start', () => {
    const c = campaign({ pending_count: 10, scheduled_at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(campaignAttentionReasons(c)).toEqual([]);
  });

  it('flags a manual campaign whose batch ended with devices still pending', () => {
    const c = campaign({ auto: false, completed_count: 5, pending_count: 5 });
    expect(isAwaitingBatchRelease(c)).toBe(true);
    expect(campaignAttentionReasons(c)).toEqual(['Batch ended, waiting for release']);
  });

  it('does not flag a manual campaign while its batch is still running', () => {
    expect(campaignAttentionReasons(campaign({ auto: false, completed_count: 3, active_count: 2, pending_count: 5 }))).toEqual([]);
  });

  it('does not flag an auto campaign between batches', () => {
    expect(campaignAttentionReasons(campaign({ auto: true, completed_count: 5, pending_count: 5 }))).toEqual([]);
  });

  it('ignores finished and cancelled campaigns, failures included', () => {
    expect(campaignAttentionReasons(campaign({ status: 'completed', completed_count: 8, failed_count: 2 }))).toEqual([]);
    expect(campaignAttentionReasons(campaign({ status: 'cancelled', auto: false, completed_count: 5, pending_count: 5 }))).toEqual([]);
  });
});
