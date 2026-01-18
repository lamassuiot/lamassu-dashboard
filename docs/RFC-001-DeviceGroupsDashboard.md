# RFC-001: Device Groups Dashboard Implementation

|  |  |
|---|---|
| **RFC ID** | RFC-001 |
| **Date** | 2026-01-15 |
| **Status** | Proposed |
| **Authors** | Engineering Team |
| **Focus** | Dashboard UI, Device Groups Management, User Experience |
| **Backend RFC** | [RFC-004-DynamicDeviceGroups](https://github.com/lamassuiot/lamassuiot/blob/exp/device-groups/docs/RFC-004-DynamicDeviceGroups.md) |

## 1. Abstract

This RFC proposes the frontend implementation of Dynamic Device Groups in the Lamassu Dashboard. Building on the backend implementation defined in RFC-004, this document outlines the user interface components, API integration, and user workflows required to manage and visualize hierarchical device groups with dynamic membership based on filter expressions.

The implementation will provide an intuitive interface for:
- Creating and managing device groups with dynamic filter criteria
- Visualizing hierarchical group structures
- Browsing group membership and statistics
- Managing filter expressions through a user-friendly builder

## 2. Motivation

As IoT deployments scale to thousands or millions of devices, operators need efficient ways to:

- **Organize and visualize** device fleets based on dynamic criteria (location, firmware version, status, etc.)
- **Monitor subsets** of the fleet without manual device-to-group assignments
- **Understand group composition** through real-time statistics and member lists
- **Navigate hierarchies** to understand parent-child group relationships
- **Build complex filters** without writing raw JSON or understanding backend data structures

The dashboard must provide a security-first, performance-optimized interface that matches the sophistication of the backend implementation while remaining accessible to both technical and non-technical users.

## 3. High-Level Design

### 3.1 User Interface Components

The implementation will introduce new sections to the Lamassu Dashboard:

#### 3.1.1 Device Groups List Page
- **Location**: `/device-groups`
- **Purpose**: Browse all device groups with filtering, sorting, and pagination
- **Key Features**:
  - Hierarchical tree view showing parent-child relationships
  - List view with columns: Name, Description, Parent, Member Count, Status Distribution
  - Quick actions: View Details, Edit, Delete
  - Create New Group button
  - Real-time member count and status statistics

#### 3.1.2 Device Group Details Page
- **Location**: `/device-groups/details/:id`
- **Purpose**: View complete group information and manage membership
- **Key Features**:
  - Group metadata (name, description, parent, creation date)
  - Filter criteria display with human-readable format
  - Member devices list with full device details
  - Statistics dashboard (total count, status distribution)
  - Hierarchy breadcrumb showing position in tree
  - Actions: Edit Group, Delete Group, View Parent, View Children

#### 3.1.3 Create/Edit Group Form
- **Location**: `/device-groups/new` and `/device-groups/edit/:id`
- **Purpose**: Create new groups or modify existing ones
- **Key Features**:
  - Basic information form (name, description, parent selector)
  - Visual filter builder with field, operator, and value selection
  - Real-time preview of matching devices
  - Validation for circular parent references
  - Validation for filterable field names
  - Save and Cancel actions

#### 3.1.4 Filter Expression Builder
- **Reusable Component**: Used in Create/Edit forms
- **Purpose**: Build complex filter criteria without JSON editing
- **Key Features**:
  - Field selector dropdown (id, dms_owner, status, tags, creation_timestamp, metadata)
  - Dynamic operator selection based on field type (string, array, enum, date, JSON path)
  - Value input with type-appropriate controls (text, date picker, enum dropdown, tag selector)
  - Add/Remove filter rows
  - Visual indication of AND logic between filters
  - Human-readable summary of criteria

### 3.2 Data Flow Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Lamassu Dashboard                      │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Device Groups Pages (Next.js)              │  │
│  │  - List View (/device-groups)                        │  │
│  │  - Details View (/device-groups/details/:id)         │  │
│  │  - Create/Edit Forms (/device-groups/new|edit/:id)   │  │
│  └────────────────┬─────────────────────────────────────┘  │
│                   │                                        │
│  ┌────────────────▼─────────────────────────────────────┐  │
│  │         React Components (src/components)            │  │
│  │  - DeviceGroupsList                                  │  │
│  │  - DeviceGroupDetails                                │  │
│  │  - DeviceGroupForm                                   │  │
│  │  - FilterExpressionBuilder                           │  │
│  │  - GroupHierarchyTree                                │  │
│  │  - GroupStatsCard                                    │  │
│  └────────────────┬─────────────────────────────────────┘  │
│                   │                                        │
│  ┌────────────────▼─────────────────────────────────────┐  │
│  │         API Client Layer (src/lib)                   │  │
│  │  - device-groups-api.ts                              │  │
│  │    * getDeviceGroups()                               │  │
│  │    * getDeviceGroupByID()                            │  │
│  │    * createDeviceGroup()                             │  │
│  │    * updateDeviceGroup()                             │  │
│  │    * deleteDeviceGroup()                             │  │
│  │    * getDevicesByGroup()                             │  │
│  │    * getDeviceGroupStats()                           │  │
│  └────────────────┬─────────────────────────────────────┘  │
│                   │                                        │
└───────────────────┼────────────────────────────────────────┘
                    │
                    │ HTTPS + OIDC Auth
                    │
┌───────────────────▼──────────────────────────────────────────┐
│              Backend Device Manager API                      │
│          (RFC-004 Implementation)                            │
│  GET    /device-groups                                       │
│  POST   /device-groups                                       │
│  GET    /device-groups/:id                                   │
│  PUT    /device-groups/:id                                   │
│  DELETE /device-groups/:id                                   │
│  GET    /device-groups/:group_id/devices                     │
│  GET    /device-groups/:group_id/stats                       │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Filter Operation Mapping

The dashboard must map backend filter operation names to user-friendly labels:

| Operation Name | Aliases | Field Types | UI Label | Description |
|----------------|---------|-------------|----------|-------------|
| `eq`, `equal` | - | string, date, enum | "equals" | Exact match (case-sensitive) |
| `eq_ic`, `equal_ignorecase` | - | string | "equals (ignore case)" | Exact match (case-insensitive) |
| `ne`, `notequal` | - | string, enum | "not equals" | Not equal (case-sensitive) |
| `ne_ic`, `notequal_ignorecase` | - | string | "not equals (ignore case)" | Not equal (case-insensitive) |
| `ct`, `contains` | - | string, array (tags) | "contains" | Contains substring/value (case-sensitive) |
| `ct_ic`, `contains_ignorecase` | - | string, array (tags) | "contains (ignore case)" | Contains substring/value (case-insensitive) |
| `nc`, `notcontains` | - | string | "does not contain" | Does not contain substring (case-sensitive) |
| `nc_ic`, `notcontains_ignorecase` | - | string | "does not contain (ignore case)" | Does not contain substring (case-insensitive) |
| `bf`, `before` | - | date | "before" | Date before |
| `af`, `after` | - | date | "after" | Date after |
| `jsonpath` | - | object (metadata) | "JSON path" | JSON path query |

### 3.4 Security & Performance Considerations

#### Security
- **Authentication**: All API requests require valid OIDC tokens via `AuthContext`
- **Input Validation**: Filter criteria validated against allowed fields and operators
- **XSS Prevention**: All user inputs sanitized before rendering
- **CSRF Protection**: Implicit via token-based authentication
- **Audit Logging**: Group management operations logged via backend

#### Performance
- **Lazy Loading**: Device lists in groups use pagination and infinite scroll
- **Optimistic Updates**: UI updates immediately with rollback on error
- **Caching**: Group lists and stats cached with appropriate TTL
- **Debouncing**: Filter preview queries debounced to 500ms
- **Loading States**: Clear skeleton loaders and progress indicators
- **Error Boundaries**: Graceful degradation on component failures

## 4. Implementation Details

### 4.1 Technology Stack

- **Framework**: Next.js 15.x with App Router
- **Language**: TypeScript with strict mode
- **UI Components**: ShadCN UI (Radix primitives) + Tailwind CSS
- **State Management**: React hooks (useState, useEffect, useCallback)
- **API Client**: Fetch API with OIDC token injection
- **Form Validation**: React Hook Form with Zod schemas
- **Date Handling**: date-fns for date formatting and parsing

### 4.2 Directory Structure

```
src/
├── app/
│   └── device-groups/
│       ├── page.tsx                    # List view
│       ├── new/
│       │   └── page.tsx                # Create form
│       ├── edit/
│       │   └── [id]/
│       │       └── page.tsx            # Edit form
│       └── details/
│           └── [id]/
│               └── page.tsx            # Details view
├── components/
│   └── device-groups/
│       ├── DeviceGroupsList.tsx        # List component
│       ├── DeviceGroupCard.tsx         # Card component
│       ├── DeviceGroupForm.tsx         # Create/Edit form
│       ├── DeviceGroupDetails.tsx      # Details display
│       ├── FilterExpressionBuilder.tsx # Filter builder
│       ├── FilterCriteriaDisplay.tsx   # Read-only filter display
│       ├── GroupHierarchyTree.tsx      # Tree view
│       ├── GroupStatsCard.tsx          # Statistics widget
│       ├── GroupMembersList.tsx        # Members table
│       └── ParentGroupSelector.tsx     # Parent selection dropdown
├── lib/
│   ├── device-groups-api.ts            # API client functions
│   └── device-groups-utils.ts          # Helper functions
└── types/
    └── device-group.ts                 # TypeScript type definitions
```

### 4.3 TypeScript Type Definitions

**File**: `src/types/device-group.ts`

```typescript
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
  filter_operation: FilterOperation;
  value: string;
}

// Device group model
export interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  parent_id: string | null;
  criteria: DeviceGroupFilterOption[];
  created_at: string;
  updated_at: string;
}

// Create request body
export interface CreateDeviceGroupBody {
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

// Get devices by group response (reuses existing Device type)
export interface GetDevicesByGroupResponse {
  next: string;
  list: Device[];
}
```

### 4.4 API Client Implementation

**File**: `src/lib/device-groups-api.ts`

```typescript
import { getAccessToken } from '@/contexts/AuthContext';
import { getApiDomain } from './api-domains';
import type {
  DeviceGroup,
  CreateDeviceGroupBody,
  UpdateDeviceGroupBody,
  GetDeviceGroupsResponse,
  DeviceGroupStats,
  GetDevicesByGroupResponse,
} from '@/types/device-group';
import type { Device } from '@/types/certificate';

const DMS_BASE_URL = () => `${getApiDomain('dms')}/v1`;

/**
 * Get all device groups with optional filtering and pagination
 */
export async function getDeviceGroups(params?: {
  pageSize?: number;
  bookmark?: string;
  sortBy?: string;
  sortMode?: 'asc' | 'desc';
  filter?: string;
}): Promise<GetDeviceGroupsResponse> {
  const token = await getAccessToken();
  const queryParams = new URLSearchParams();
  
  if (params?.pageSize) queryParams.append('limit', params.pageSize.toString());
  if (params?.bookmark) queryParams.append('bookmark', params.bookmark);
  if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
  if (params?.sortMode) queryParams.append('sort_mode', params.sortMode);
  if (params?.filter) queryParams.append('filter', params.filter);

  const response = await fetch(
    `${DMS_BASE_URL()}/device-groups?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.err || 'Failed to fetch device groups');
  }

  return response.json();
}

