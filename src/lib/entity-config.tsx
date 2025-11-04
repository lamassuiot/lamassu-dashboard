import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import { Database, Users, Shield, FileText, Cog, Key, Globe } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import React from 'react';
import { KEY_TYPE_OPTIONS } from './form-options';

export interface EntityHandle {
    id: string;
    position: 'top' | 'right' | 'bottom' | 'left';
    type: 'source' | 'target';
    label?: string;
}

export interface EntityConfig {
    id: string;
    displayName: string;
    icon: LucideIcon;
    iconColor?: string;
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
    minWidth?: string;
    handles: EntityHandle[];
    // Defines which entities this one can connect to (for relationship validation)
    allowedTargets?: string[];
    // Defines which entities can connect to this one
    allowedSources?: string[];
    // Special styling rules
    styling?: {
        primary?: boolean; // If this is a primary entity (like policy)
        selectedBorderColor?: string;
        selectedTextColor?: string;
        thickBorderOnPolicyPath?: boolean;
    };
    // Optional multiselect configuration for selecting specific target IDs when policy applies
    multiselect?: {
        // If true, UI may show a multiselect control for choosing specific target IDs
        enabled?: boolean;
        // Static set of options (id/label) for the multiselect; optional if an optionsProvider is supplied
        options?: { id: string; label: string }[];
        // Optional async provider to fetch options dynamically (e.g. from an API). The signature accepts an optional query and returns a promise resolving to the same shape as `options`.
        optionsProvider?: (query?: any) => Promise<{ id: string; label: string }[]>;
        // Optional custom React component (component type) or JSX element/node to render the multiselect UI.
        // The component will receive the following props: { edgeId, options, selected, onSelect, onSelectAll }
        customComponent?: React.ComponentType<any> | React.ReactNode;
    };
}

export interface EntityRelationshipConfig {
    sourceEntity: string;
    targetEntity: string;
    sourceHandle: string;
    targetHandle: string;
    label?: string;
    description?: string;
    // Available actions for this relationship
    actions?: string[];
}

// Entity configurations - this replaces hardcoded switch statements
export const ENTITY_CONFIGS: Record<string, EntityConfig> = {
    device: {
        id: 'device',
        displayName: 'Device',
        icon: Shield,
        minWidth: 'min-w-[250px]',
        handles: [
            { id: 'right', position: 'right', type: 'target' },
            { id: 'left', position: 'left', type: 'target' },
            { id: 'bottom', position: 'bottom', type: 'source' },
        ],
        allowedTargets: ['certificate'],
        allowedSources: ['device_group', 'dms', 'policy'],
        styling: {
            thickBorderOnPolicyPath: true,
        },
        multiselect: {
            enabled: true,
            // Provide a component type that receives the injected props
            customComponent: function DeviceTypeFilter({ edgeId, options, selected, onSelect, onSelectAll }: any) {
                const msOptions = (options && options.length > 0)
                    ? options.map((o: any) => ({ value: o.id, label: o.label }))
                    : KEY_TYPE_OPTIONS;

                const allValues = msOptions.map((o: any) => o.value);

                const handleChange = (newSelected: string[]) => {
                    if (onSelectAll) {
                        if (newSelected.length === allValues.length) onSelectAll(true);
                        else if (newSelected.length === 0) onSelectAll(false);
                        else onSelectAll(false);
                    }

                    const prev = new Set(selected || []);
                    const next = new Set(newSelected || []);

                    for (const raw of Array.from(next)) {
                        const v = String(raw);
                        if (!prev.has(v) && onSelect) onSelect(edgeId, v, true);
                    }
                    for (const raw of Array.from(prev)) {
                        const v = String(raw);
                        if (!next.has(v) && onSelect) onSelect(edgeId, v, false);
                    }
                };

                return (
                    <MultiSelectDropdown
                        id={`${edgeId}-type-filter`}
                        options={msOptions}
                        allOptionValues={allValues}
                        selectedValues={selected || []}
                        onChange={handleChange}
                        buttonText="Filter by type..."
                    />
                );
            },
        },
    },
    device_group: {
        id: 'device_group',
        displayName: 'Device Group',
        icon: Users,
        minWidth: 'min-w-[250px]',
        handles: [
            { id: 'left', position: 'left', type: 'source' },
        ],
        allowedTargets: ['device'],
        allowedSources: ['policy'],
        styling: {
            thickBorderOnPolicyPath: true,
        },
        multiselect: {
            enabled: true,
            options: [
                { id: 'group-a', label: 'Group A' },
                { id: 'group-b', label: 'Group B' },
            ]
        },
    },
    dms: {
        id: 'dms',
        displayName: 'DMS',
        icon: Database,
        minWidth: 'min-w-[250px]',
        handles: [
            { id: 'right', position: 'right', type: 'source' },
        ],
        allowedTargets: ['device'],
        allowedSources: ['policy'],
        styling: {
            thickBorderOnPolicyPath: true,
        },
    },
    certificate: {
        id: 'certificate',
        displayName: 'Certificate',
        icon: FileText,
        minWidth: 'min-w-[250px]',
        handles: [
            { id: 'top', position: 'top', type: 'target' },
        ],
        allowedSources: ['device'],
        styling: {
            thickBorderOnPolicyPath: true,
        },
    },
    policy: {
        id: 'policy',
        displayName: 'Policy',
        icon: Shield,
        iconColor: 'text-primary-foreground',
        backgroundColor: 'bg-primary',
        textColor: 'text-primary-foreground',
        borderColor: 'border-primary',
        minWidth: 'min-w-[350px]',
        handles: [
            { id: 'right', position: 'right', type: 'source' },
        ],
        allowedTargets: ['device', 'device_group', 'dms'],
        styling: {
            primary: true,
        },
    },
};

