# Policy Entity Validation

## Overview

The Policy entity is **critical** for the security model of the Lamassu Dashboard. It must always exist and be properly configured.

## Validation Rules

The system now automatically validates that:

1. **Policy entity exists** in the configuration
2. **Primary styling is enabled** (`styling.primary: true`)
3. **At least one handle is defined** for connections
4. **Proper configuration structure** is maintained

## Error Handling

If the Policy entity is missing or misconfigured, the component will display a comprehensive error message with:

- Clear explanation of the problem
- Complete configuration example
- Reasons why Policy is required
- Instructions for fixing the issue

## Configuration Requirements

```typescript
policy: {
  id: 'policy',
  displayName: 'Policy',
  icon: Shield,
  handles: [
    { id: 'right', position: 'right', type: 'source' }
  ],
  styling: { 
    primary: true 
  },
  allowedTargets: ['device', 'device_group', 'dms']
}
```

## Why Policy is Required

1. **Access Control**: Controls permissions across all entities
2. **Security Boundaries**: Defines what actions are allowed
3. **Permission Cascading**: Enables inheritance of permissions
4. **Audit Trail**: Tracks security-related decisions
5. **Compliance**: Required for regulatory and security standards

The system will refuse to render without a properly configured Policy entity to maintain security integrity.