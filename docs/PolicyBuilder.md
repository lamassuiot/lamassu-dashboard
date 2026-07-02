# Policy Builder Documentation

## Overview

The Policy Builder is a comprehensive component for creating and editing authorization policies with nested rules. It supports three different editing modes to accommodate different user preferences and use cases.

## Features

### Three Editing Modes

1. **Form Mode** - User-friendly form interface with visual rule editing
2. **JSON Mode** - Direct JSON editing for advanced users
3. **Flow Mode** - Visual flow diagram using React Flow for graphical policy creation

### Key Capabilities

- **Nested Rules**: Support for deeply nested relation rules (up to 3 levels)
- **Real-time Validation**: Immediate feedback on JSON syntax and structure
- **Seamless Switching**: Switch between modes without losing data
- **Visual Connections**: Drag-and-drop entity connections in Flow mode
- **Batch Actions**: Add multiple actions and direct grants efficiently

## Usage

### Basic Integration

```tsx
import { PolicyBuilder } from '@/components/authz/PolicyBuilder';
import type { Rule } from '@/types/authz';

function MyComponent() {
  const [rules, setRules] = useState<Rule[]>([]);

  return (
    <PolicyBuilder
      rules={rules}
      onChange={setRules}
      error={null}
    />
  );
}
```

### Form Mode

**Adding a Rule:**
1. Click "Add Rule" button
2. Enter entity type (e.g., "document", "folder")
3. Add actions by typing and pressing Enter or clicking +
4. Optionally add direct grants (principal IDs)
5. Add relations to define hierarchical access

**Nested Relations:**
- Click "Add Relation" to create a parent-child relationship
- Each relation can have its own target entity, via field, and actions
- Nest relations up to 3 levels deep for complex access patterns

**Example Rule Structure:**
```
Entity: document
Actions: read, write
Relations:
  └─ Relation
     To: folder
     Via: parent
     Actions: read
     Relations:
       └─ Relation
          To: organization
          Via: owner
          Actions: read
```

### JSON Mode

**Direct JSON Editing:**
- Full JSON control for advanced users
- Real-time syntax validation
- Immediate error feedback
- Example JSON structure provided

**Example JSON:**
```json
[
  {
    "entityType": "document",
    "actions": ["read", "write"],
    "relations": [
      {
        "to": "folder",
        "via": "parent",
        "actions": ["read"],
        "relations": []
      }
    ],
    "directGrants": ["user123"]
  }
]
```

### Flow Mode

**Visual Policy Building:**
1. **Schema entities are automatically loaded** from the authorization service
2. Click "Add Rule" to create a new rule for a specific entity type
3. **Blue nodes** represent schema entities (read-only, show available relations)
4. **Green nodes** represent rules (editable, define actions and grants)
5. Rules are automatically connected to their target schema entity
6. Drag from rule nodes to schema entities to create relation-based access
7. Edit actions and direct grants directly in rule nodes
8. Delete rules using the trash icon

**Node Types:**

- **Schema Entity Node** (blue border, read-only):
  - Represents database schema entities
  - Shows table name and available relations
  - Cannot be edited or deleted
  - Serves as connection targets for rules

- **Rule Node** (green border, editable):
  - Represents authorization rules
  - Define allowed actions inline
  - Add direct grants (principal IDs)
  - Connect to schema entities via relations
  - Delete with trash icon

**Workflow:**
1. Flow mode loads all schema entities from the database
2. Click "Add Rule" and select an entity type
3. A rule node is created and auto-connected to the schema entity
4. Add actions by typing in the action input and pressing Enter or clicking +
5. Optionally add direct grants (principal IDs)
6. Drag from the rule node's right handle to other schema entities to define relations
7. The edge label shows the relation name (e.g., "via parent")
8. All changes sync automatically to the policy

**Controls:**
- Zoom in/out with mouse wheel or controls
- Pan by clicking and dragging background
- Minimap shows overview (blue = schemas, green = rules)
- Background grid for alignment
- Auto-layout positions nodes optimally

## Rule Structure

### Rule Interface

