
// src/lib/iot-api.ts
'use client';

import { get_CLIENT_UPDATES_API_BASE_URL, handleApiError } from './api-domains';
import type { UpdatePack, ApiCreateUpdatePackPayload, ApiGlobalStrategy, LaunchItem, DeviceJob, LaunchListResponse, DeviceListApiResponse, UpdatePackVersion, Artifact, DevicePackVersion, DevicePackUpdate, DevicePackWithArtifacts, LaunchPrecondition, PreconditionFailure } from '@/types/iot';


export interface ApiParams {
    groupId: string;
    accessToken: string;
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
  { groupId, accessToken }: ApiParams, 
  options?: FetchUpdatePacksOptions,
  opts?: ApiCallOptions
): Promise<UpdatePacksResponse> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.sortBy) params.set('sort_by', options.sortBy);
  if (options?.sortMode) params.set('sort_mode', options.sortMode);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch update packs');
  
  return {
    list: data.list || [],
    next: data.next || null
  };
}

/**
 * Fetch every update pack across all device groups (fleet-wide, not group-scoped).
 * Surfaces packs orphaned by a deleted device group or a group-ID change after a
 * lamassuiot re-run — these never appear in the per-group listing.
 * GET /v1/updatepacks
 */
export async function fetchAllUpdatePacks(
  { accessToken }: { accessToken: string },
  options?: FetchUpdatePacksOptions,
  opts?: ApiCallOptions
): Promise<UpdatePacksResponse> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.sortBy) params.set('sort_by', options.sortBy);
  if (options?.sortMode) params.set('sort_mode', options.sortMode);

  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/updatepacks${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch all update packs');

  return {
    list: data.list || [],
    next: data.next || null,
  };
}

// Legacy function for backward compatibility
export async function fetchUpdatePacksLegacy({ groupId, accessToken }: ApiParams, opts?: ApiCallOptions): Promise<UpdatePack[]> {
  const response = await fetchUpdatePacks({ groupId, accessToken }, { pageSize: 50 }, opts);
  return response.list;
}

export async function deleteUpdatePackApi({ groupId, packName, accessToken }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to delete pack ${packName}`);
}

/**
 * Create a new update pack (the "repo"). Lightweight: just the pack metadata — artifacts are
 * uploaded and an SWU is built afterwards on the pack-details page.
 * POST /groups/:groupId/updatepacks
 */
export async function createUpdatePack(
  { groupId, accessToken, payload }: ApiParams & { payload: ApiCreateUpdatePackPayload },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, 'Failed to create update pack');
}

/**
 * Create a new VERSION of an existing pack (bumps the version, ready for fresh artifacts + SWU).
 * POST /groups/:groupId/updatepacks/:packName/new
 */
export async function createUpdatePackVersion(
  { groupId, packName, accessToken, version }: ApiParams & { packName: string; version: string },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
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
  { groupId, packName, accessToken, payload }: ApiParams & { packName: string; payload?: GeneratePackagePayload },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
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
  { groupId, packName, accessToken, file }: ApiParams & { packName: string; file: File },
  opts?: ApiCallOptions
): Promise<any> {
  const fd = new FormData();
  fd.append('file', file);
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/descriptor/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { groupId, packName, accessToken, userId, payload }: ApiParams & { packName: string; userId: string; payload: GenerateSwuPayload },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/swu?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to generate SWU for pack ${packName}`);
}

export async function fetchArtifacts({ groupId, packName, accessToken }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<string[]> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifacts`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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

export async function fetchUpdatePackDescriptor({ groupId, packName, accessToken }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<string> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/descriptor`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
// Strategy is now configured per-launch only

export async function fetchCurrentLaunches({ groupId, accessToken, limit, bookmark }: ApiParams & { limit?: number; bookmark?: string }, opts?: ApiCallOptions): Promise<LaunchListResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (bookmark) params.set('bookmark', bookmark);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch launches');
  
  // If active_launches is not provided by API, compute it from the jobs
  let activeLaunches = data.active_launches || [];
  
  // If not provided, extract from jobs with OPEN workflow group states
  if (!data.active_launches && data.list && Array.isArray(data.list)) {
    const activeStates = ['INSTALL', 'INSTALLING', 'INSTALLED', 'ACTIVATE', 'ACTIVATING'];
    activeLaunches = data.list
      .filter((job: any) => job.status?.state && activeStates.includes(job.status.state))
      .map((job: any) => job.clientId || job.status?.clientId)
      .filter((id: string | undefined) => id !== undefined);
  }
  
  return {
    next: data.next || null,
    list: data.list || [],
    active_launches: activeLaunches
  };
}