/**
 * Get a specific device group by ID
 */
export async function getDeviceGroupByID(id: string): Promise<DeviceGroup> {
  const token = await getAccessToken();

  const response = await fetch(`${DMS_BASE_URL()}/device-groups/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.err || 'Failed to fetch device group');
  }

  return response.json();
}

/**
 * Create a new device group
 */
export async function createDeviceGroup(
  body: CreateDeviceGroupBody
): Promise<DeviceGroup> {
  const token = await getAccessToken();

  const response = await fetch(`${DMS_BASE_URL()}/device-groups`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.err || 'Failed to create device group');
  }

  return response.json();
}

/**
 * Update an existing device group
 */
export async function updateDeviceGroup(
  id: string,
  body: UpdateDeviceGroupBody
): Promise<DeviceGroup> {
  const token = await getAccessToken();

  const response = await fetch(`${DMS_BASE_URL()}/device-groups/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.err || 'Failed to update device group');
  }

  return response.json();
}

/**
 * Delete a device group
 */
export async function deleteDeviceGroup(id: string): Promise<void> {
  const token = await getAccessToken();

  const response = await fetch(`${DMS_BASE_URL()}/device-groups/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.err || 'Failed to delete device group');
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
  }
): Promise<GetDevicesByGroupResponse> {
  const token = await getAccessToken();
  const queryParams = new URLSearchParams();
  
  if (params?.pageSize) queryParams.append('limit', params.pageSize.toString());
  if (params?.bookmark) queryParams.append('bookmark', params.bookmark);
  if (params?.sortBy) queryParams.append('sort_by', params.sortBy);
  if (params?.sortMode) queryParams.append('sort_mode', params.sortMode);

  const response = await fetch(
    `${DMS_BASE_URL()}/device-groups/${groupId}/devices?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.err || 'Failed to fetch group devices');
  }

  return response.json();
}