```typescript
interface Rule {
  entityType: string;         // Resource type (e.g., "document")
  actions: string[];          // Allowed actions (e.g., ["read", "write"])
  relations: RelationRule[];  // Hierarchical relationships
  directGrants?: string[];    // Direct principal grants
}
```

### RelationRule Interface

```typescript
interface RelationRule {
  to: string;                 // Target entity type
  via: string;                // Relationship name
  actions: string[];          // Actions allowed via this relation
  relations?: RelationRule[]; // Nested relations (recursive)
}
```

## Common Patterns

### Document Hierarchy Access

```json
{
  "entityType": "document",
  "actions": ["read", "write", "delete"],
  "relations": [
    {
      "to": "folder",
      "via": "parent",
      "actions": ["read"],
      "relations": [
        {
          "to": "workspace",
          "via": "parent",
          "actions": ["read"],
          "relations": []
        }
      ]
    }
  ]
}
```

This allows: "Users can access documents if they have access to the parent folder or workspace"

### Owner-Based Access

```json
{
  "entityType": "project",
  "actions": ["read", "write"],
  "relations": [
    {
      "to": "user",
      "via": "owner",
      "actions": ["read", "write", "delete", "admin"],
      "relations": []
    }
  ]
}
```

This allows: "Project owners have full access including delete and admin actions"

### Team Collaboration

```json
{
  "entityType": "repository",
  "actions": ["read"],
  "relations": [
    {
      "to": "team",
      "via": "collaborator",
      "actions": ["read", "write"],
      "relations": []
    }
  ]
}
```

This allows: "Team collaborators can read and write, others can only read"

## Best Practices

1. **Start Simple**: Begin with basic rules and add complexity as needed
2. **Use Form Mode**: For new users, form mode provides the clearest interface
3. **JSON for Bulk**: Use JSON mode when copying policies or making bulk changes
4. **Flow for Visualization**: Use flow mode to understand complex nested relationships
5. **Validate Regularly**: Check JSON validation messages before saving
6. **Limit Nesting**: Keep relation nesting to 3 levels or less for performance
7. **Descriptive Names**: Use clear entity types and relation names
8. **Test Incrementally**: Test rules after each addition in the test interface

## Troubleshooting

### JSON Mode Errors

**"Rules must be an array"**
- Ensure your JSON is wrapped in square brackets `[]`

**Syntax Errors**
- Check for missing commas between objects
- Verify all quotes are properly closed
- Ensure proper bracket matching

### Form Mode Issues

**Relations Not Saving**
- Ensure both "to" and "via" fields are filled
- Add at least one action to the relation
- Check that nested relations don't exceed 3 levels

### Flow Mode Issues

**Cannot Connect Nodes**
- Ensure you're dragging from the handle (small circle)
- Verify both nodes exist before connecting
- Check that you're dragging to a valid target

**Nodes Not Updating Rules**
- Wait for auto-save after moving nodes
- Check console for any error messages
- Refresh if nodes become desynchronized

## Performance Considerations

- **Large Policies**: For policies with >20 rules, consider splitting
- **Flow Mode**: Complex flows (>50 nodes) may impact performance
- **Nesting**: Deep nesting (>3 levels) increases evaluation time
- **Validation**: JSON validation runs on every keystroke in JSON mode

## Keyboard Shortcuts

### Form Mode
- `Enter` in action input: Add action
- `Enter` in grant input: Add grant

### JSON Mode
- Standard text editor shortcuts apply
- Copy/paste works as expected

### Flow Mode
- `Scroll`: Zoom in/out
- `Click + Drag`: Pan canvas
- `Delete/Backspace` on selected node: Delete node

## Integration with Authorization System

The Policy Builder generates rules that are compatible with the Lamassu Authorization API:

```typescript
// Create policy with builder rules
await createPolicy({
  id: 'my-policy',
  name: 'My Policy',
  description: 'Policy description',
  rules: builderRules
});
```

## Future Enhancements

Planned features for future releases:

- [ ] Undo/redo functionality
- [ ] Template library for common patterns
- [ ] Rule validation against schema
- [ ] Import/export to different formats
- [ ] Collaborative editing
- [ ] Rule conflict detection
- [ ] Performance optimization for large policies
