
// src/lib/iot-api.ts
'use client';

import { get_CLIENT_UPDATES_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';
import { fetchJobs as fetchWfxJobs } from './wfx-api';
import type { UpdatePack, ApiCreateUpdatePackPayload, ApiGlobalStrategy, CampaignItem, DeviceJob, CampaignListResponse, DeviceListApiResponse, UpdatePackVersion, Artifact, DevicePackVersion, DevicePackUpdate, DevicePackWithArtifacts, CampaignPrecondition, PreconditionFailure, GroupLatestPack, DeviceLatestDrift, GroupVersionCompliance, GroupVersionStatus } from '@/types/iot';


export interface ApiParams {
    groupId: string;
}

export interface ApiCallOptions {
  signal?: AbortSignal | null;
}

export interface FetchUpdatePacksOptions {
  pageSize?: number;
  bookmark?: string;
  sortBy?: string;
  sortMode?: 'asc' | 'desc';
}

export interface UpdatePacksResponse {
  list: UpdatePack[];
  next: string | null;
}

export async function fetchUpdatePacks(
  { groupId }: ApiParams, 
  options?: FetchUpdatePacksOptions,
  opts?: ApiCallOptions
): Promise<UpdatePacksResponse> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.sortBy) params.set('sort_by', options.sortBy);
  if (options?.sortMode) params.set('sort_mode', options.sortMode);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch distribution sets');
  
  return {
    list: data.list || [],
    next: data.next || null
  };
}

/**
 * Fetch every distribution set across all device groups (fleet-wide, not group-scoped).
 * Surfaces packs orphaned by a deleted device group or a group-ID change after a
 * lamassuiot re-run — these never appear in the per-group listing.
 * GET /v1/updatepacks
 */
export async function fetchAllUpdatePacks(options?: FetchUpdatePacksOptions,
  opts?: ApiCallOptions
): Promise<UpdatePacksResponse> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.sortBy) params.set('sort_by', options.sortBy);
  if (options?.sortMode) params.set('sort_mode', options.sortMode);

  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/updatepacks${params.toString() ? '?' + params.toString() : ''}`;

  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch all distribution sets');

  return {
    list: data.list || [],
    next: data.next || null,
  };
}

// Legacy function for backward compatibility
export async function fetchUpdatePacksLegacy({ groupId }: ApiParams, opts?: ApiCallOptions): Promise<UpdatePack[]> {
  const response = await fetchUpdatePacks({ groupId }, { pageSize: 50 }, opts);
  return response.list;
}

export async function deleteUpdatePackApi({ groupId, packName }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}`, {
    method: 'DELETE',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to delete pack ${packName}`);
}

/**
 * Create a new distribution set (the "repo"). Lightweight: just the pack metadata — artifacts are
 * uploaded and an SWU is built afterwards on the pack-details page.
 * POST /groups/:groupId/updatepacks
 */
export async function createUpdatePack(
  { groupId, payload }: ApiParams & { payload: ApiCreateUpdatePackPayload },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, 'Failed to create distribution set');
}

/**
 * Create a new VERSION of an existing pack (bumps the version, ready for fresh artifacts + SWU).
 * POST /groups/:groupId/updatepacks/:packName/new
 */
export async function createUpdatePackVersion(
  { groupId, packName, version }: ApiParams & { packName: string; version: string },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to create new version of pack ${packName}`);
}

/**
 * Build the non-SWU deliverable (.tar.gz) for a pack from the given/selected artifacts.
 * POST /groups/:groupId/updatepacks/:packName/package
 */
// Security/selection options for building a non-SWU package (subset of GenerateSwuPayload — no
// descriptor or per-file encryption; the whole archive is signed/encrypted as one unit).
export interface GeneratePackagePayload {
  selected_artifact_ids?: string[];
  user?: string;
  encryption_key_name?: string;
  encryption_alg_name?: string;
  signature_key_id?: string;
  signature_alg_name?: string;
  signature_certificate?: string;
}

export async function generatePackage(
  { groupId, packName, payload }: ApiParams & { packName: string; payload?: GeneratePackagePayload },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to build package for pack ${packName}`);
}

/**
 * Upload the sw-descriptor for a pack (required before building an SWU).
 * POST /groups/:groupId/updatepacks/:packName/descriptor/upload
 */
export async function uploadPackDescriptor(
  { groupId, packName, file }: ApiParams & { packName: string; file: File },
  opts?: ApiCallOptions
): Promise<any> {
  const fd = new FormData();
  fd.append('file', file);
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/descriptor/upload`, {
    method: 'POST',
    body: fd,
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to upload descriptor for pack ${packName}`);
}

export interface GenerateSwuPayload {
  selected_artifact_ids?: string[];
  user?: string;
  encryption_key_name?: string;
  encryption_alg_name?: string;
  signature_key_id?: string;
  signature_alg_name?: string;
  signature_certificate?: string;
  sw_desc_encrypted?: boolean;
  encrypt_all_files?: boolean;
}

/**
 * Build the SWU for a pack with the given security options + selected artifacts.
 * POST /groups/:groupId/updatepacks/:packName/swu
 */
export async function generateSwu(
  { groupId, packName, userId, payload }: ApiParams & { packName: string; userId: string; payload: GenerateSwuPayload },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/swu?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to generate SWU for pack ${packName}`);
}