/**
 * Get statistics for a device group
 */
export async function getDeviceGroupStats(groupId: string): Promise<DeviceGroupStats> {
  const token = await getAccessToken();

  const response = await fetch(
    `${DMS_BASE_URL()}/device-groups/${groupId}/stats`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.err || 'Failed to fetch group statistics');
  }

  return response.json();
}
```

### 4.5 Utility Functions

**File**: `src/lib/device-groups-utils.ts`

```typescript
import { FilterOperation, DeviceFilterableField } from '@/types/device-group';

/**
 * Get human-readable label for filter operation
 */
export function getFilterOperationLabel(operation: FilterOperation): string {
  const labels: Record<FilterOperation, string> = {
    'eq': 'equals',
    'equal': 'equals',
    'eq_ic': 'equals (ignore case)',
    'equal_ignorecase': 'equals (ignore case)',
    'ne': 'not equals',
    'notequal': 'not equals',
    'ne_ic': 'not equals (ignore case)',
    'notequal_ignorecase': 'not equals (ignore case)',
    'ct': 'contains',
    'contains': 'contains',
    'ct_ic': 'contains (ignore case)',
    'contains_ignorecase': 'contains (ignore case)',
    'nc': 'does not contain',
    'notcontains': 'does not contain',
    'nc_ic': 'does not contain (ignore case)',
    'notcontains_ignorecase': 'does not contain (ignore case)',
    'bf': 'before',
    'before': 'before',
    'af': 'after',
    'after': 'after',
    'jsonpath': 'JSON path',
  };
  return labels[operation] || 'unknown';
}