// Relationship configurations - defines valid connections and their properties
export const RELATIONSHIP_CONFIGS: EntityRelationshipConfig[] = [
    {
        sourceEntity: 'policy',
        sourceHandle: 'dynamic', // Will be determined at runtime
        targetEntity: 'device',
        targetHandle: 'left',
        label: 'governs',
        actions: ['read', 'write', 'execute'],
    },
    {
        sourceEntity: 'policy',
        sourceHandle: 'dynamic',
        targetEntity: 'device_group',
        targetHandle: 'left',
        label: 'governs',
        actions: ['read', 'write', 'execute'],
    },
    {
        sourceEntity: 'policy',
        sourceHandle: 'dynamic',
        targetEntity: 'dms',
        targetHandle: 'right',
        label: 'governs',
        actions: ['read', 'write', 'execute'],
    },
    {
        sourceEntity: 'device_group',
        sourceHandle: 'left',
        targetEntity: 'device',
        targetHandle: 'right',
        label: 'belongs_to_group',
        actions: ['manage', 'monitor'],
    },
    {
        sourceEntity: 'dms',
        sourceHandle: 'right',
        targetEntity: 'device',
        targetHandle: 'left',
        label: 'dms_owner',
        actions: ['provision', 'configure', 'monitor'],
    },
    {
        sourceEntity: 'device',
        sourceHandle: 'bottom',
        targetEntity: 'certificate',
        targetHandle: 'top',
        label: 'belongs_to_device',
        actions: ['issue', 'revoke', 'renew'],
    },
];

// Helper functions for working with entity configurations
export class EntityConfigManager {
    static getEntityConfig(entityId: string): EntityConfig | undefined {
        return ENTITY_CONFIGS[entityId];
    }

    static getAllEntityConfigs(): Record<string, EntityConfig> {
        return ENTITY_CONFIGS;
    }

    static getAllRelationships(): EntityRelationshipConfig[] {
        return RELATIONSHIP_CONFIGS;
    }

    static getEntityIcon(entityId: string): LucideIcon {
        const config = this.getEntityConfig(entityId);
        return config?.icon || Database;
    }

    static getEntityDisplayName(entityId: string): string {
        const config = this.getEntityConfig(entityId);
        return config?.displayName || entityId;
    }

    static getEntityHandles(entityId: string): EntityHandle[] {
        const config = this.getEntityConfig(entityId);
        return config?.handles || [];
    }

    static isValidConnection(sourceEntity: string, targetEntity: string, sourceHandle: string, targetHandle: string): boolean {
        return RELATIONSHIP_CONFIGS.some(rel =>
            rel.sourceEntity === sourceEntity &&
            rel.targetEntity === targetEntity &&
            (rel.sourceHandle === 'dynamic' || rel.sourceHandle === sourceHandle) &&
            rel.targetHandle === targetHandle
        );
    }

    static getRelationshipConfig(sourceEntity: string, targetEntity: string): EntityRelationshipConfig | undefined {
        return RELATIONSHIP_CONFIGS.find(rel =>
            rel.sourceEntity === sourceEntity && rel.targetEntity === targetEntity
        );
    }

    static getAvailableActions(sourceEntity: string, targetEntity: string): string[] {
        const config = this.getRelationshipConfig(sourceEntity, targetEntity);
        return config?.actions || [];
    }

    static getRelationshipLabel(sourceEntity: string, targetEntity: string): string | undefined {
        const config = this.getRelationshipConfig(sourceEntity, targetEntity);
        return config?.label;
    }

    // Helper to get available position for dynamic handles
    static getAvailablePosition(entityId: string, existingHandles: string[]): string {
        const config = this.getEntityConfig(entityId);
        if (!config) return 'top';

        const positions = ['top', 'right', 'bottom', 'left'];
        const fixedPositions = config.handles.map(h => h.position);

        // Find first available position not used by fixed handles or existing dynamic handles
        return positions.find(pos =>
            !fixedPositions.includes(pos as any) && !existingHandles.includes(pos)
        ) || 'top';
    }

    // Helper to determine if a handle is a source handle
    static isSourceHandle(entityId: string, handleId: string): boolean {
        const config = this.getEntityConfig(entityId);
        if (!config) return false;

        const handle = config.handles.find(h => h.id === handleId);
        return handle?.type === 'source';
    }

    // Helper to check if entity has special styling
    static shouldUsePrimaryStyle(entityId: string): boolean {
        const config = this.getEntityConfig(entityId);
        return config?.styling?.primary || false;
    }

    static shouldUseThickBorderOnPolicyPath(entityId: string): boolean {
        const config = this.getEntityConfig(entityId);
        return config?.styling?.thickBorderOnPolicyPath || false;
    }

    // Validate that the critical Policy entity exists
    static validatePolicyEntity(): { isValid: boolean; error?: string } {
        const policyConfig = this.getEntityConfig('policy');

        if (!policyConfig) {
            return {
                isValid: false,
                error: 'Policy entity is missing from configuration. This entity is required for the security model.'
            };
        }

        if (!policyConfig.styling?.primary) {
            return {
                isValid: false,
                error: 'Policy entity must have primary styling enabled (styling.primary: true).'
            };
        }

        if (!policyConfig.handles || policyConfig.handles.length === 0) {
            return {
                isValid: false,
                error: 'Policy entity must have at least one handle defined for connections.'
            };
        }

        return { isValid: true };
    }
}

// Export default configurations for backward compatibility and easy access
export default ENTITY_CONFIGS;
