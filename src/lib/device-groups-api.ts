import { get_DEV_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import { requireAccessToken } from './auth-session';
import type {
  DeviceGroup,
  CreateDeviceGroupBody,
  UpdateDeviceGroupBody,
  GetDeviceGroupsResponse,
  DeviceGroupStats,
  GetDevicesByGroupResponse,
} from '@/types/device-group';

/**
 * Get all device groups with optional filtering and pagination
 */
export async function getDeviceGroups(
  params?: {
    pageSize?: number;
    bookmark?: string;
    sortBy?: string;
    sortMode?: 'asc' | 'desc';
    filter?: string;
  }
): Promise<GetDeviceGroupsResponse> {
  const accessToken = requireAccessToken();
  const queryParams = new URLSearchParams();
  
  if (params?.pageSize) queryParams.append('limit', params.pageSize.toString());
  if (params?.bookmark) queryParams.append('bookmark', params.bookmark);
  if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
  if (params?.sortMode) queryParams.append('sort_mode', params.sortMode);
  if (params?.filter) queryParams.append('filter', params.filter);

  const response = await fetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return handleApiError(response, 'Failed to fetch device groups');
}

/**
 * Get a specific device group by ID
 */
export async function getDeviceGroupByID(
  id: string
): Promise<DeviceGroup> {
  const accessToken = requireAccessToken();
  const response = await fetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${id}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return handleApiError(response, 'Failed to fetch device group');
}

/**
 * Create a new device group
 */
export async function createDeviceGroup(
  body: CreateDeviceGroupBody
): Promise<DeviceGroup> {
  const accessToken = requireAccessToken();
  const response = await fetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  return handleApiError(response, 'Failed to create device group');
}

/**
 * Update an existing device group
 */
export async function updateDeviceGroup(
  id: string,
  body: UpdateDeviceGroupBody
): Promise<DeviceGroup> {
  const accessToken = requireAccessToken();
  const response = await fetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${id}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  return handleApiError(response, 'Failed to update device group');
}

/**
 * Delete a device group
 */
export async function deleteDeviceGroup(
  id: string
): Promise<void> {
  const accessToken = requireAccessToken();
  const response = await fetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${id}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    await handleApiError(response, 'Failed to delete device group');
  }
}

/**
 * Get devices belonging to a group (with hierarchy resolution)
 */
export async function getDevicesByGroup(
  groupId: string,
  params?: {
    pageSize?: number;
    bookmark?: string;
    sortBy?: string;
    sortMode?: 'asc' | 'desc';
    filters?: string[];
  }
): Promise<GetDevicesByGroupResponse> {
  const accessToken = requireAccessToken();
  const queryParams = new URLSearchParams();
  
  if (params?.pageSize) queryParams.append('limit', params.pageSize.toString());
  if (params?.bookmark) queryParams.append('bookmark', params.bookmark);
  if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
  if (params?.sortMode) queryParams.append('sort_mode', params.sortMode);
  if (params?.filters) {
    params.filters.forEach(filter => queryParams.append('filter', filter));
  }

  const response = await fetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${groupId}/devices?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return handleApiError(response, 'Failed to fetch group devices');
}

/**
 * Get statistics for a device group
 */
export async function getDeviceGroupStats(
  groupId: string
): Promise<DeviceGroupStats> {
  const accessToken = requireAccessToken();
  const response = await fetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${groupId}/stats`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return handleApiError(response, 'Failed to fetch group statistics');
}
