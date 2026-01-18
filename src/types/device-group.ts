import type { ApiDevice } from '@/lib/devices-api';

// Filter operation type matching backend string values
export type FilterOperation =
  // String operations
  | 'eq' | 'equal'
  | 'eq_ic' | 'equal_ignorecase'
  | 'ne' | 'notequal'
  | 'ne_ic' | 'notequal_ignorecase'
  | 'ct' | 'contains'
  | 'ct_ic' | 'contains_ignorecase'
  | 'nc' | 'notcontains'
  | 'nc_ic' | 'notcontains_ignorecase'
  // Date operations
  | 'bf' | 'before'
  | 'af' | 'after'
  // JSON operations
  | 'jsonpath';

// Device filterable fields
export type DeviceFilterableField = 
  | 'id'
  | 'dms_owner'
  | 'status'
  | 'tags'
  | 'creation_timestamp'
  | 'metadata';

// Filter option structure
export interface DeviceGroupFilterOption {
  field: DeviceFilterableField;
  operand: FilterOperation;
  value: string;
}

// Device group model
export interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  parent_id: string | null;
  criteria: DeviceGroupFilterOption[];
  inherited_criteria?: DeviceGroupFilterOption[];
  created_at: string;
  updated_at: string;
}

// Create request body
export interface CreateDeviceGroupBody {
  id: string;
  name: string;
  description: string;
  parent_id?: string | null;
  criteria: DeviceGroupFilterOption[];
}

// Update request body
export interface UpdateDeviceGroupBody {
  name: string;
  description: string;
  parent_id?: string | null;
  criteria: DeviceGroupFilterOption[];
}

// List response
export interface GetDeviceGroupsResponse {
  next: string;
  list: DeviceGroup[];
}

// Group statistics
export interface DeviceGroupStats {
  total: number;
  status_distribution: {
    NO_IDENTITY: number;
    ACTIVE: number;
    RENEWAL_WINDOW: number;
    ABOUT_TO_EXPIRE: number;
    EXPIRED: number;
    REVOKED: number;
    DECOMMISSIONED: number;
  };
}

// Get devices by group response
export interface GetDevicesByGroupResponse {
  next: string;
  list: ApiDevice[];
}
