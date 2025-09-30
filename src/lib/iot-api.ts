// src/lib/iot-api.ts
'use client';

import { get_DMS_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import type { UpdatePack, ApiGlobalStrategy, LaunchItem, DeviceJob } from '@/types/iot';


// A helper function to get the correct base URL for the updates API.
const getUpdatesApiBaseUrl = () => {
    const dmsBase = get_DMS_MANAGER_API_BASE_URL();
    // Replaces `/dmsmanager/v1` with `/updates` as per the requirement.
    return dmsBase.replace('/dmsmanager/v1', '/updates');
};


export const DMS_ID_FOR_API = 'ECS_DEMO';

interface ApiParams {
    dmsId: string;
    accessToken: string;
}

export async function fetchUpdatePacks({ dmsId, accessToken }: ApiParams): Promise<UpdatePack[]> {
  const response = await fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/updatepacks`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const data = await handleApiError(response, 'Failed to fetch update packs');
  return data.list || [];
}

export async function deleteUpdatePackApi({ dmsId, packName, accessToken }: ApiParams & { packName: string }): Promise<any> {
  const response = await fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/updatepacks/${packName}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return handleApiError(response, `Failed to delete pack ${packName}`);
}

export async function fetchGlobalStrategy({ dmsId, accessToken }: ApiParams): Promise<ApiGlobalStrategy | null> {
  const response = await fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/strategy`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (response.status === 404) {
    return null;
  }
  return handleApiError(response, 'Failed to fetch global strategy');
}

export async function updateGlobalStrategy({ dmsId, strategyData, accessToken }: ApiParams & { strategyData: Partial<ApiGlobalStrategy> }): Promise<ApiGlobalStrategy> {
  const response = await fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/strategy`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(strategyData),
  });
  return handleApiError(response, 'Failed to update global strategy');
}

export async function fetchCurrentLaunches({ dmsId, accessToken }: ApiParams): Promise<LaunchItem[]> {
  const response = await fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/launch`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const data = await handleApiError(response, 'Failed to fetch launches');
  return data.list || [];
}

export async function triggerGlobalLaunchApi({ dmsId, accessToken }: ApiParams): Promise<any> {
  const response = await fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/launch`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return handleApiError(response, 'Failed to trigger global launch');
}

export async function triggerItemRollout({ dmsId, launchId, accessToken }: ApiParams & { launchId: string }): Promise<any> {
  const response = await fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/launch/${launchId}/rollout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return handleApiError(response, `Failed to trigger rollout for item ${launchId}`);
}

export async function fetchDeviceJobsForLaunch({ dmsId, deviceIds, accessToken }: ApiParams & { deviceIds: string[] }): Promise<DeviceJob[]> {
  if (!deviceIds || deviceIds.length === 0) {
    return [];
  }
  const jobPromises = deviceIds.map(deviceId =>
    fetch(`${getUpdatesApiBaseUrl()}/dms/${dmsId}/device/${deviceId}/jobs`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
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
