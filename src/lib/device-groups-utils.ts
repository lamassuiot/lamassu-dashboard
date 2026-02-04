import { FilterOperation, DeviceFilterableField, DeviceGroup, DeviceGroupFilterOption } from '@/types/device-group';

/**
 * Normalize filter criteria from backend to match frontend types
 * Both frontend and backend use 'operand' field
 * May also handle legacy 'filter_operation' / 'FilterOperation' for backward compatibility
 */
export function normalizeFilterCriteria(criteria: any[]): DeviceGroupFilterOption[] {
  if (!Array.isArray(criteria)) {
    return [];
  }

  return criteria.map((filter) => {
    // Handle both PascalCase (Field) and snake_case (field)
    const field = (filter.field || filter.Field || '') as DeviceFilterableField;
    
    // Handle 'operand' field and legacy 'filter_operation' / 'FilterOperation'
    let operation = filter.operand ?? filter.filter_operation ?? filter.FilterOperation ?? '';
    if (!operation) {
      // Default to 'contains' for tags field, 'eq' for others
      operation = field === 'tags' ? 'contains' : 'eq';
    }
    
    // Handle both PascalCase (Value) and snake_case (value)
    const value = filter.value || filter.Value || '';

    return {
      field,
      operand: operation as FilterOperation,
      value,
    };
  });
}

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
  if (!field) {
    return 'Unknown Field';
  }
  
  const labels: Record<DeviceFilterableField, string> = {
    id: 'Device ID',
    dms_owner: 'DMS Owner',
    status: 'Status',
    tags: 'Tags',
    creation_timestamp: 'Creation Date',
    metadata: 'Metadata',
  };
  return labels[field] || field;
}

/**
 * Format filter criteria to human-readable string
 */
export function formatFilterCriteria(
  field: DeviceFilterableField,
  operation: FilterOperation,
  value: string
): string {
  if (!field || operation === undefined || operation === null) {
    return 'Invalid filter criteria';
  }
  
  const fieldLabel = getFieldLabel(field);
  const operationLabel = getFilterOperationLabel(operation);
  const displayValue = value || '(empty)';
  return `${fieldLabel} ${operationLabel} "${displayValue}"`;
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
    if (!availableOps.includes(filter.operand)) {
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

/**
 * Device group with children for hierarchical display
 */
export interface DeviceGroupNode extends DeviceGroup {
  children: DeviceGroupNode[];
  level: number;
}

/**
 * Build hierarchical tree structure from flat list of device groups
 */
export function buildDeviceGroupTree(groups: DeviceGroup[]): DeviceGroupNode[] {
  // Create a map for quick lookup
  const groupMap = new Map<string, DeviceGroupNode>();
  
  // Initialize all nodes with empty children array
  groups.forEach(group => {
    groupMap.set(group.id, {
      ...group,
      children: [],
      level: 0,
    });
  });
  
  const rootNodes: DeviceGroupNode[] = [];
  
  // Build the tree structure
  groups.forEach(group => {
    const node = groupMap.get(group.id)!;
    
    if (group.parent_id) {
      const parent = groupMap.get(group.parent_id);
      if (parent) {
        parent.children.push(node);
        node.level = parent.level + 1;
      } else {
        // Parent not found, treat as root
        rootNodes.push(node);
      }
    } else {
      // No parent, this is a root node
      rootNodes.push(node);
    }
  });
  
  // Sort children recursively by name
  const sortChildren = (nodes: DeviceGroupNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(node => {
      if (node.children.length > 0) {
        sortChildren(node.children);
      }
    });
  };
  
  sortChildren(rootNodes);
  
  return rootNodes;
}

/**
 * Flatten hierarchical tree back to list with level information
 */
export function flattenDeviceGroupTree(nodes: DeviceGroupNode[]): DeviceGroupNode[] {
  const result: DeviceGroupNode[] = [];
  
  const traverse = (node: DeviceGroupNode) => {
    result.push(node);
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child));
    }
  };
  
  nodes.forEach(node => traverse(node));
  
  return result;
}