/**
 * Get field type for determining available operators
 */
export function getFieldType(field: DeviceFilterableField): 'string' | 'array' | 'enum' | 'date' | 'object' {
  const typeMap: Record<DeviceFilterableField, 'string' | 'array' | 'enum' | 'date' | 'object'> = {
    id: 'string',
    dms_owner: 'string',
    status: 'enum',
    tags: 'array',
    creation_timestamp: 'date',
    metadata: 'object',
  };
  return typeMap[field];
}

/**
 * Get available operators for a field type
 */
export function getAvailableOperators(field: DeviceFilterableField): FilterOperation[] {
  const fieldType = getFieldType(field);
  
  switch (fieldType) {
    case 'string':
      return [
        'eq',
        'eq_ic',
        'ne',
        'ne_ic',
        'ct',
        'ct_ic',
        'nc',
        'nc_ic',
      ];
    case 'array':
      return [
        'contains',
        'contains_ignorecase',
      ];
    case 'enum':
      return [
        'eq',
        'ne',
      ];
    case 'date':
      return [
        'eq',
        'bf',
        'af',
      ];
    case 'object':
      return ['jsonpath'];
    default:
      return [];
  }
}

/**
 * Get human-readable field label
 */
export function getFieldLabel(field: DeviceFilterableField): string {
  const labels: Record<DeviceFilterableField, string> = {
    id: 'Device ID',
    dms_owner: 'DMS Owner',
    status: 'Status',
    tags: 'Tags',
    creation_timestamp: 'Creation Date',
    metadata: 'Metadata',
  };
  return labels[field];
}