export async function fetchArtifacts({ groupId, packName }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<string[]> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifacts`, {
    signal: opts?.signal ?? undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch artifacts for pack ${packName}. HTTP error ${response.status}`);
  }

  // Try to parse as JSON
  try {
    const data = await response.json();
    // Handle different response formats: direct array, {list: array}, or {artifacts: array}
    if (Array.isArray(data)) {
      return data;
    }
    return data.list || data.artifacts || [];
  } catch {
    // If JSON parsing fails, try to parse as text that might be a JSON string
    try {
      const text = await response.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return parsed.list || parsed.artifacts || [];
    } catch (textError) {
      console.error('Failed to parse artifacts response:', textError);
      return [];
    }
  }
}

export async function fetchUpdatePackDescriptor({ groupId, packName }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<string> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/descriptor`, {
    signal: opts?.signal ?? undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch descriptor for pack ${packName}. HTTP error ${response.status}`);
  }

  // Try to get as text first (for descriptor content)
  try {
    const text = await response.text();
    return text;
  } catch {
    // Fallback to JSON parsing
    const data = await response.json();
    if (typeof data === 'string') {
      return data;
    }
    return data.descriptor || data.content || '';
  }
}

// Global strategy endpoints removed - no longer supported by backend
// Strategy is now configured per-campaign only

export async function fetchCurrentCampaigns({ groupId, limit, bookmark }: ApiParams & { limit?: number; bookmark?: string }, opts?: ApiCallOptions): Promise<CampaignListResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (bookmark) params.set('bookmark', bookmark);

  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch${params.toString() ? '?' + params.toString() : ''}`;

  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch campaigns');

  return {
    next: data.next || null,
    list: data.list || [],
  };
}

export async function fetchCampaignDetails({ groupId, campaignId }: ApiParams & { campaignId: string }, opts?: ApiCallOptions): Promise<CampaignItem | null> {
  let bookmark: string | undefined = undefined;
  let hasMore = true;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const response: CampaignListResponse = await fetchCurrentCampaigns({ groupId, limit: 20, bookmark }, opts);

    if (response.list) {
      const found = response.list.find(l => l.id === campaignId);
      if (found) return found;
    }

    bookmark = response.next || undefined;
    hasMore = !!response.next;
  }

  return null;
}

export async function fetchAllCampaigns({ groupId }: ApiParams, opts?: ApiCallOptions): Promise<CampaignItem[]> {
  const allCampaigns: CampaignItem[] = [];
  let bookmark: string | undefined = undefined;
  let hasMore = true;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const response: CampaignListResponse = await fetchCurrentCampaigns({ groupId, limit: 20, bookmark }, opts);

    if (response.list) {
      allCampaigns.push(...response.list);
    }

    bookmark = response.next || undefined;
    hasMore = !!response.next;
  }

  return allCampaigns;
}

// Fetch jobs by campaign ID directly
export async function fetchJobsByCampaign({
  campaignId,
  pageSize = 50,
  bookmark
}: {
  campaignId: string; pageSize?: number;
  bookmark?: string;
}, opts?: ApiCallOptions): Promise<{ list: DeviceJob[]; next: string | null }> {
  const params = new URLSearchParams();
  if (pageSize) params.set('page_size', pageSize.toString());
  if (bookmark) params.set('bookmark', bookmark);

  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/launch/${campaignId}/jobs${params.toString() ? '?' + params.toString() : ''}`;

  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });

  const data = await handleApiError(response, `Failed to fetch jobs for campaign ${campaignId}`);

  return {
    list: data.list || [],
    next: data.next || null
  };
}

// ── WFX tag-based job lookup ──────────────────────────────────────────────────
// The secure-updates backend stamps every device job it creates for a campaign with WFX
// tags so jobs can be queried in bulk by the workflow executor instead of one request per
// device:
//   lms://dms/<groupID>             — the owning device group
//   lms://secure-updates/<launchID> — the campaign (launch) the job belongs to
// See the WFX `GET /jobs?tag=...` filter (repeatable query parameter).
export const CAMPAIGN_LAUNCH_TAG_PREFIX = 'lms://secure-updates/';
export const DEVICE_GROUP_TAG_PREFIX = 'lms://dms/';

/** WFX tag that scopes a job query to a single campaign (launch). */
export function buildCampaignLaunchTag(campaignId: string): string {
  return `${CAMPAIGN_LAUNCH_TAG_PREFIX}${campaignId}`;
}