export async function fetchLaunchDetails({ groupId, accessToken, launchId }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<LaunchItem | null> {
  let bookmark: string | undefined = undefined;
  let hasMore = true;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const response: LaunchListResponse = await fetchCurrentLaunches({ groupId, accessToken, limit: 20, bookmark }, opts);
    
    if (response.list) {
      const found = response.list.find(l => l.id === launchId);
      if (found) return found;
    }
    
    bookmark = response.next || undefined;
    hasMore = !!response.next;
  }
  
  return null;
}

export async function fetchAllLaunches({ groupId, accessToken }: ApiParams, opts?: ApiCallOptions): Promise<LaunchItem[]> {
  const allLaunches: LaunchItem[] = [];
  let bookmark: string | undefined = undefined;
  let hasMore = true;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const response: LaunchListResponse = await fetchCurrentLaunches({ groupId, accessToken, limit: 20, bookmark }, opts);
    
    if (response.list) {
      allLaunches.push(...response.list);
    }
    
    bookmark = response.next || undefined;
    hasMore = !!response.next;
  }
  
  return allLaunches;
}

// Fetch launches filtered by update pack ID
export async function fetchLaunchesByUpdatePack({
  groupId,
  accessToken,
  updatePackId,
  pageSize = 50,
  sortBy = 'exec_date',
  sortMode = 'desc',
  bookmark
}: ApiParams & {
  updatePackId: string;
  pageSize?: number;
  sortBy?: string;
  sortMode?: 'asc' | 'desc';
  bookmark?: string;
}, opts?: ApiCallOptions): Promise<LaunchListResponse> {
  const params = new URLSearchParams();
  if (pageSize) params.set('page_size', pageSize.toString());
  if (sortBy) params.set('sort_by', sortBy);
  if (sortMode) params.set('sort_mode', sortMode);
  if (bookmark) params.set('bookmark', bookmark);
  params.set('filter', `update_pack_id[eq]${updatePackId}`);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch?${params.toString()}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  
  const data = await handleApiError(response, 'Failed to fetch launches for update pack');
  
  return {
    next: data.next || null,
    list: data.list || [],
    active_launches: data.active_launches || []
  };
}

// Fetch jobs by launch ID directly
export async function fetchJobsByLaunch({
  launchId,
  accessToken,
  pageSize = 50,
  bookmark
}: {
  launchId: string;
  accessToken: string;
  pageSize?: number;
  bookmark?: string;
}, opts?: ApiCallOptions): Promise<{ list: DeviceJob[]; next: string | null }> {
  const params = new URLSearchParams();
  if (pageSize) params.set('page_size', pageSize.toString());
  if (bookmark) params.set('bookmark', bookmark);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/launch/${launchId}/jobs${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  
  const data = await handleApiError(response, `Failed to fetch jobs for launch ${launchId}`);
  
  return {
    list: data.list || [],
    next: data.next || null
  };
}

// Launch creation payload - all strategy fields are now required
export interface CreateLaunchPayload {
  update_pack_name: string;
  workflow_type: 'wfx.workflow.dau.direct' | 'wfx.workflow.dau.phased';
  rollout_type: 'numeric' | 'percentage';
  rollout_value: number;
  test_device_id?: string;
  auto?: boolean;
  approval_threshold?: number; // % of batch that must succeed before next batch (auto only)
  error_threshold?: number; // % of all devices that can fail before aborting (auto only)
  // Launch preconditions (optional; omit/empty = no gating)
  preconditions?: LaunchPrecondition[];
  force_preconditions?: boolean;
}

export async function createLaunch({ groupId, accessToken, launchData, dryRun }: ApiParams & { launchData: CreateLaunchPayload; dryRun?: boolean }, opts?: ApiCallOptions): Promise<any> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch${dryRun ? '?dry_run=true' : ''}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(launchData),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, dryRun ? 'Failed to evaluate launch preconditions' : 'Failed to create launch');
}

