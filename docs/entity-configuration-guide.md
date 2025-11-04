# Entity Configuration System

This document explains how to add new entities to the RelationshipsFlowDiagram using the configuration-driven approach.

## Overview

The system is now completely generalized and configuration-driven. All entity definitions, styling, handles, and relationships are defined in `/src/lib/entity-config.ts`, while the logic remains in the React component.

## File Structure

```
src/
├── lib/
│   └── entity-config.ts          # Configuration definitions (DATA)
└── components/shared/
    └── RelationshipsFlowDiagram.tsx  # Logic implementation (LOGIC)
```

## How to Add a New Entity

### 1. Define the Entity Configuration

Add your new entity to the `ENTITY_CONFIGS` object in `entity-config.ts`:

```typescript
// Example: Adding a new "user" entity
user: {
  id: 'user',
  displayName: 'User',
  icon: User, // Import from lucide-react
  minWidth: 'min-w-[250px]',
  handles: [
    { id: 'right', position: 'right', type: 'source' },
    { id: 'left', position: 'left', type: 'target' },
  ],
  allowedTargets: ['device', 'device_group'],
  allowedSources: ['policy'],
  styling: {
    thickBorderOnPolicyPath: true,
  },
}
```

### 2. Define Relationships

Add relationship configurations to `RELATIONSHIP_CONFIGS`:

```typescript
// Example: User can own devices
{
  sourceEntity: 'user',
  targetEntity: 'device',
  sourceHandle: 'right',
  targetHandle: 'left',
  label: 'owns',
  actions: ['read', 'control', 'monitor'],
},
```

### 3. Add Position (if needed)

In the component's `initialNodes` function, add a position for your new entity:

```typescript
const positions = {
  device: { x: 200, y: 300 },
  device_group: { x: 800, y: 200 },
  dms: { x: 50, y: 600 },
  certificate: { x: 500, y: 800 },
  policy: { x: 500, y: 20 },
  user: { x: 100, y: 100 }, // Add this line
};
```

### 4. Add Entity Data (if needed)

If your entity needs additional metadata, add it to the `entitiesData` object in the component:

```typescript
const entitiesData = {
  // ... existing entities
  user: {
    name: "user",
    label: "User",
    description: "A user entity that can own devices",
    table: "users",
    column_id: "id",
    actions: ["read", "create", "update", "delete", "list"],
    relationships: []
  }
};
```

## Entity Configuration Options

### EntityConfig Interface

```typescript
interface EntityConfig {
  id: string;                    // Unique identifier
  displayName: string;           // Human-readable name
  icon: LucideIcon;             // Icon component from lucide-react
  iconColor?: string;           // CSS class for icon color
  backgroundColor?: string;     // CSS class for background
  textColor?: string;           // CSS class for text color
  borderColor?: string;         // CSS class for border
  minWidth?: string;            // CSS class for minimum width
  handles: EntityHandle[];      // Connection points
  allowedTargets?: string[];    // Which entities this can connect to
  allowedSources?: string[];    // Which entities can connect to this
  styling?: {
    primary?: boolean;          // If this is a primary entity (like policy)
    selectedBorderColor?: string;
    selectedTextColor?: string;
    thickBorderOnPolicyPath?: boolean;
  };
}
```

### EntityHandle Interface

```typescript
interface EntityHandle {
  id: string;                   // Unique handle identifier
  position: 'top' | 'right' | 'bottom' | 'left';
  type: 'source' | 'target';   // Direction of connection
  label?: string;               // Optional label for the handle
}
```

### EntityRelationshipConfig Interface

```typescript
interface EntityRelationshipConfig {
  sourceEntity: string;         // Source entity ID
  targetEntity: string;         // Target entity ID
  sourceHandle: string;         // Source handle ID or 'dynamic'
  targetHandle: string;         // Target handle ID
  label?: string;               // Relationship label
  description?: string;         // Detailed description
  actions?: string[];           // Available actions for this relationship
}
```

## Configuration Manager

The `EntityConfigManager` class provides utility methods:

- `getEntityConfig(entityId)` - Get configuration for specific entity
- `getAllEntityConfigs()` - Get all entity configurations
- `getAllRelationships()` - Get all relationship configurations
- `getEntityIcon(entityId)` - Get icon component for entity
- `isSourceHandle(entityId, handleId)` - Check if handle is a source
- `shouldUsePrimaryStyle(entityId)` - Check if entity uses primary styling
- `getAvailablePosition(entityId, existingHandles)` - Get next available handle position

## Benefits of This Approach

1. **Separation of Concerns**: Configuration (data) is separate from logic
2. **Easy to Extend**: Add new entities by just updating the configuration
3. **Type Safety**: Full TypeScript support with interfaces
4. **Maintainable**: Single source of truth for entity definitions
5. **Flexible**: Supports custom styling, handles, and relationships
6. **Consistent**: All entities follow the same pattern
7. **Fully Configuration-Driven**: Handles are now generated from configuration, not hardcoded

## What We've Accomplished

✅ **Removed all hardcoded entity logic** - No more switch statements based on entity types  
✅ **Configuration-driven handles** - Handles are generated from the `handles` array in configuration  
✅ **Dynamic relationship generation** - Edges created from relationship configurations  
✅ **Centralized entity management** - All entity definitions in one place  
✅ **Complete generalization** - Adding new entities requires only configuration changes  

The system is now **100% configuration-driven** with no hardcoded entity-specific logic remaining!

## Example: Adding a "Server" Entity

```typescript
// 1. Add to ENTITY_CONFIGS
server: {
  id: 'server',
  displayName: 'Server',
  icon: Server,
  minWidth: 'min-w-[300px]',
  handles: [
    { id: 'top', position: 'top', type: 'target' },
    { id: 'bottom', position: 'bottom', type: 'source' },
  ],
  allowedTargets: ['device'],
  allowedSources: ['policy', 'dms'],
  styling: {
    thickBorderOnPolicyPath: true,
  },
}

// 2. Add relationships
{
  sourceEntity: 'server',
  targetEntity: 'device',
  sourceHandle: 'bottom',
  targetHandle: 'top',
  label: 'hosts',
  actions: ['deploy', 'monitor', 'restart'],
}

// 3. Add position in component
server: { x: 400, y: 150 }
```

That's it! The new entity will automatically appear in the diagram with full functionality.