/** WFX tag that scopes a job query to a single device group. */
export function buildDeviceGroupTag(groupId: string): string {
  return `${DEVICE_GROUP_TAG_PREFIX}${groupId}`;
}

// Map a WFX job (northbound API shape) onto the DeviceJob shape the updates UI consumes.
function wfxJobToDeviceJob(w: Awaited<ReturnType<typeof fetchWfxJobs>>['content'][number]): DeviceJob {
  return {
    clientId: w.clientId || w.status?.clientId || '',
    definition: (w.definition ?? {}) as unknown as DeviceJob['definition'],
    id: w.id,
    mtime: w.mtime || '',
    status: (w.status ?? { state: '', definitionHash: '' }) as unknown as DeviceJob['status'],
    stime: w.stime || '',
    tags: w.tags || [],
    workflow: (w.workflow ?? {}) as unknown as DeviceJob['workflow'],
  };
}

// Fetch every device job belonging to a campaign in a single tag-filtered WFX query,
// paginating until the full set is retrieved. Replaces the per-device fan-out
// (fetchAllDeviceJobs) when viewing a campaign's details.
export async function fetchCampaignJobsByTag(
  { campaignId, pageSize = 100 }: { campaignId: string; pageSize?: number },
): Promise<DeviceJob[]> {
  const tag = buildCampaignLaunchTag(campaignId);
  const jobs: DeviceJob[] = [];
  let offset = 0;
  const maxIterations = 50; // Safety bound to prevent runaway pagination

  for (let i = 0; i < maxIterations; i++) {
    const page = await fetchWfxJobs({ tag: [tag], limit: pageSize, offset });
    const content = page.content || [];
    jobs.push(...content.map(wfxJobToDeviceJob));

    const total = page.pagination?.total ?? jobs.length;
    offset += content.length;
    if (content.length === 0 || offset >= total) break;
  }

  return jobs;
}

// Campaign creation payload - all strategy fields are now required
export interface CreateCampaignPayload {
  update_pack_name: string;
  workflow_type: string;
  rollout_type: 'numeric' | 'percentage';
  rollout_value: number;
  test_device_id?: string;
  auto?: boolean;
  approval_threshold?: number; // % of batch that must succeed before next batch (auto only)
  error_threshold?: number; // % of all devices that can fail before aborting (auto only)
  // Campaign preconditions (optional; omit/empty = no gating)
  preconditions?: CampaignPrecondition[];
  force_preconditions?: boolean;
}