/**
 * Format filter criteria to human-readable string
 */
export function formatFilterCriteria(
  field: DeviceFilterableField,
  operation: FilterOperation,
  value: string
): string {
  const fieldLabel = getFieldLabel(field);
  const operationLabel = getFilterOperationLabel(operation);
  return `${fieldLabel} ${operationLabel} "${value}"`;
}

/**
 * Validate filter criteria against allowed fields
 */
export function validateFilterCriteria(criteria: any[]): { valid: boolean; error?: string } {
  const validFields: DeviceFilterableField[] = [
    'id',
    'dms_owner',
    'status',
    'tags',
    'creation_timestamp',
    'metadata',
  ];

  for (const filter of criteria) {
    if (!validFields.includes(filter.field)) {
      return {
        valid: false,
        error: `Invalid filter field: ${filter.field}`,
      };
    }

    const availableOps = getAvailableOperators(filter.field);
    if (!availableOps.includes(filter.filter_operation)) {
      return {
        valid: false,
        error: `Invalid operator for field ${filter.field}`,
      };
    }

    if (!filter.value || filter.value.trim() === '') {
      return {
        valid: false,
        error: 'Filter value cannot be empty',
      };
    }
  }

  return { valid: true };
}

/**
 * Build hierarchy breadcrumb from ancestors
 */
