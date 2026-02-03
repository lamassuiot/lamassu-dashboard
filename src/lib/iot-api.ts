
// src/lib/iot-api.ts
'use client';

import { get_CLIENT_UPDATES_API_BASE_URL, handleApiError } from './api-domains';
import type { UpdatePack, ApiGlobalStrategy, LaunchItem, DeviceJob, LaunchListResponse } from '@/types/iot';


export interface ApiParams {
    dmsId: string;
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
  { dmsId, accessToken }: ApiParams, 
  options?: FetchUpdatePacksOptions,
  opts?: ApiCallOptions
): Promise<UpdatePacksResponse> {
  const params = new URLSearchParams();
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());
  if (options?.bookmark) params.set('bookmark', options.bookmark);
  if (options?.sortBy) params.set('sort_by', options.sortBy);
  if (options?.sortMode) params.set('sort_mode', options.sortMode);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/updatepacks${params.toString() ? '?' + params.toString() : ''}`;
  
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

// Legacy function for backward compatibility
export async function fetchUpdatePacksLegacy({ dmsId, accessToken }: ApiParams, opts?: ApiCallOptions): Promise<UpdatePack[]> {
  const response = await fetchUpdatePacks({ dmsId, accessToken }, { pageSize: 50 }, opts);
  return response.list;
}

export async function deleteUpdatePackApi({ dmsId, packName, accessToken }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/updatepacks/${packName}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to delete pack ${packName}`);
}

export async function fetchUpdatePackArtifacts({ dmsId, packName, accessToken }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<string[]> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/updatepacks/${packName}/artifacts`, {
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
  } catch (error) {
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

export async function fetchUpdatePackDescriptor({ dmsId, packName, accessToken }: ApiParams & { packName: string }, opts?: ApiCallOptions): Promise<string> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/updatepacks/${packName}/descriptor`, {
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
  } catch (error) {
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

export async function fetchCurrentLaunches({ dmsId, accessToken, limit, bookmark }: ApiParams & { limit?: number; bookmark?: string }, opts?: ApiCallOptions): Promise<LaunchListResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (bookmark) params.set('bookmark', bookmark);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch${params.toString() ? '?' + params.toString() : ''}`;

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

export async function fetchLaunchDetails({ dmsId, accessToken, launchId }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<LaunchItem | null> {
  let bookmark: string | undefined = undefined;
  let hasMore = true;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const response: LaunchListResponse = await fetchCurrentLaunches({ dmsId, accessToken, limit: 20, bookmark }, opts);
    
    if (response.list) {
      const found = response.list.find(l => l.id === launchId);
      if (found) return found;
    }
    
    bookmark = response.next || undefined;
    hasMore = !!response.next;
  }
  
  return null;
}

export async function fetchAllLaunches({ dmsId, accessToken }: ApiParams, opts?: ApiCallOptions): Promise<LaunchItem[]> {
  const allLaunches: LaunchItem[] = [];
  let bookmark: string | undefined = undefined;
  let hasMore = true;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const response: LaunchListResponse = await fetchCurrentLaunches({ dmsId, accessToken, limit: 20, bookmark }, opts);
    
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
  dmsId,
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
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch?${params.toString()}`;
  
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
}

export async function createLaunch({ dmsId, accessToken, launchData }: ApiParams & { launchData: CreateLaunchPayload }, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(launchData),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, 'Failed to create launch');
}

// Deprecated: Use createLaunch instead
export const triggerGlobalLaunchApi = createLaunch;

export async function triggerItemRollout({ dmsId, launchId, accessToken }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch/${launchId}/rollout`, {
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

export async function fetchDeviceJobsForLaunch({ dmsId, deviceIds, accessToken }: ApiParams & { deviceIds: string[] }, opts?: ApiCallOptions): Promise<DeviceJob[]> {
  if (!deviceIds || deviceIds.length === 0) {
    return [];
  }
  const jobPromises = deviceIds.map(deviceId =>
    fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/device/${deviceId}/jobs`, {
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
  dmsId, 
  deviceId, 
  accessToken, 
  limit = 10, 
  bookmark 
}: ApiParams & { deviceId: string; limit?: number; bookmark?: string }, opts?: ApiCallOptions): Promise<PaginatedJobsResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (bookmark) params.set('bookmark', bookmark);
  
  const url = `${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/device/${deviceId}/jobs${params.toString() ? '?' + params.toString() : ''}`;
  
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
  dmsId, 
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
          `${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/device/${deviceId}/jobs?${params.toString()}`,
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
export async function fetchLaunchStrategy({ dmsId, launchId, accessToken }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<LaunchItem> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch/${launchId}/strategy`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to fetch strategy for launch ${launchId}`);
}

export async function updateLaunchStrategy({ dmsId, launchId, strategyData, accessToken }: ApiParams & { launchId: string; strategyData: Partial<ApiGlobalStrategy> }, opts?: ApiCallOptions): Promise<LaunchItem> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch/${launchId}/strategy`, {
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