export async function createCampaign({ groupId, campaignData, dryRun }: ApiParams & { campaignData: CreateCampaignPayload; dryRun?: boolean }, opts?: ApiCallOptions): Promise<any> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch${dryRun ? '?dry_run=true' : ''}`;
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(campaignData),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, dryRun ? 'Failed to evaluate campaign preconditions' : 'Failed to create campaign');
}

// Deprecated: Use createCampaign instead
export const triggerGlobalCampaignApi = createCampaign;

export async function triggerItemRollout({ groupId, launchId }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${launchId}/rollout`, {
    method: 'POST',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to trigger rollout for item ${launchId}`);
}

// ── Campaign lifecycle controls ──────────────────────────────────────────────────
// Pause (stop) auto-deploy / Execute for a campaign; resumable.
export async function pauseCampaign({ groupId, campaignId }: ApiParams & { campaignId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/pause`, {
    method: 'POST',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to pause campaign ${campaignId}`);
}

// Resume a paused campaign; for auto campaigns it immediately rolls out pending devices.
export async function resumeCampaign({ groupId, campaignId }: ApiParams & { campaignId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/resume`, {
    method: 'POST',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to resume campaign ${campaignId}`);
}

// Re-queue and roll out a campaign's failed devices again (retry a failed test device, or re-attempt
// the errored devices of a finished campaign).
export async function retryFailedDevices({ groupId, campaignId }: ApiParams & { campaignId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/retry-failed`, {
    method: 'POST',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to retry failed devices for campaign ${campaignId}`);
}

// Permanently cancel a campaign (terminal, not resumable).
export async function cancelCampaign({ groupId, campaignId }: ApiParams & { campaignId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/cancel`, {
    method: 'POST',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to cancel campaign ${campaignId}`);
}

// Mark a campaign as completed (terminal).
export async function completeCampaign({ groupId, campaignId }: ApiParams & { campaignId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/complete`, {
    method: 'POST',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to complete campaign ${campaignId}`);
}

// Response type for paginated job fetching
export interface PaginatedJobsResponse {
  jobs: DeviceJob[];
  next: string | null;
  hasMore: boolean;
}

export async function fetchDeviceJobsForCampaign({ groupId, deviceIds }: ApiParams & { deviceIds: string[] }, opts?: ApiCallOptions): Promise<DeviceJob[]> {
  if (!deviceIds || deviceIds.length === 0) {
    return [];
  }
  const jobPromises = deviceIds.map(deviceId =>
    apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/device/${deviceId}/jobs`, {
      signal: opts?.signal ?? undefined,
    })
      .then(res => handleApiError(res, `Failed to fetch jobs for ${deviceId}`))
      .then((jobs: { list: DeviceJob[]; next?: string }) => jobs.list || [])
      .catch(err => {
        console.error(`Error fetching jobs for device ${deviceId}:`, err);
        return [];
      })
  );
  const results = await Promise.allSettled(jobPromises);
  return results
    .filter(result => result.status === 'fulfilled')
    .flatMap(result => (result as PromiseFulfilledResult<DeviceJob[]>).value);
}

// Paginated version for single device - supports fetching more jobs
export async function fetchDeviceJobsPaginated({ 
  groupId, 
  deviceId, 
  limit = 10, 
  bookmark 
}: ApiParams & { deviceId: string; limit?: number; bookmark?: string }, opts?: ApiCallOptions): Promise<PaginatedJobsResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (bookmark) params.set('bookmark', bookmark);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/device/${deviceId}/jobs${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  
  const data = await handleApiError(response, `Failed to fetch jobs for ${deviceId}`);
  
  return {
    jobs: data.list || [],
    next: data.next || null,
    hasMore: !!data.next,
  };
}

// Fetch ALL jobs for devices (handles pagination automatically)
// Use this when you need to get jobs for older campaigns that may not be in the last 10
export async function fetchAllDeviceJobs({
  groupId,
  deviceIds,
  targetCampaignId, // Optional: stop fetching once we find jobs for this campaign
}: ApiParams & { deviceIds: string[]; targetCampaignId?: string }, opts?: ApiCallOptions): Promise<DeviceJob[]> {
  if (!deviceIds || deviceIds.length === 0) {
    return [];
  }

  const allJobs: DeviceJob[] = [];

  // Fetch jobs for each device with pagination
  const fetchJobsForDevice = async (deviceId: string): Promise<DeviceJob[]> => {
    const deviceJobs: DeviceJob[] = [];
    let bookmark: string | undefined = undefined;
    let hasMore = true;
    let iterations = 0;
    const maxIterations = 10; // Safety limit to prevent infinite loops

    while (hasMore && iterations < maxIterations) {
      iterations++;
      const params = new URLSearchParams();
      params.set('limit', '20'); // Fetch 20 at a time
      if (bookmark) params.set('bookmark', bookmark);

      try {
        const response = await apiFetch(
          `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/device/${deviceId}/jobs?${params.toString()}`,
          {
            signal: opts?.signal ?? undefined,
          }
        );

        const data = await handleApiError(response, `Failed to fetch jobs for ${deviceId}`);
        // Inject deviceId as clientId if the API doesn't return it in the job object
        const jobs: DeviceJob[] = (data.list || []).map((job: DeviceJob) => ({
          ...job,
          clientId: job.clientId || job.status?.clientId || deviceId,
        }));
        deviceJobs.push(...jobs);

        // If we're looking for a specific campaign, check if we found it
        if (targetCampaignId) {
          const foundTargetJob = jobs.some((job: DeviceJob) => job.definition.launchID === targetCampaignId);
          if (foundTargetJob) {
            // We found jobs for the target campaign, stop fetching
            break;
          }
        }

        bookmark = data.next || undefined;
        hasMore = !!data.next;
      } catch (err) {
        console.error(`Error fetching jobs for device ${deviceId}:`, err);
        break;
      }
    }

    return deviceJobs;
  };

  // Fetch for all devices in parallel
  const results = await Promise.allSettled(deviceIds.map(fetchJobsForDevice));
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      allJobs.push(...result.value);
    }
  });

  return allJobs;
}

// Campaign-specific strategy operations
export async function fetchCampaignStrategy({ groupId, campaignId }: ApiParams & { campaignId: string }, opts?: ApiCallOptions): Promise<CampaignItem> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/strategy`, {
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to fetch strategy for campaign ${campaignId}`);
}

export async function updateCampaignStrategy({ groupId, campaignId, strategyData }: ApiParams & { campaignId: string; strategyData: Partial<ApiGlobalStrategy> }, opts?: ApiCallOptions): Promise<CampaignItem> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${campaignId}/strategy`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(strategyData),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to update strategy for campaign ${campaignId}`);
}

// Job transition API - used for phased workflows to transition jobs to the next state
export interface TransitionJobParams {
  jobId: string;
  state: string;
  message: string;
  progress?: number;
}

export async function transitionJob({ jobId, state, message, progress = 0 }: TransitionJobParams, opts?: ApiCallOptions): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/jobs/${jobId}/transition`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state,
      message,
      progress,
    }),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to transition job ${jobId} to ${state}`);
}

