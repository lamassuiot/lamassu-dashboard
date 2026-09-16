import { get_DEV_MANAGER_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';
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
  const queryParams = new URLSearchParams();
  
  if (params?.pageSize) queryParams.append('limit', params.pageSize.toString());
  if (params?.bookmark) queryParams.append('bookmark', params.bookmark);
  if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
  if (params?.sortMode) queryParams.append('sort_mode', params.sortMode);
  if (params?.filter) queryParams.append('filter', params.filter);

  const response = await apiFetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
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
  const response = await apiFetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${id}`,
    {
      method: 'GET',
      headers: {
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
  const response = await apiFetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups`,
    {
      method: 'POST',
      headers: {
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
  const response = await apiFetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${id}`,
    {
      method: 'PUT',
      headers: {
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
  const response = await apiFetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${id}`,
    {
      method: 'DELETE',
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
  const queryParams = new URLSearchParams();
  
  if (params?.pageSize) queryParams.append('limit', params.pageSize.toString());
  if (params?.bookmark) queryParams.append('bookmark', params.bookmark);
  if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
  if (params?.sortMode) queryParams.append('sort_mode', params.sortMode);
  if (params?.filters) {
    params.filters.forEach(filter => queryParams.append('filter', filter));
  }

  const response = await apiFetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${groupId}/devices?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return handleApiError(response, 'Failed to fetch group devices');
}

/**
 * Resolve which OTA device groups a device actually belongs to.
 *
 * There is no reverse (device -> groups) lookup on the backend — group membership is decided by
 * each group's own dynamic filter criteria, evaluated server-side, not stored on the device. This
 * fetches every group and, for each, asks the backend's own membership check "does this group,
 * with its real criteria, contain this exact device id?" (`id[equal]<deviceId>`, pageSize 1) rather
 * than re-implementing filter evaluation (operators, jsonpath metadata, etc.) client-side, which
 * would drift from the backend's actual semantics.
 *
 * A device can match more than one group (criteria aren't exclusive), so this returns every match
 * rather than assuming exactly one — callers that need a single group (e.g. a launch dialog) must
 * decide what to do with zero or multiple results themselves.
 */
export async function resolveDeviceGroups(
  deviceId: string
): Promise<Array<{ id: string; name: string }>> {
  const { list: groups } = await getDeviceGroups({ pageSize: 100 });
  const membership = await Promise.all(
    groups.map(async (group) => {
      try {
        const result = await getDevicesByGroup(group.id, {
          pageSize: 1,
          filters: [`id[equal]${deviceId}`],
        });
        return result.list.length > 0 ? { id: group.id, name: group.name } : null;
      } catch {
        // A single group's membership check failing (e.g. transient error) shouldn't hide every
        // other group this device does belong to.
        return null;
      }
    })
  );
  return membership.filter((g): g is { id: string; name: string } => g !== null);
}

/**
 * Get statistics for a device group
 */
export async function getDeviceGroupStats(
  groupId: string
): Promise<DeviceGroupStats> {
  const response = await apiFetch(
    `${get_DEV_MANAGER_API_BASE_URL()}/device-groups/${groupId}/stats`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return handleApiError(response, 'Failed to fetch group statistics');
}
