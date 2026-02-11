'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  EdgeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, AlertCircle, Loader2, Workflow } from 'lucide-react';
import type { Rule, RelationRule, SchemaDefinition } from '@/types/authz';
import { SchemaEntityNode } from './flow-nodes/SchemaEntityNode';
import { NestedRuleEdge } from './flow-nodes/NestedRuleEdge';
import { getSchemas, findAmbiguousEntityTypes } from '@/lib/authz-api';
import Dagre from '@dagrejs/dagre';

interface PolicyBuilderFlowProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

const nodeTypes: NodeTypes = {
  schemaEntity: SchemaEntityNode as any,
};

const edgeTypes: EdgeTypes = {
  nestedRule: NestedRuleEdge as any,
};

// Auto-layout using Dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 150, ranksep: 200 });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) => {
    const width = node.type === 'schemaEntity' ? 320 : 300;
    const height = node.type === 'schemaEntity' ? 250 : 280;
    g.setNode(node.id, { width, height });
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const width = node.type === 'schemaEntity' ? 320 : 300;
    const height = node.type === 'schemaEntity' ? 250 : 280;
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function PolicyBuilderFlow({ rules, onChange, error }: PolicyBuilderFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [ruleConfigs, setRuleConfigs] = useState<Array<{ id: string; startingEntity: string }>>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string>('');
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);
  const [ambiguousTypes, setAmbiguousTypes] = useState<Map<string, string[]>>(new Map());
  const isSyncingFromFlow = useRef(false);
  
  // Create stable key for rules to avoid infinite loops
  const rulesKey = useMemo(() => JSON.stringify(rules), [rules]);
  const hasNodes = useRef(false);

  // Load schemas on mount
  useEffect(() => {
    loadSchemas();
  }, []);

  const loadSchemas = async () => {
    try {
      setLoadingSchemas(true);
      const data = await getSchemas();
      setSchemas(data);
      setAmbiguousTypes(findAmbiguousEntityTypes(data));
      setSchemaError(null);
    } catch (err: any) {
      setSchemaError(err.message || 'Failed to load schemas');
    } finally {
      setLoadingSchemas(false);
    }
  };

  // Auto-select first rule when rules are available and nothing is selected
  useEffect(() => {
    if (rules.length > 0 && selectedRuleIndex === null) {
      setSelectedRuleIndex(0);
    } else if (rules.length === 0 && selectedRuleIndex !== null) {
      setSelectedRuleIndex(null);
    } else if (selectedRuleIndex !== null && selectedRuleIndex >= rules.length) {
      // Selected rule was deleted, select the last available rule
      setSelectedRuleIndex(rules.length - 1);
    }
  }, [rules, selectedRuleIndex]);

  // Initialize and sync flow from selected rule when schemas are loaded
  useEffect(() => {
    if (loadingSchemas || schemas.length === 0) return;
    
    // Convert only the selected rule to ruleConfigs
    if (rules && rules.length > 0 && selectedRuleIndex !== null) {
      const selectedRule = rules[selectedRuleIndex];
      const configs: Array<{ id: string; startingEntity: string }> = [];
      
      if (selectedRule && selectedRule.entityType) {
        configs.push({
          id: `rule-${selectedRuleIndex}`,
          startingEntity: selectedRule.entityType,
        });
      }
      
      // Update ruleConfigs when selected rule changes
      const configsChanged = JSON.stringify(configs) !== JSON.stringify(ruleConfigs);
      if (configsChanged) {
        setRuleConfigs(configs);
      }
      
      if (!isInitialized) {
        setIsInitialized(true);
      }
    } else if ((rules.length === 0 || selectedRuleIndex === null) && ruleConfigs.length > 0) {
      // Clear ruleConfigs if no rules or nothing selected
      setRuleConfigs([]);
      if (!isInitialized) {
        setIsInitialized(true);
      }
    } else if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [loadingSchemas, schemas, rules, selectedRuleIndex, isInitialized, ruleConfigs]);

  // Initialize flow with schema nodes based on ruleConfigs, and update from rules prop
  useEffect(() => {
    if (loadingSchemas || schemas.length === 0 || !isInitialized) return;
    
    // Skip if we're currently syncing FROM Flow TO JSON (prevent circular updates)
    if (isSyncingFromFlow.current) {
      console.log('[PolicyBuilderFlow] Skipping useEffect - currently syncing from Flow');
      return;
    }

    // If we already have nodes, update them based on selected rule from rules prop (single source of truth)
    if (nodes.length > 0) {
      hasNodes.current = true;
      const selectedRule = selectedRuleIndex !== null ? rules[selectedRuleIndex] : null;
      
      // Helper function to determine which entities are in the policy tree based on the JSON rule
      const getEntitiesInPolicyTree = (): Set<string> => {
        const entitiesInTree = new Set<string>();
        
        // Add all starting entities
        ruleConfigs.forEach((rc) => entitiesInTree.add(rc.startingEntity));
        
        // Add entities that are targets of relations in the selected rule
        if (selectedRule && selectedRule.relations) {
          selectedRule.relations.forEach((rel) => {
            entitiesInTree.add(rel.to);
          });
        }
        
        return entitiesInTree;
      };

      const entitiesInTree = getEntitiesInPolicyTree();
      
      console.log('[PolicyBuilderFlow] Entities in policy tree:', Array.from(entitiesInTree));
      console.log('[PolicyBuilderFlow] Selected rule:', selectedRule);
      
      // Helper to find incoming relations: if A->B exists in schema, B should show nested rule for A
      const getIncomingRelations = (entityType: string) => {
        const incomingRels: Array<{ name: string; sourceEntity: string }> = [];
        
        // Look through all schemas to find relations pointing TO this entity
        // We check ALL schemas here, filtering by entitiesInTree happens later when determining enabled state
        schemas.forEach((otherSchema) => {
          Object.values(otherSchema.relations).forEach((relation) => {
            if (relation.targetEntity === entityType) {
              // Found a relation FROM another entity TO this entity
              // Only include if the source entity is in the policy tree
              if (entitiesInTree.has(otherSchema.entityType)) {
                incomingRels.push({
                  name: relation.name,
                  sourceEntity: otherSchema.entityType,
                });
              }
            }
          });
        });
        
        return incomingRels;
      };

      // Update existing nodes data based on the selected rule (JSON is source of truth)
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === 'schemaEntity') {
            const entityType = node.id.replace('schema-', '');
            const schema = schemas.find((s) => s.entityType === entityType);
            if (!schema) return node;
            
            const isStartingEntity = ruleConfigs.some((rc) => rc.startingEntity === entityType);
            const isPolicyNode = isStartingEntity;
            
            // For the starting entity, get data from the selected rule (JSON source of truth)
            const nodeActions = isPolicyNode && selectedRule ? selectedRule.actions : [];
            const nodeDirectGrants = isPolicyNode && selectedRule ? (selectedRule.directGrants || []) : [];
            
            // NESTED RULES LOGIC:
            // - Nested rules should ONLY appear on TARGET entities (receiving end of relations)
            // - They should NOT appear on the starting entity
            // - Example: If organization -> building via "My Org", then:
            //   * organization is the source (defines the relation in JSON)
            //   * building is the target (shows the nested rule switch in UI)
            
            const nestedRules: any[] = [];
            
            // Find all incoming relations (relations pointing TO this entity)
            const incomingRelations = getIncomingRelations(entityType);
            
            if (incomingRelations.length > 0) {
              console.log(`[PolicyBuilderFlow] Entity "${entityType}" has ${incomingRelations.length} incoming relations:`, incomingRelations);
            }
            
            // For each incoming relation, check if it's enabled in the JSON rule
            incomingRelations.forEach((incomingRel) => {
              // Check if the source entity (the one that points to us) has this relation in JSON
              if (selectedRule && selectedRule.entityType === incomingRel.sourceEntity && selectedRule.relations) {
                const ruleRelation = selectedRule.relations.find(
                  (r) => r.to.toLowerCase() === entityType.toLowerCase() && 
                         r.via.toLowerCase() === incomingRel.name.toLowerCase()
                );
                
                if (ruleRelation) {
                  console.log(`[PolicyBuilderFlow] ✅ Found matching relation for ${entityType} from ${incomingRel.sourceEntity}:`, ruleRelation);
                  nestedRules.push({
                    sourceEntity: incomingRel.sourceEntity,
                    targetEntity: entityType,
                    relationName: incomingRel.name,
                    enabled: true,
                    actions: ruleRelation.actions || [],
                  });
                } else {
                  console.log(`[PolicyBuilderFlow] ⚪ Relation exists in schema but not enabled: ${incomingRel.sourceEntity} -> ${entityType} via ${incomingRel.name}`);
                  // Relation exists in schema but not enabled in policy
                  nestedRules.push({
                    sourceEntity: incomingRel.sourceEntity,
                    targetEntity: entityType,
                    relationName: incomingRel.name,
                    enabled: false,
                    actions: [],
                  });
                }
              } else {
                console.log(`[PolicyBuilderFlow] ⚪ Source entity mismatch or no relations: ${incomingRel.sourceEntity} -> ${entityType}`);
                // Source entity is not the starting entity, show as disabled
                nestedRules.push({
                  sourceEntity: incomingRel.sourceEntity,
                  targetEntity: entityType,
                  relationName: incomingRel.name,
                  enabled: false,
                  actions: [],
                });
              }
            });
            
            if (nestedRules.length > 0) {
              console.log(`[PolicyBuilderFlow] Entity "${entityType}" nestedRules:`, nestedRules);
            }
            
            console.log(`[PolicyBuilderFlow] Entity "${entityType}" nestedRules:`, nestedRules);
            
            return {
              ...node,
              data: {
                ...node.data,
                schema,
                isStartingEntity,
                isPolicyNode,
                actions: nodeActions,
                directGrants: nodeDirectGrants,
                nestedRules,
                onUpdate: isPolicyNode
                  ? (data: any) => handlePolicyUpdate(schema.entityType, data)
                  : undefined,
                onNestedRuleUpdate: nestedRules.length > 0
                  ? (sourceEntity: string, targetEntity: string, relationName: string, data: any) =>
                      handleNestedRuleUpdate(sourceEntity, targetEntity, relationName, data)
                  : undefined,
              },
            };
          }
          return node;
        })
      );
      return; // Exit after updating existing nodes
    }

    // Initial creation path: create nodes from scratch
    const selectedRule = selectedRuleIndex !== null ? rules[selectedRuleIndex] : null;
    
    // Helper function to determine which entities are in the policy tree
    const getEntitiesInPolicyTree = (): Set<string> => {
      const entitiesInTree = new Set<string>();
      
      // Add all starting entities
      ruleConfigs.forEach((rc) => entitiesInTree.add(rc.startingEntity));
      
      // Add entities that are targets of relations in the selected rule
      if (selectedRule && selectedRule.relations) {
        selectedRule.relations.forEach((rel) => {
          entitiesInTree.add(rel.to);
        });
      }
      
      return entitiesInTree;
    };

    const entitiesInTree = getEntitiesInPolicyTree();
    
    console.log('[PolicyBuilderFlow INIT] Entities in policy tree:', Array.from(entitiesInTree));
    console.log('[PolicyBuilderFlow INIT] Selected rule:', selectedRule);
    
    // Helper to find incoming relations
    const getIncomingRelations = (entityType: string) => {
      const incomingRels: Array<{ name: string; sourceEntity: string }> = [];
      
      schemas.forEach((otherSchema) => {
        Object.values(otherSchema.relations).forEach((relation) => {
          if (relation.targetEntity === entityType) {
            // Only include if the source entity is in the policy tree
            if (entitiesInTree.has(otherSchema.entityType)) {
              incomingRels.push({
                name: relation.name,
                sourceEntity: otherSchema.entityType,
              });
            }
          }
        });
      });
      
      return incomingRels;
    };

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Add schema entity nodes (read-only unless they're policy nodes)
    schemas.forEach((schema, index) => {
      const isStartingEntity = ruleConfigs.some((rc) => rc.startingEntity === schema.entityType);
      const isPolicyNode = isStartingEntity;
      
      // For the starting entity, get data from the selected rule (JSON source of truth)
      const nodeActions = isPolicyNode && selectedRule ? selectedRule.actions : [];
      const nodeDirectGrants = isPolicyNode && selectedRule ? (selectedRule.directGrants || []) : [];
      
      // NESTED RULES LOGIC (same as update path):
      // - Nested rules should ONLY appear on TARGET entities (not starting entity)
      // - Example: If organization -> building via "My Org", building shows the switch
      
      const nestedRules: any[] = [];
      
      // Find all incoming relations
      const incomingRelations = getIncomingRelations(schema.entityType);
      
      if (incomingRelations.length > 0) {
        console.log(`[PolicyBuilderFlow INIT] Entity "${schema.entityType}" has ${incomingRelations.length} incoming relations:`, incomingRelations);
      }
      
      incomingRelations.forEach((incomingRel) => {
        if (selectedRule && selectedRule.entityType === incomingRel.sourceEntity && selectedRule.relations) {
          const ruleRelation = selectedRule.relations.find(
            (r) => r.to.toLowerCase() === schema.entityType.toLowerCase() && 
                   r.via.toLowerCase() === incomingRel.name.toLowerCase()
          );
          
          if (ruleRelation) {
            console.log(`[PolicyBuilderFlow INIT] ✅ Found matching relation for ${schema.entityType} from ${incomingRel.sourceEntity}:`, ruleRelation);
            nestedRules.push({
              sourceEntity: incomingRel.sourceEntity,
              targetEntity: schema.entityType,
              relationName: incomingRel.name,
              enabled: true,
              actions: ruleRelation.actions || [],
            });
          } else {
            console.log(`[PolicyBuilderFlow INIT] ⚪ Relation exists but not enabled: ${incomingRel.sourceEntity} -> ${schema.entityType} via ${incomingRel.name}`);
            nestedRules.push({
              sourceEntity: incomingRel.sourceEntity,
              targetEntity: schema.entityType,
              relationName: incomingRel.name,
              enabled: false,
              actions: [],
            });
          }
        } else {
          console.log(`[PolicyBuilderFlow INIT] ⚪ Source mismatch: ${incomingRel.sourceEntity} -> ${schema.entityType}`);
          nestedRules.push({
            sourceEntity: incomingRel.sourceEntity,
            targetEntity: schema.entityType,
            relationName: incomingRel.name,
            enabled: false,
            actions: [],
          });
        }
      });
      
      if (nestedRules.length > 0) {
        console.log(`[PolicyBuilderFlow INIT] Entity "${schema.entityType}" nestedRules:`, nestedRules);
      }
      
      newNodes.push({
        id: `schema-${schema.entityType}`,
        type: 'schemaEntity',
        position: { x: 0, y: index * 250 },
        data: {
          schema,
          isStartingEntity,
          isPolicyNode,
          actions: nodeActions,
          directGrants: nodeDirectGrants,
          nestedRules,
          onUpdate: isPolicyNode
            ? (data: any) => handlePolicyUpdate(schema.entityType, data)
            : undefined,
          onNestedRuleUpdate: nestedRules.length > 0
            ? (sourceEntity: string, targetEntity: string, relationName: string, data: any) =>
                handleNestedRuleUpdate(sourceEntity, targetEntity, relationName, data)
            : undefined,
        },
        draggable: true,
      });

      // No need to create separate nested rule edges - we'll add controls to schema edges
    });

    // Create edges between schema entities based on their relations
    schemas.forEach((schema) => {
      Object.values(schema.relations).forEach((relation) => {
        const targetExists = schemas.some((s) => s.entityType === relation.targetEntity);
        if (targetExists) {
          const edgeId = `schema-rel-${schema.entityType}-${relation.targetEntity}-${relation.name}`;
          
          // All edges are simple smoothstep edges - nested rule config is in the source node
          newEdges.push({
            id: edgeId,
            source: `schema-${schema.entityType}`,
            target: `schema-${relation.targetEntity}`,
            sourceHandle: 'right',
            targetHandle: 'left',
            label: relation.name,
            type: 'smoothstep',
            animated: false,
            style: {
              stroke: 'hsl(217 91% 60%)',
              strokeWidth: 2,
              strokeDasharray: '3,3',
            },
            labelStyle: {
              fontSize: 10,
              fill: 'hsl(217 91% 60%)',
              fontWeight: 600,
            },
            labelBgStyle: {
              fill: 'hsl(var(--background))',
              fillOpacity: 0.8,
            },
            markerStart: {
              type: MarkerType.ArrowClosed,
              color: 'hsl(217 91% 60%)',
            },
          });
        }
      });
    });

    // Apply auto-layout only on initial creation
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      newNodes,
      newEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    hasNodes.current = true;
  }, [schemas, loadingSchemas, ruleConfigs, rulesKey, isInitialized, selectedRuleIndex]);

  const handlePolicyUpdate = (entityType: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === `schema-${entityType}`
          ? { ...node, data: { ...node.data, ...data } }
          : node
      )
    );
    syncRulesToParent();
  };

  const handleNestedRuleUpdate = (sourceEntity: string, targetEntity: string, relationName: string, ruleData: { enabled: boolean; actions: string[] }) => {
    console.log(`[PolicyBuilderFlow] handleNestedRuleUpdate called:`, { sourceEntity, targetEntity, relationName, ruleData });
    
    setNodes((nds) => {
      // Update the nested rule on the TARGET entity node (where the switch is displayed)
      const updatedNodes = nds.map((node) => {
        if (node.id === `schema-${targetEntity}`) {
          const nestedRules = (node.data.nestedRules as any[]) || [];
          const updatedRules = nestedRules.map((rule: any) =>
            rule.sourceEntity === sourceEntity && rule.relationName === relationName
              ? { ...rule, ...ruleData }
              : rule
          );
          
          console.log(`[PolicyBuilderFlow] Updated nestedRules for ${targetEntity}:`, updatedRules);
          
          return {
            ...node,
            data: {
              ...node.data,
              nestedRules: updatedRules,
            },
          };
        }
        return node;
      });

      return updatedNodes;
    });
    
    // Immediately sync to parent after state update
    setTimeout(() => syncRulesToParent(), 0);
  };

  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (!sourceNode || !targetNode) return;

      // Allow schema -> schema connections with action selection
      if (sourceNode.type === 'schemaEntity' && targetNode.type === 'schemaEntity') {
        const targetSchema = schemas.find((s) => `schema-${s.entityType}` === targetNode.id);
        if (!targetSchema) return;

        // Get available actions from target schema
        const actions = [
          ...(targetSchema.atomicActions || []),
          ...(targetSchema.globalActions || []),
        ];

        setAvailableActions(actions);
        setSelectedActions([]);
        setPendingConnection(params);
        setActionDialogOpen(true);
        return;
      }

      // Only allow rule -> schema connections
      if (sourceNode.type === 'rule' && targetNode.type === 'schemaEntity') {
        const schema = schemas.find((s) => `schema-${s.entityType}` === targetNode.id);
        if (!schema) return;

        // Prompt for relation name if there are relations available
        const relationNames = Object.values(schema.relations).map((r) => r.name);
        
        setEdges((eds) =>
          addEdge(
            {
              ...params,
              type: 'smoothstep',
              animated: true,
              label: relationNames.length > 0 ? `via ${relationNames[0]}` : undefined,
              style: { stroke: 'hsl(142 76% 36%)', strokeDasharray: '5,5' },
              markerStart: { type: MarkerType.ArrowClosed },
            },
            eds
          )
        );
        syncRulesToParent();
      }
    },
    [nodes, schemas, setEdges]
  );

  const syncRulesToParent = () => {
    if (selectedRuleIndex === null) return;
    
    console.log('[PolicyBuilderFlow] Starting sync from Flow to JSON');
    
    // Build the updated rules array immediately (not in setTimeout)
    const updatedRules = [...rules];

    // Generate rule from policy node (starting entity) for selected rule only
    ruleConfigs.forEach((ruleConfig) => {
      const policyNode = nodes.find((n) => n.id === `schema-${ruleConfig.startingEntity}`);
      
      if (policyNode) {
        const policyData = policyNode.data as any;
        
        // Extract nested rules by looking at TARGET entities' nestedRules
        // Since the target entity displays the switch, we need to scan all nodes for enabled nested rules
        // where the sourceEntity matches our starting entity
        const nestedRules: RelationRule[] = [];
        
        nodes.forEach((node) => {
          if (node.type === 'schemaEntity' && node.id !== policyNode.id) {
            const nodeData = node.data as any;
            const targetEntity = node.id.replace('schema-', '');
            
            if (nodeData.nestedRules && Array.isArray(nodeData.nestedRules)) {
              nodeData.nestedRules.forEach((nr: any) => {
                // Check if this nested rule points back to our starting entity
                if (nr.enabled && nr.sourceEntity === ruleConfig.startingEntity) {
                  console.log(`[PolicyBuilderFlow] Found enabled nested rule: ${nr.sourceEntity} -> ${targetEntity} via ${nr.relationName}`);
                  nestedRules.push({
                    to: targetEntity,
                    via: nr.relationName,
                    actions: nr.actions || [],
                    relations: [], // TODO: support deeper nesting
                  });
                }
              });
            }
          }
        });

        updatedRules[selectedRuleIndex] = {
          entityType: ruleConfig.startingEntity,
          actions: policyData.actions || [],
          directGrants: policyData.directGrants || [],
          relations: nestedRules,
        };
      }
    });

    console.log('[PolicyBuilderFlow] Synced to JSON:', JSON.stringify(updatedRules[selectedRuleIndex], null, 2));
    
    // Set flag to prevent circular updates
    isSyncingFromFlow.current = true;
    
    // Call onChange immediately
    onChange(updatedRules);
    
    // Clear flag after a delay to allow re-syncing from external changes
    setTimeout(() => {
      isSyncingFromFlow.current = false;
      console.log('[PolicyBuilderFlow] Sync complete, flag cleared');
    }, 200);
  };

  const addRuleNode = () => {
    if (!selectedEntityType) return;

    const ruleId = `rule-${Date.now()}`;
    setRuleConfigs((prev) => [
      ...prev,
      { id: ruleId, startingEntity: selectedEntityType },
    ]);

    setDialogOpen(false);
    setSelectedEntityType('');
  };

  const createActionEdge = () => {
    if (!pendingConnection || selectedActions.length === 0) return;

    const sourceNode = nodes.find((n) => n.id === pendingConnection.source);
    const targetNode = nodes.find((n) => n.id === pendingConnection.target);

    if (!sourceNode || !targetNode) return;

    const actionLabel = selectedActions.length <= 2 
      ? selectedActions.join(', ') 
      : `${selectedActions.slice(0, 2).join(', ')} +${selectedActions.length - 2}`;

    setEdges((eds) =>
      addEdge(
        {
          ...pendingConnection,
          id: `action-${pendingConnection.source}-${pendingConnection.target}-${Date.now()}`,
          type: 'smoothstep',
          animated: true,
          label: actionLabel,
          data: { actions: selectedActions },
          style: { stroke: 'hsl(142 76% 36%)', strokeWidth: 2.5 },
          labelStyle: { 
            fontSize: 11, 
            fill: 'hsl(142 76% 36%)', 
            fontWeight: 600,
            background: 'hsl(var(--background))',
          },
          labelBgStyle: { 
            fill: 'hsl(var(--background))',
            fillOpacity: 0.9,
          },
          markerStart: { 
            type: MarkerType.ArrowClosed,
            color: 'hsl(142 76% 36%)',
          },
        },
        eds
      )
    );

    setActionDialogOpen(false);
    setPendingConnection(null);
    setSelectedActions([]);
    setAvailableActions([]);
  };

  const toggleAction = (action: string) => {
    setSelectedActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    );
  };

  if (loadingSchemas) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (schemaError || schemas.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {schemaError || 'No schemas available. Please configure schemas first.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border-2">
        <div className="flex gap-3 items-center flex-1">
          <Button onClick={() => setDialogOpen(true)} variant="default" size="default">
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
          
          {rules.length > 0 && (
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Label className="text-sm font-medium whitespace-nowrap">Visualize Rule:</Label>
              <Select
                value={selectedRuleIndex !== null ? selectedRuleIndex.toString() : ''}
                onValueChange={(value) => setSelectedRuleIndex(parseInt(value))}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select a rule..." />
                </SelectTrigger>
                <SelectContent>
                  {rules.map((rule, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Rule {index + 1}</Badge>
                        <span>{rule.entityType || 'Untitled'}</span>
                        <span className="text-muted-foreground text-xs">({rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="px-3 py-1">
            {schemas.length} schema entit{schemas.length !== 1 ? 'ies' : 'y'}
          </Badge>
          <Badge variant="default" className="px-3 py-1">
            {rules.length} rule{rules.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {ruleConfigs.length > 0 && (
        <div style={{ height: '600px' }} className="border-2 rounded-lg bg-background shadow-sm">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'schemaEntity') {
                const isStarting = node.data?.isStartingEntity;
                return isStarting ? 'hsl(142 76% 36%)' : 'hsl(217 91% 60%)';
              }
              return 'hsl(142 76% 36%)';
            }}
          />
        </ReactFlow>
      </div>
      )}

      {ruleConfigs.length === 0 && (
        <div className="border-2 border-dashed rounded-lg bg-muted/30 p-16 text-center">
          <Workflow className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          {rules.length === 0 ? (
            <>
              <p className="text-muted-foreground font-medium">No rules configured yet</p>
              <p className="text-sm text-muted-foreground mt-2">Click &quot;Add Rule&quot; to create your first authorization rule</p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground font-medium">No rule selected</p>
              <p className="text-sm text-muted-foreground mt-2">Select a rule from the dropdown above to visualize its flow</p>
            </>
          )}
        </div>
      )}

      {ruleConfigs.length > 0 && (
      <div className="text-xs space-y-1.5 p-4 bg-muted/20 rounded-lg border">
        <p className="font-semibold text-foreground mb-2">Legend:</p>
        <p className="text-muted-foreground">• <strong className="text-green-600">Green schema nodes</strong> - Starting entities with policy configuration</p>
        <p className="text-muted-foreground">• <strong className="text-amber-600">Amber edge toolbars</strong> - Nested rule switches for related entities</p>
        <p className="text-muted-foreground">• <strong className="text-blue-600">Blue nodes</strong> - Schema entities (read-only structure)</p>
        <p className="text-muted-foreground">• <strong className="text-blue-600">Blue dashed arrows</strong> - Schema relations (database structure)</p>
        <p className="text-muted-foreground">• <strong>Toggle switches</strong> - Enable/disable nested rules</p>
        <p className="text-muted-foreground">• <strong>Expand toolbars</strong> - Configure actions for nested access</p>
      </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Rule</DialogTitle>
            <DialogDescription>
              Select the starting entity for this authorization rule
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Starting Entity</Label>
              <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select starting entity..." />
                </SelectTrigger>
                <SelectContent>
                  {schemas.map((schema) => (
                    <SelectItem key={schema.entityType} value={schema.entityType}>
                      <div className="flex items-center gap-2">
                        <span>{schema.entityType}</span>
                        {schema.namespace && (
                          <Badge variant="outline" className="text-xs">
                            {schema.namespace}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEntityType && ambiguousTypes.has(selectedEntityType) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Warning: Entity type &quot;{selectedEntityType}&quot; exists in multiple namespaces: {ambiguousTypes.get(selectedEntityType)?.join(', ')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addRuleNode} disabled={!selectedEntityType}>
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Actions</DialogTitle>
            <DialogDescription>
              Choose which actions are allowed on this entity
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {availableActions.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No actions available for this entity
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Available Actions:</Label>
                <div className="grid grid-cols-2 gap-2">
                  {availableActions.map((action) => (
                    <Button
                      key={action}
                      variant={selectedActions.includes(action) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleAction(action)}
                      className="justify-start"
                    >
                      {action}
                    </Button>
                  ))}
                </div>
                {selectedActions.length > 0 && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <p className="text-xs font-medium mb-2">Selected Actions:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedActions.map((action) => (
                        <Badge key={action} variant="default" className="bg-green-600">
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setActionDialogOpen(false);
                setPendingConnection(null);
                setSelectedActions([]);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={createActionEdge} 
              disabled={selectedActions.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              Create Connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