// Batch transition multiple jobs to a new state
export async function transitionJobs(
  jobs: Array<{ jobId: string; state: string; message: string; progress?: number }>,
  opts?: ApiCallOptions
): Promise<{ succeeded: string[]; failed: Array<{ jobId: string; error: string }> }> {
  const results = await Promise.allSettled(
    jobs.map(({ jobId, state, message, progress }) =>
      transitionJob({ jobId, state, message, progress }, opts)
        .then(() => ({ jobId, success: true as const }))
        .catch((error) => ({ jobId, success: false as const, error: error.message as string }))
    )
  );

  const succeeded: string[] = [];
  const failed: Array<{ jobId: string; error: string }> = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      succeeded.push(jobs[index].jobId);
    } else if (result.status === 'fulfilled' && !result.value.success) {
      const failedResult = result.value as { jobId: string; success: false; error: string };
      failed.push({ jobId: jobs[index].jobId, error: failedResult.error || 'Unknown error' });
    } else if (result.status === 'rejected') {
      failed.push({ jobId: jobs[index].jobId, error: result.reason?.message || 'Unknown error' });
    }
  });

  return { succeeded, failed };
}

// --- Device Inventory for Updates ---

/**
 * Fetch devices belonging to a DMS (for per-device SWU downloads).
 * GET /v1/dms/:dmsID/devices
 */
export async function fetchGroupDevices(
  { groupId }: ApiParams,
  opts?: ApiCallOptions
): Promise<DeviceListApiResponse> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/devices`;

  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to fetch devices for DMS ${groupId}`);
}

/**
 * Get the per-device SWU download URL.
 * GET /v1/dms/:dmsID/updatepacks/:name/swu/download/:deviceID
 */
export function getPerDeviceSwuDownloadUrl(groupId: string, packName: string, deviceId: string): string {
  return `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/swu/download/${encodeURIComponent(deviceId)}`;
}

/**
 * Download a per-device SWU file.
 */
export async function downloadPerDeviceSwu(
  { groupId, packName, deviceId }: ApiParams & { packName: string; deviceId: string },
  opts?: ApiCallOptions
): Promise<Blob> {
  const url = getPerDeviceSwuDownloadUrl(groupId, packName, deviceId);

  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to download SWU for device ${deviceId}. HTTP error ${response.status}`);
  }

  return response.blob();
}

// --- Artifacts (global, first-class — not pack-scoped) ---

/**
 * Fetch the artifacts a pack currently references (resolved through the pack<->artifact junction).
 * GET /v1/dms/:dmsID/updatepacks/:name/artifact-catalog
 */
export async function fetchArtifactCatalog(
  { groupId, packName }: ApiParams & { packName: string },
  opts?: ApiCallOptions
): Promise<Artifact[]> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifact-catalog`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch artifacts for pack ${packName}`);
  return data.list || [];
}

/**
 * Link an already-uploaded global artifact to a pack's current version (no re-upload).
 * POST /v1/groups/:groupId/updatepacks/:packName/artifact/link
 */
export async function linkArtifactToPack(
  { groupId, packName, artifactId }: ApiParams & { packName: string; artifactId: string },
  opts?: ApiCallOptions
): Promise<void> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifact/link`;
  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact_id: artifactId }),
    signal: opts?.signal ?? undefined,
  });
  await handleApiError(response, `Failed to link artifact to pack ${packName}`);
}

/**
 * Fetch all global artifacts (fleet-wide), each enriched with the packs that reference it.
 * GET /v1/artifacts
 */
export async function fetchAllArtifacts(options?: { name?: string; version?: string; pageSize?: number; bookmark?: string },
  opts?: ApiCallOptions
): Promise<{ list: Artifact[]; next: string | null }> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', String(options.pageSize));
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.name) params.append('filter', `name[ct]${options.name}`);
  if (options?.version) params.append('filter', `version[ct]${options.version}`);
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/artifacts${params.toString() ? '?' + params.toString() : ''}`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch artifacts');
  return { list: data.list || [], next: data.next || null };
}

/**
 * URL to download a global artifact's binary by id.
 * GET /v1/artifacts/:id/download
 */
export function getArtifactDownloadUrl(id: string): string {
  return `${get_CLIENT_UPDATES_API_BASE_URL()}/artifacts/${encodeURIComponent(id)}/download`;
}

/** Download a global artifact's binary blob by id. */
export async function downloadArtifact(
  { id }: { id: string },
  opts?: ApiCallOptions,
): Promise<Blob> {
  const response = await apiFetch(getArtifactDownloadUrl(id), {
    signal: opts?.signal ?? undefined,
  });
  if (!response.ok) {
    let detail = `HTTP error ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.err || detail;
    } catch { /* keep default */ }
    throw new Error(`Failed to download artifact ${id}: ${detail}`);
  }
  return response.blob();
}