// Deprecated: Use createLaunch instead
export const triggerGlobalLaunchApi = createLaunch;

export async function triggerItemRollout({ groupId, launchId, accessToken }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${launchId}/rollout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to trigger rollout for item ${launchId}`);
}

// Response type for paginated job fetching
export interface PaginatedJobsResponse {
  jobs: DeviceJob[];
  next: string | null;
  hasMore: boolean;
}

export async function fetchDeviceJobsForLaunch({ groupId, deviceIds, accessToken }: ApiParams & { deviceIds: string[] }, opts?: ApiCallOptions): Promise<DeviceJob[]> {
  if (!deviceIds || deviceIds.length === 0) {
    return [];
  }
  const jobPromises = deviceIds.map(deviceId =>
    fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/device/${deviceId}/jobs`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
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
  accessToken, 
  limit = 10, 
  bookmark 
}: ApiParams & { deviceId: string; limit?: number; bookmark?: string }, opts?: ApiCallOptions): Promise<PaginatedJobsResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (bookmark) params.set('bookmark', bookmark);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/device/${deviceId}/jobs${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
// Use this when you need to get jobs for older launches that may not be in the last 10
export async function fetchAllDeviceJobs({ 
  groupId, 
  deviceIds, 
  accessToken,
  targetLaunchId, // Optional: stop fetching once we find jobs for this launch
}: ApiParams & { deviceIds: string[]; targetLaunchId?: string }, opts?: ApiCallOptions): Promise<DeviceJob[]> {
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
        const response = await fetch(
          `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/device/${deviceId}/jobs?${params.toString()}`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: opts?.signal ?? undefined,
          }
        );

        const data = await handleApiError(response, `Failed to fetch jobs for ${deviceId}`);
        const jobs = data.list || [];
        deviceJobs.push(...jobs);

        // If we're looking for a specific launch, check if we found it
        if (targetLaunchId) {
          const foundTargetJob = jobs.some((job: DeviceJob) => job.definition.launchID === targetLaunchId);
          if (foundTargetJob) {
            // We found jobs for the target launch, stop fetching
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

// Launch-specific strategy operations (new routes)
export async function fetchLaunchStrategy({ groupId, launchId, accessToken }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<LaunchItem> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${launchId}/strategy`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to fetch strategy for launch ${launchId}`);
}

export async function updateLaunchStrategy({ groupId, launchId, strategyData, accessToken }: ApiParams & { launchId: string; strategyData: Partial<ApiGlobalStrategy> }, opts?: ApiCallOptions): Promise<LaunchItem> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/launch/${launchId}/strategy`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(strategyData),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to update strategy for launch ${launchId}`);
}

// Job transition API - used for phased workflows to transition jobs to the next state
export interface TransitionJobParams {
  jobId: string;
  state: string;
  message: string;
  progress?: number;
  accessToken: string;
}

export async function transitionJob({ jobId, state, message, progress = 0, accessToken }: TransitionJobParams, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/jobs/${jobId}/transition`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
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
  accessToken: string,
  opts?: ApiCallOptions
): Promise<{ succeeded: string[]; failed: Array<{ jobId: string; error: string }> }> {
  const results = await Promise.allSettled(
    jobs.map(({ jobId, state, message, progress }) =>
      transitionJob({ jobId, state, message, progress, accessToken }, opts)
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
  { groupId, accessToken }: ApiParams,
  opts?: ApiCallOptions
): Promise<DeviceListApiResponse> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/devices`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { groupId, packName, deviceId, accessToken }: ApiParams & { packName: string; deviceId: string },
  opts?: ApiCallOptions
): Promise<Blob> {
  const url = getPerDeviceSwuDownloadUrl(groupId, packName, deviceId);

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { groupId, packName, accessToken }: ApiParams & { packName: string },
  opts?: ApiCallOptions
): Promise<Artifact[]> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifact-catalog`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch artifacts for pack ${packName}`);
  return data.list || [];
}

/**
 * Fetch all global artifacts (fleet-wide), each enriched with the packs that reference it.
 * GET /v1/artifacts
 */