export function buildHierarchyBreadcrumb(
  currentGroup: DeviceGroup,
  ancestors: DeviceGroup[]
): Array<{ id: string; name: string }> {
  return [
    ...ancestors.reverse().map(g => ({ id: g.id, name: g.name })),
    { id: currentGroup.id, name: currentGroup.name },
  ];
}
```

### 4.6 Key React Components

#### 4.6.1 Filter Expression Builder Component

**File**: `src/components/device-groups/FilterExpressionBuilder.tsx`

This component provides a visual interface for building filter criteria without requiring users to write JSON or understand backend filter operation codes.

**Features**:
- Add/remove filter rows dynamically
- Field selection dropdown with all filterable fields
- Operator dropdown dynamically populated based on selected field type
- Value input with appropriate controls (text, date picker, enum dropdown)
- Real-time validation
- Human-readable summary of criteria

#### 4.6.2 Device Group Form Component

**File**: `src/components/device-groups/DeviceGroupForm.tsx`

Unified form component for both create and edit operations.

**Features**:
- Basic fields: name, description
- Parent group selector with tree view
- Filter expression builder integration
- Real-time preview of matching devices count
- Circular reference validation
- Save/Cancel actions
- Loading states and error handling

#### 4.6.3 Group Statistics Card

**File**: `src/components/device-groups/GroupStatsCard.tsx`

Visual widget displaying group membership statistics.

**Features**:
- Total device count
- Status distribution chart (pie or bar chart)
- Color-coded status badges
- Real-time updates on group changes

#### 4.6.4 Group Hierarchy Tree

**File**: `src/components/device-groups/GroupHierarchyTree.tsx`

Tree view component for visualizing group hierarchies.

**Features**:
- Collapsible tree nodes
- Parent-child relationship visualization
- Click to navigate to group details
- Visual indicators for active group
- Member count badges on each node

## 5. User Workflows

### 5.1 Creating a New Device Group

1. **Navigate** to Device Groups page (`/device-groups`)
2. **Click** "Create New Group" button
3. **Fill in** basic information:
   - Name (required, unique)
   - Description (optional)
   - Parent Group (optional, select from dropdown)
4. **Build filter criteria** using Filter Expression Builder:
   - Click "Add Filter" to add a new criterion
   - Select field from dropdown (e.g., "Tags")
   - Select operator (e.g., "contains")
   - Enter value (e.g., "production")
   - Repeat for additional criteria (implicit AND logic)
5. **Preview** matching devices count in real-time
6. **Click** "Create Group"
7. **Confirm** success message and redirect to group details page

### 5.2 Viewing Group Details and Members

1. **Navigate** to Device Groups page
2. **Click** on a group name or "View Details" action
3. **View** group information:
   - Hierarchy breadcrumb showing position in tree
   - Group metadata (name, description, creation date)
   - Filter criteria in human-readable format
   - Statistics card with member count and status distribution
4. **Browse** member devices:
   - Paginated table with device details
   - Sort and filter capabilities
   - Click device to navigate to device details
5. **Perform actions**:
   - Edit group configuration
   - Delete group (with confirmation)
   - View parent or child groups

### 5.3 Editing an Existing Group

1. **Navigate** to group details page
2. **Click** "Edit Group" button
3. **Modify** group information:
   - Update name, description, or parent
   - Modify filter criteria using Filter Expression Builder
   - Add new filters or remove existing ones
4. **Preview** updated matching devices count
5. **Click** "Save Changes"
6. **Confirm** success message and view updated group

### 5.4 Managing Group Hierarchy

1. **Navigate** to Device Groups page
2. **Toggle** between List View and Tree View
3. **In Tree View**:
   - Expand/collapse parent groups to see children
   - Drag-and-drop groups to change parent relationships (future enhancement)
   - View member counts at each level
4. **In List View**:
   - Filter by parent group
   - Sort by hierarchy depth
   - Use breadcrumb navigation in details view

## 6. Implementation Plan

### 6.1 Phase 1: Foundation & API Integration

**Duration**: 1-2 weeks

**Deliverables**:
1. TypeScript type definitions (`src/types/device-group.ts`)
2. API client implementation (`src/lib/device-groups-api.ts`)
3. Utility functions (`src/lib/device-groups-utils.ts`)
4. Basic navigation menu item for Device Groups

**Validation**:
- API client functions successfully communicate with backend
- Type definitions align with backend OpenAPI spec
- Utility functions handle all filter operation types correctly

### 6.2 Phase 2: Core UI Components

**Duration**: 2-3 weeks

**Deliverables**:
1. Device Groups List page (`src/app/device-groups/page.tsx`)
   - Table view with sorting and pagination
   - Basic filtering and search
   - Create button and quick actions
2. Filter Expression Builder component
   - Field, operator, value selection
   - Add/remove filter rows
   - Validation and error messages
3. Group Statistics Card component
   - Total count display
   - Status distribution visualization

**Validation**:
- List page displays groups with correct data
- Filter builder generates valid criteria JSON
- Statistics card shows accurate real-time data

### 6.3 Phase 3: Form Components

**Duration**: 2-3 weeks

**Deliverables**:
1. Create Group page (`src/app/device-groups/new/page.tsx`)
2. Edit Group page (`src/app/device-groups/edit/[id]/page.tsx`)
3. Device Group Form component
   - Basic field inputs with validation
   - Parent group selector
   - Filter Expression Builder integration
   - Real-time device count preview
4. Circular reference validation
5. Save/cancel actions with optimistic updates

**Validation**:
- Forms successfully create and update groups
- Validation prevents invalid configurations
- Preview shows accurate device counts
- Circular references are detected and prevented

### 6.4 Phase 4: Details & Visualization

**Duration**: 2-3 weeks

**Deliverables**:
1. Group Details page (`src/app/device-groups/details/[id]/page.tsx`)
2. Group Hierarchy Tree component
   - Tree view with expand/collapse
   - Navigation to group details
   - Member count badges
3. Group Members List component
   - Paginated device table
   - Device details modal integration
   - Sorting and filtering
4. Filter Criteria Display component (read-only)
5. Hierarchy breadcrumb navigation

**Validation**:
- Details page shows complete group information
- Hierarchy tree accurately represents parent-child relationships
- Members list displays correct filtered devices
- Navigation works seamlessly across hierarchy

### 6.5 Phase 5: Polish & Performance

**Duration**: 1-2 weeks

**Deliverables**:
1. Loading skeletons and states
2. Error boundaries and fallback UI
3. Optimistic updates for better UX
4. Responsive design for mobile devices
5. Accessibility improvements (ARIA labels, keyboard navigation)
6. Performance optimizations:
   - Pagination for large lists
   - Debounced filter preview
   - Cached API responses
7. User documentation
8. Comprehensive testing

**Validation**:
- All interactions feel responsive (<200ms feedback)
- Error handling gracefully recovers from failures
- UI works on mobile, tablet, and desktop
- Accessibility audit passes WCAG 2.1 Level AA
- Load testing with 1000+ groups and 10000+ devices

### 6.6 Phase 6: Documentation & Training

**Duration**: 1 week

**Deliverables**:
1. User documentation in dashboard help section
2. Video tutorials for common workflows
3. Admin guide for group management best practices
4. Developer documentation for future enhancements

## 7. Testing Strategy

### 7.1 Unit Testing
- **Utility Functions**: Test all helper functions with edge cases
- **Type Validation**: Ensure TypeScript types match backend spec
- **API Client**: Mock API responses and test error handling

### 7.2 Integration Testing
- **API Communication**: Test with local backend instance
- **Component Integration**: Test form submission and data flow
- **Authentication**: Verify OIDC token handling

### 7.3 End-to-End Testing
- **User Workflows**: Test complete user journeys (create, edit, delete)
- **Hierarchy Management**: Test parent-child relationships
- **Filter Expressions**: Test complex filter criteria
- **Error Scenarios**: Test network failures, validation errors, etc.

### 7.4 Performance Testing
- **Large Lists**: Test with 1000+ device groups
- **Deep Hierarchies**: Test with 10+ levels of nesting
- **Complex Filters**: Test with 10+ filter criteria
- **Real-time Updates**: Test statistics refresh performance

### 7.5 Accessibility Testing
- **Screen Readers**: Test with NVDA and JAWS
- **Keyboard Navigation**: Test all interactions without mouse
- **Color Contrast**: Validate WCAG 2.1 Level AA compliance
- **Focus Management**: Ensure logical focus order

## 8. Security & Compliance

### 8.1 Authentication & Authorization
- **OIDC Integration**: All API calls require valid access tokens
- **Token Management**: Automatic refresh via `AuthContext`
- **Session Expiry**: Graceful handling of expired sessions

### 8.2 Input Validation
- **Client-Side**: Immediate feedback on invalid inputs
- **Server-Side**: Backend validates all requests
- **XSS Prevention**: React automatically escapes rendered content
- **SQL Injection**: Not applicable (backend handles queries)

### 8.3 Data Privacy
- **No Sensitive Data in URLs**: Use POST body for filter criteria
- **Audit Logging**: Backend logs all group management operations
- **GDPR Compliance**: Support for data export and deletion

### 8.4 Error Handling
- **No Information Leakage**: Generic error messages to users
- **Detailed Logging**: Full error context in browser console
- **Graceful Degradation**: UI remains functional on partial failures

## 9. Performance & Scalability

### 9.1 Frontend Performance
- **Bundle Size**: Keep component bundle <100KB gzipped
- **Initial Load**: First meaningful paint <2 seconds
- **Interaction**: Time to interactive <200ms for most actions
- **Memory**: Efficient cleanup of event listeners and subscriptions

### 9.2 API Optimization
- **Pagination**: Default 50 items per page, adjustable
- **Caching**: Cache group lists for 5 minutes
- **Debouncing**: Preview queries debounced to 500ms
- **Parallel Requests**: Fetch groups and stats in parallel

### 9.3 Scalability Considerations
- **Large Fleets**: Design supports 10,000+ device groups
- **Deep Hierarchies**: Efficient traversal up to 10 levels
- **Complex Filters**: Handle up to 20 filter criteria per group
- **Concurrent Users**: Support 100+ simultaneous users

## 10. Future Enhancements

### 10.1 Advanced Features
- **Drag-and-Drop**: Reorder hierarchy via drag-and-drop
- **Group Templates**: Pre-defined filter patterns for common scenarios
- **Bulk Actions**: Apply operations to all devices in a group
- **Export**: Export group membership to CSV/JSON
- **Group Actions**: Trigger certificate operations on entire groups

### 10.2 Visualization Improvements
- **Charts & Graphs**: Advanced visualizations for group statistics
- **Heatmaps**: Geographic distribution of devices in groups
- **Timeline**: Historical view of group membership changes
- **Comparison**: Side-by-side comparison of multiple groups

### 10.3 Automation
- **Event Notifications**: Real-time alerts for group changes
- **Scheduled Reports**: Automated group statistics reports
- **Webhook Integration**: Trigger external systems on group events
- **Policy Enforcement**: Automated certificate rotation for groups

### 10.4 Performance Optimization
- **Virtual Scrolling**: Handle very large member lists efficiently
- **Lazy Loading**: Load hierarchy levels on demand
- **Background Sync**: Periodic cache refresh without blocking UI
- **WebSockets**: Real-time updates for group statistics

## 11. Dependencies & Prerequisites

### 11.1 Backend Requirements
- Device Manager service with RFC-004 implementation
- Device Groups API endpoints fully operational
- OIDC authentication provider configured

### 11.2 Dashboard Requirements
- Next.js 15.x with App Router
- TypeScript 5.x with strict mode
- ShadCN UI components library
- Tailwind CSS 3.x
- React Hook Form + Zod validation

### 11.3 Browser Compatibility
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari 14+, Chrome Android 90+)

## 12. Migration & Rollout

### 12.1 Feature Flag
- Implement feature flag to enable/disable Device Groups UI
- Gradual rollout to user groups for beta testing

### 12.2 Data Migration
- No data migration required (new feature)
- Existing device data compatible with new grouping

### 12.3 User Training
- Release notes with screenshots
- Video tutorials for key workflows
- In-app onboarding tour for first-time users

### 12.4 Rollback Plan
- Feature flag allows instant disable if issues arise
- No database changes required for rollback
- Backend API versioning supports gradual adoption

## 13. Success Metrics

### 13.1 Adoption Metrics
- **Target**: 70% of users create at least one device group within 30 days
- **Measure**: Track group creation via analytics

### 13.2 Performance Metrics
- **Page Load**: <2 seconds for group list page
- **API Response**: <500ms for group statistics
- **UI Interaction**: <200ms time to interactive

### 13.3 User Satisfaction
- **Survey Score**: Target NPS >40 for Device Groups feature
- **Support Tickets**: <5% of users report issues

### 13.4 Usage Patterns
- **Average Groups**: 5-20 groups per organization
- **Average Filters**: 2-5 filter criteria per group
- **Hierarchy Depth**: 2-4 levels average

## 14. References

- [RFC-004: Dynamic Device Groups (Backend)](https://github.com/lamassuiot/lamassuiot/blob/exp/device-groups/docs/RFC-004-DynamicDeviceGroups.md)
- [Device Manager OpenAPI Specification](https://github.com/lamassuiot/lamassuiot/blob/exp/device-groups/docs/device-manager-openapi.yaml)
- [Lamassu Dashboard Architecture](../README.md)
- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [ShadCN UI Components](https://ui.shadcn.com/)

## 15. Approval & Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Tech Lead | | | |
| UX Designer | | | |
| Security Lead | | | |

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-15  
**Next Review**: 2026-02-15