/**
 * Upload a standalone global artifact (no pack context).
 * POST /v1/artifacts  (multipart: file, name, version)
 */
export async function uploadArtifact(
  { name, version, file }: { name: string; version: string; file: File },
  opts?: ApiCallOptions,
): Promise<Artifact> {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  form.append('version', version);
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/artifacts`, {
    method: 'POST',
    body: form,
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to upload artifact ${name}`);
  return data.artifact;
}

/** Delete a global artifact by id. DELETE /v1/artifacts/:id */
export async function deleteArtifact(
  { id }: { id: string },
  opts?: ApiCallOptions,
): Promise<void> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/artifacts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal: opts?.signal ?? undefined,
  });
  if (!response.ok && response.status !== 204) {
    await handleApiError(response, `Failed to delete artifact ${id}`);
  }
}

// --- Distribution set version snapshots ---

/**
 * Fetch the recorded version snapshots of an distribution set (newest first).
 * GET /v1/dms/:dmsID/updatepacks/:name/versions
 */
export async function fetchUpdatePackVersions(
  { groupId, packName }: ApiParams & { packName: string },
  opts?: ApiCallOptions
): Promise<{ list: UpdatePackVersion[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/versions`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch versions for pack ${packName}`);
  return { list: data.list || [], next: data.next || null };
}

/**
 * Fetch a pack's version snapshots by its unique ID, independent of device group. Works for
 * orphaned/empty-group packs that the group-scoped route can't address.
 * GET /v1/updatepacks/:id/versions
 */
export async function fetchUpdatePackVersionsById(
  { packId }: { packId: string },
  opts?: ApiCallOptions
): Promise<{ list: UpdatePackVersion[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/updatepacks/${encodeURIComponent(packId)}/versions`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch versions for pack ${packId}`);
  return { list: data.list || [], next: data.next || null };
}

/**
 * Delete a pack by its unique ID, independent of device group. The only way to remove
 * orphaned/empty-group packs (the group-scoped route collapses to /groups//...).
 * DELETE /v1/updatepacks/:id
 */
export async function deleteUpdatePackByIdApi(
  { packId }: { packId: string },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await apiFetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/updatepacks/${encodeURIComponent(packId)}`, {
    method: 'DELETE',
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to delete pack ${packId}`);
}

/**
 * URL to download a specific (current or previous) version of a shared/unencrypted pack's SWU.
 * Previous versions require the pack's allow_previous_version_download flag to be enabled.
 * GET /v1/dms/:dmsID/updatepacks/:name/swu/download/version/:version
 */
export function getSwuVersionDownloadUrl(groupId: string, packName: string, version: number | string): string {
  return `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/swu/download/version/${encodeURIComponent(String(version))}`;
}