export async function fetchAllArtifacts(
  { accessToken }: { accessToken: string },
  options?: { name?: string; version?: string; pageSize?: number; bookmark?: string },
  opts?: ApiCallOptions
): Promise<{ list: Artifact[]; next: string | null }> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', String(options.pageSize));
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.name) params.append('filter', `name[ct]${options.name}`);
  if (options?.version) params.append('filter', `version[ct]${options.version}`);
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/artifacts${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { id, accessToken }: { id: string; accessToken: string },
  opts?: ApiCallOptions,
): Promise<Blob> {
  const response = await fetch(getArtifactDownloadUrl(id), {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { name, version, file, accessToken }: { name: string; version: string; file: File; accessToken: string },
  opts?: ApiCallOptions,
): Promise<Artifact> {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  form.append('version', version);
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/artifacts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: form,
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to upload artifact ${name}`);
  return data.artifact;
}

/** Delete a global artifact by id. DELETE /v1/artifacts/:id */
export async function deleteArtifact(
  { id, accessToken }: { id: string; accessToken: string },
  opts?: ApiCallOptions,
): Promise<void> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/artifacts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  if (!response.ok && response.status !== 204) {
    await handleApiError(response, `Failed to delete artifact ${id}`);
  }
}

// --- Update pack version snapshots ---

/**
 * Fetch the recorded version snapshots of an update pack (newest first).
 * GET /v1/dms/:dmsID/updatepacks/:name/versions
 */
export async function fetchUpdatePackVersions(
  { groupId, packName, accessToken }: ApiParams & { packName: string },
  opts?: ApiCallOptions
): Promise<{ list: UpdatePackVersion[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/versions`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { packId, accessToken }: { packId: string; accessToken: string },
  opts?: ApiCallOptions
): Promise<{ list: UpdatePackVersion[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/updatepacks/${encodeURIComponent(packId)}/versions`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { packId, accessToken }: { packId: string; accessToken: string },
  opts?: ApiCallOptions
): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/updatepacks/${encodeURIComponent(packId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
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

/** Download a specific version of an update pack's SWU. */
export async function downloadSwuVersion(
  { groupId, packName, version, accessToken }: ApiParams & { packName: string; version: number | string },
  opts?: ApiCallOptions
): Promise<Blob> {
  const response = await fetch(getSwuVersionDownloadUrl(groupId, packName, version), {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { groupId, packName, version, accessToken }: ApiParams & { packName: string; version: string },
  opts?: ApiCallOptions
): Promise<VersionSignature> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/versions/${encodeURIComponent(version)}/signature`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { groupId, packName, version, accessToken }: ApiParams & { packName: string; version: string },
  opts?: ApiCallOptions
): Promise<Blob> {
  const response = await fetch(getVersionArtifactsArchiveUrl(groupId, packName, version), {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
export async function fetchAllDevicePackVersions(
  { accessToken }: { accessToken: string },
  options?: FleetPackVersionsOptions,
  opts?: ApiCallOptions
): Promise<{ list: DevicePackVersion[]; next: string | null }> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', String(options.pageSize));
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.deviceId) params.append('filter', `device_id[ct]${options.deviceId}`);
  if (options?.packName) params.append('filter', `pack_name[ct]${options.packName}`);
  if (options?.packaging) params.append('filter', `packaging[eq]${options.packaging}`);

  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/packs${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { deviceId, accessToken }: { deviceId: string; accessToken: string },
  opts?: ApiCallOptions
): Promise<{ list: DevicePackVersion[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/packs`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  { deviceId, accessToken }: { deviceId: string; accessToken: string },
  opts?: ApiCallOptions
): Promise<{ list: DevicePackWithArtifacts[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/pack-inventory`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch pack inventory for device ${deviceId}`);
  return { list: data.list || [], next: data.next || null };
}

/**
 * Fetch a device's pack-update history (newest first).
 * GET /v1/devices/:deviceID/pack-updates
 */
export async function fetchDevicePackUpdates(
  { deviceId, accessToken }: { deviceId: string; accessToken: string },
  opts?: ApiCallOptions
): Promise<{ list: DevicePackUpdate[]; next: string | null }> {
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/devices/${encodeURIComponent(deviceId)}/pack-updates`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, `Failed to fetch pack updates for device ${deviceId}`);
  return { list: data.list || [], next: data.next || null };
}

