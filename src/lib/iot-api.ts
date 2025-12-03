
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

export async function fetchUpdatePacks({ dmsId, accessToken }: ApiParams, opts?: ApiCallOptions): Promise<UpdatePack[]> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/updatepacks`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  const data = await handleApiError(response, 'Failed to fetch update packs');
  return data.list || [];
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

export async function fetchGlobalStrategy({ dmsId, accessToken }: ApiParams, opts?: ApiCallOptions): Promise<ApiGlobalStrategy | null> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/strategy`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  if (response.status === 404) {
    return null;
  }
  return handleApiError(response, 'Failed to fetch global strategy');
}

export async function updateGlobalStrategy({ dmsId, strategyData, accessToken }: ApiParams & { strategyData: Partial<ApiGlobalStrategy> }, opts?: ApiCallOptions): Promise<ApiGlobalStrategy> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/strategy`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(strategyData),
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, 'Failed to update global strategy');
}

export async function fetchCurrentLaunches({ dmsId, accessToken }: ApiParams, opts?: ApiCallOptions): Promise<LaunchListResponse> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch`, {
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

export async function triggerGlobalLaunchApi({ dmsId, accessToken, strategyConfig }: ApiParams & { strategyConfig?: Partial<ApiGlobalStrategy> }, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: strategyConfig ? JSON.stringify(strategyConfig) : undefined,
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, 'Failed to trigger global launch');
}

export async function triggerItemRollout({ dmsId, launchId, accessToken }: ApiParams & { launchId: string }, opts?: ApiCallOptions): Promise<any> {
  const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/launch/${launchId}/rollout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: opts?.signal ?? undefined,
  });
  return handleApiError(response, `Failed to trigger rollout for item ${launchId}`);
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
      .then((jobs: { list: DeviceJob[] }) => jobs.list || [])
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