/** Download a specific version of an distribution set's SWU. */
export async function downloadSwuVersion(
  { groupId, packName, version }: ApiParams & { packName: string; version: number | string },
  opts?: ApiCallOptions
): Promise<Blob> {
  const response = await apiFetch(getSwuVersionDownloadUrl(groupId, packName, version), {
    signal: opts?.signal ?? undefined,
  });
  if (!response.ok) {
    // Surface the backend's reason (e.g. previous-version download disabled).
    let detail = `HTTP error ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.err || detail;
    } catch { /* keep default */ }
    throw new Error(`Failed to download version ${version} of ${packName}: ${detail}`);
  }
  return response.blob();
}

// The signed version manifest + signature (PKCS7/CMS, signer cert embedded) for a pack version.
export interface VersionSignature {
  pack: string;
  version: string;
  algorithm?: string;
  certificate?: string; // PEM signing certificate
  manifest: string;     // exact signed JSON bytes
  signature: string;    // base64 PKCS7/CMS over `manifest`
  signed_at?: string;
  expires_at?: string;
}

/**
 * Fetch a version's signed manifest + signature (used to verify authenticity and enforce
 * anti-rollback/anti-freeze). GET /groups/:groupId/updatepacks/:name/versions/:version/signature
 */
export async function fetchVersionSignature(
  { groupId, packName, version }: ApiParams & { packName: string; version: string },
  opts?: ApiCallOptions
): Promise<VersionSignature> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/versions/${encodeURIComponent(version)}/signature`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to fetch signature for ${packName} v${version}`);
}

/** URL to download a version's artifacts as a .tar.gz (uniform for SWU and non-SWU). */
export function getVersionArtifactsArchiveUrl(groupId: string, packName: string, version: string): string {
  return `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/versions/${encodeURIComponent(version)}/artifacts-archive`;
}

/** Download a version's artifacts archive (.tar.gz of all the components that version references). */
export async function downloadVersionArtifactsArchive(
  { groupId, packName, version }: ApiParams & { packName: string; version: string },
  opts?: ApiCallOptions
): Promise<Blob> {
  const response = await apiFetch(getVersionArtifactsArchiveUrl(groupId, packName, version), {
    signal: opts?.signal ?? undefined,
  });
  if (!response.ok) {
    let detail = `HTTP error ${response.status}`;
    try { const body = await response.json(); detail = body?.err || detail; } catch { /* keep default */ }
    throw new Error(`Failed to download artifacts archive for ${packName} v${version}: ${detail}`);
  }
  return response.blob();
}

export interface FleetPackVersionsOptions {
  deviceId?: string;
  packName?: string;
  packaging?: string;
  pageSize?: number;
  bookmark?: string;
}

/**
 * Fetch update-pack versions across ALL devices (fleet-wide), with optional filters.
 * GET /v1/devices/packs
 */
export async function fetchAllDevicePackVersions(options?: FleetPackVersionsOptions,
  opts?: ApiCallOptions
): Promise<{ list: DevicePackVersion[]; next: string | null }> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', String(options.pageSize));
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.deviceId) params.append('filter', `device_id[ct]${options.deviceId}`);
  if (options?.packName) params.append('filter', `pack_name[ct]${options.packName}`);
  if (options?.packaging) params.append('filter', `packaging[eq]${options.packaging}`);

  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/packs${params.toString() ? '?' + params.toString() : ''}`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch fleet pack versions');
  return { list: data.list || [], next: data.next || null };
}

// --- Device update-pack inventory (pack-level tracking) ---

/**
 * Fetch the update-pack version(s) a device currently has. A device can hold many packs, each at
 * one current version. This is the primary device view.
 * GET /v1/devices/:deviceID/packs
 */
export async function fetchDevicePackVersions(
  { deviceId }: { deviceId: string },
  opts?: ApiCallOptions
): Promise<{ list: DevicePackVersion[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/packs`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch pack versions for device ${deviceId}`);
  return { list: data.list || [], next: data.next || null };
}

/**
 * Fetch a device's package inventory: each pack the device has, enriched with the artifacts that
 * pack delivers and the device's installed version of each. The consolidated device-software view.
 * GET /v1/devices/:deviceID/pack-inventory
 */
export async function fetchDevicePackInventory(
  { deviceId, pageSize, bookmark }: { deviceId: string; pageSize?: number; bookmark?: string },
  opts?: ApiCallOptions
): Promise<{ list: DevicePackWithArtifacts[]; next: string | null }> {
  const params = new URLSearchParams();
  if (pageSize) params.set('page_size', String(pageSize));
  if (bookmark) params.set('bookmark', bookmark);
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/pack-inventory${params.toString() ? '?' + params.toString() : ''}`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch pack inventory for device ${deviceId}`);
  return { list: data.list || [], next: data.next || null };
}

/**
 * Fetch a device's COMPLETE package inventory, following pagination until exhausted. Use this for
 * device views that must show every installed pack — the single-page fetch only returns the
 * backend's default page (a device can track more packs than fit in one page).
 */
export async function fetchAllDevicePackInventory(
  { deviceId, pageSize = 100 }: { deviceId: string; pageSize?: number },
  opts?: ApiCallOptions
): Promise<DevicePackWithArtifacts[]> {
  const all: DevicePackWithArtifacts[] = [];
  let bookmark: string | undefined;
  const maxIterations = 50; // Safety bound against a non-advancing bookmark
  for (let i = 0; i < maxIterations; i++) {
    const { list, next } = await fetchDevicePackInventory({ deviceId, pageSize, bookmark }, opts);
    all.push(...list);
    if (!next) break;
    bookmark = next;
  }
  return all;
}

/**
 * Fetch a device's pack-update history (newest first).
 * GET /v1/devices/:deviceID/pack-updates
 */
export async function fetchDevicePackUpdates(
  { deviceId, pageSize, bookmark }: { deviceId: string; pageSize?: number; bookmark?: string },
  opts?: ApiCallOptions
): Promise<{ list: DevicePackUpdate[]; next: string | null }> {
  const params = new URLSearchParams();
  if (pageSize) params.set('page_size', String(pageSize));
  if (bookmark) params.set('bookmark', bookmark);
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/pack-updates${params.toString() ? '?' + params.toString() : ''}`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch pack updates for device ${deviceId}`);
  return { list: data.list || [], next: data.next || null };
}

// ============================================================================
// Latest pack versions (per-group latest target) + force-sync
// ============================================================================

/**
 * Fetch a group's latest pack versions (the declared "latest" target).
 * GET /v1/groups/:groupID/latest-packs
 */
export async function getGroupLatestPacks(
  { groupId }: { groupId: string },
  opts?: ApiCallOptions
): Promise<{ list: GroupLatestPack[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${encodeURIComponent(groupId)}/latest-packs`;
  const response = await apiFetch(url, { signal: opts?.signal ?? undefined });
  const data = await handleApiError(response, `Failed to fetch latest packs for group ${groupId}`);
  return { list: data.list || [], next: data.next || null };
}

/**
 * Set a pack's latest version for a group.
 * PUT /v1/groups/:groupID/latest-packs/:packID  body: { version }
 */
export async function setGroupLatestPack(
  { groupId, packId, version }: { groupId: string; packId: string; version: string },
  opts?: ApiCallOptions
): Promise<GroupLatestPack> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${encodeURIComponent(groupId)}/latest-packs/${encodeURIComponent(packId)}`;
  const response = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to set latest version for pack ${packId}`);
}

/**
 * Remove a group's latest-version record for a pack.
 * DELETE /v1/groups/:groupID/latest-packs/:packID
 */
export async function deleteGroupLatestPack(
  { groupId, packId }: { groupId: string; packId: string },
  opts?: ApiCallOptions
): Promise<void> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${encodeURIComponent(groupId)}/latest-packs/${encodeURIComponent(packId)}`;
  const response = await apiFetch(url, { method: 'DELETE', signal: opts?.signal ?? undefined });
  await handleApiError(response, `Failed to remove latest version for pack ${packId}`);
}

/**
 * Get how a device's installed pack versions compare to its group's latest versions.
 * GET /v1/devices/:deviceID/latest-drift[?groupID=]
 */
export async function getDeviceLatestDrift(
  { deviceId, groupId }: { deviceId: string; groupId?: string },
  opts?: ApiCallOptions
): Promise<DeviceLatestDrift> {
  const qs = groupId ? `?groupID=${encodeURIComponent(groupId)}` : '';
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/latest-drift${qs}`;
  const response = await apiFetch(url, { signal: opts?.signal ?? undefined });
  return handleApiError(response, `Failed to fetch latest drift for device ${deviceId}`);
}

/**
 * Force a device to match its group's latest pack versions. Jobs run asynchronously on the devices;
 * returns the pre-sync drift snapshot.
 * POST /v1/devices/:deviceID/sync-to-latest  body: { groupID?, pack_ids?, workflow? }
 */
export async function syncDeviceToLatest(
  { deviceId, groupId, packIds, workflow }: { deviceId: string; groupId?: string; packIds?: string[]; workflow?: string },
  opts?: ApiCallOptions
): Promise<DeviceLatestDrift> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/sync-to-latest`;
  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupID: groupId, pack_ids: packIds, workflow }),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to sync device ${deviceId} to latest versions`);
}

// ============================================================================
// Latest-version compliance + per-device launch to an exact version
// ============================================================================

/**
 * Devices in a group that are not on the latest version of one or more packs.
 * GET /v1/groups/:groupID/version-compliance
 */
export async function getGroupVersionCompliance(
  { groupId }: { groupId: string },
  opts?: ApiCallOptions
): Promise<GroupVersionCompliance> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${encodeURIComponent(groupId)}/version-compliance`;
  const response = await apiFetch(url, { signal: opts?.signal ?? undefined });
  return handleApiError(response, `Failed to fetch version compliance for group ${groupId}`);
}

/**
 * Full per-device version matrix for a group: every tracked (device, pack) with the device's
 * installed version vs the pack's latest (compliant rows included).
 * GET /v1/groups/:groupID/version-status
 */
export async function getGroupVersionStatus(
  { groupId }: { groupId: string },
  opts?: ApiCallOptions
): Promise<GroupVersionStatus> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${encodeURIComponent(groupId)}/version-status`;
  const response = await apiFetch(url, { signal: opts?.signal ?? undefined });
  return handleApiError(response, `Failed to fetch version status for group ${groupId}`);
}

/**
 * Launch a single-device update to an exact pack version.
 * POST /v1/devices/:deviceID/force-version  body: { update_pack_id, version, group_id?, workflow? }
 */
export async function forceDeviceVersion(
  { deviceId, updatePackId, version, groupId, workflow }: { deviceId: string; updatePackId: string; version: string; groupId?: string; workflow?: string },
  opts?: ApiCallOptions
): Promise<{ status: string; device_id: string; update_pack_id: string; version: string }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/force-version`;
  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_pack_id: updatePackId, version, group_id: groupId, workflow }),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to launch update for device ${deviceId}`);
}

/**
 * Fetch available wfx workflows from the updates API.
 * Returns the list of workflow definitions (name + description).
 */
export interface WfxWorkflow {
  name: string;
  description: string;
  states?: Array<{ name: string; description: string }>;
  transitions?: Array<{ from: string; to: string; eligible: string; description: string; action?: string }>;
  groups?: Array<{ name: string; description: string; states: string[] }>;
}

export async function fetchWorkflows(opts?: ApiCallOptions
): Promise<WfxWorkflow[]> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/workflows`;
  const response = await apiFetch(url, {
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch workflows');
  // wfx API wraps the list in a "content" field with pagination metadata
  return data.content || data.list || (Array.isArray(data) ? data : []);
}

