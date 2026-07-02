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
import { Switch } from '@/components/ui/switch';
import { AlertCircle, Loader2, Workflow, Maximize2, Minimize2 } from 'lucide-react';
import type { Rule, RelationRule, SchemaDefinition } from '@/types/authz';
import { SchemaEntityNode } from './flow-nodes/SchemaEntityNode';
import { NestedRuleEdge } from './flow-nodes/NestedRuleEdge';
import { EntityTypeSelector } from './EntityTypeSelector';
import { getSchemas, findAmbiguousEntityTypes } from '@/lib/authz-api';
import { normalizeEntityAddress, toQualifiedEntityType } from '@/lib/policy-format';
import Dagre from '@dagrejs/dagre';

interface PolicyBuilderFlowProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

type RuleConfig = { id: string; startingEntity: string };
type IncomingRelation = { name: string; sourceEntity: string };

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

const getQualifiedEntityType = (schema: SchemaDefinition) => `${schema.schema_name}.${schema.entity_type}`;

const matchesSchemaEntityType = (value: string, schema: SchemaDefinition) => {
  return value === schema.entity_type || value === getQualifiedEntityType(schema);
};

const findSchemaByEntityType = (schemas: SchemaDefinition[], value: string) => {
  return schemas.find((schema) => matchesSchemaEntityType(value, schema));
};

const getRuleQualifiedEntityType = (rule: Rule) =>
  toQualifiedEntityType({ schema_name: rule.schema_name, entity_type: rule.entity_type });

const getRelationTargetQualifiedEntityType = (relation: RelationRule) =>
  toQualifiedEntityType(normalizeEntityAddress(relation.to));

const edgeIsInRulePath = (
  sourceEntity: string,
  target_entity: string,
  relationLabel: string,
  ruleTreeEdgeKeys: Set<string>
) => {
  const normalizedLabel = relationLabel.toLowerCase();
  if (ruleTreeEdgeKeys.has(`${sourceEntity}->${target_entity}:${normalizedLabel}`)) {
    return true;
  }

  for (const edgeKey of ruleTreeEdgeKeys) {
    if (edgeKey.startsWith(`${sourceEntity}->${target_entity}:`)) {
      return true;
    }
  }

  return false;
};

const getEntitiesInPolicyTree = (
  ruleConfigs: RuleConfig[],
  selectedRule: Rule | null,
  schemas: SchemaDefinition[]
): Set<string> => {
  const entitiesInTree = new Set<string>();

  ruleConfigs.forEach((rc) => entitiesInTree.add(rc.startingEntity));

  selectedRule?.relations?.forEach((rel) => {
    const targetQualifiedEntityType = getRelationTargetQualifiedEntityType(rel);
    const targetAddress = normalizeEntityAddress(rel.to);
    const targetSchema = findSchemaByEntityType(schemas, targetQualifiedEntityType);
    entitiesInTree.add(targetSchema?.entity_type || targetAddress.entity_type);
  });

  return entitiesInTree;
};

const getIncomingRelations = (
  schemas: SchemaDefinition[],
  entitiesInTree: Set<string>,
  entity_type: string
): IncomingRelation[] => {
  const incomingRels: IncomingRelation[] = [];

  schemas.forEach((otherSchema) => {
    Object.values(otherSchema.relations).forEach((relation) => {
      if (relation.target_entity === entity_type && entitiesInTree.has(otherSchema.entity_type)) {
        incomingRels.push({
          name: relation.name,
          sourceEntity: otherSchema.entity_type,
        });
      }
    });
  });

  return incomingRels;
};

const getSelectedRuleSourceEntity = (selectedRule: Rule | null, schemas: SchemaDefinition[]) => {
  if (!selectedRule) return '';
  return findSchemaByEntityType(schemas, getRuleQualifiedEntityType(selectedRule))?.entity_type || selectedRule.entity_type;
};

const buildNestedRules = (
  schemas: SchemaDefinition[],
  selectedRule: Rule | null,
  entity_type: string,
  incomingRelations: IncomingRelation[]
) => {
  const selectedRuleSourceEntity = getSelectedRuleSourceEntity(selectedRule, schemas);

  return incomingRelations.map((incomingRel) => {
    const ruleRelation = selectedRule && selectedRuleSourceEntity === incomingRel.sourceEntity && selectedRule.relations
      ? selectedRule.relations.find(
          (r) => (findSchemaByEntityType(schemas, getRelationTargetQualifiedEntityType(r))?.entity_type || normalizeEntityAddress(r.to).entity_type).toLowerCase() === entity_type.toLowerCase() &&
                 r.via.toLowerCase() === incomingRel.name.toLowerCase()
        )
      : undefined;

    return {
      sourceEntity: incomingRel.sourceEntity,
      target_entity: entity_type,
      relationName: incomingRel.name,
      enabled: Boolean(ruleRelation),
      actions: ruleRelation?.actions || [],
    };
  });
};

export function PolicyBuilderFlow({ rules, onChange, error }: PolicyBuilderFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [ruleConfigs, setRuleConfigs] = useState<RuleConfig[]>([]);
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
  const [isolateToRule, setIsolateToRule] = useState(false);
  const [isFlowFullscreen, setIsFlowFullscreen] = useState(false);
  const [ambiguousTypes, setAmbiguousTypes] = useState<Map<string, string[]>>(new Map());
  const isSyncingFromFlow = useRef(false);

  useEffect(() => {
    if (!isFlowFullscreen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFlowFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlowFullscreen]);
  
  // Create stable key for rules to avoid infinite loops
  const rulesKey = useMemo(() => JSON.stringify(rules), [rules]);
  const hasNodes = useRef(false);

  const selectedRule = selectedRuleIndex !== null ? rules[selectedRuleIndex] : null;

  const { ruleTreeEntities, ruleTreeEdgeKeys } = useMemo(() => {
    const entities = new Set<string>();
    const edgeKeys = new Set<string>();

    if (!selectedRule) {
      return { ruleTreeEntities: entities, ruleTreeEdgeKeys: edgeKeys };
    }

    const rootEntity =
      findSchemaByEntityType(schemas, getRuleQualifiedEntityType(selectedRule))?.entity_type ||
      selectedRule.entity_type;

    const resolveRelationTarget = (relation: RelationRule) => {
      const qualifiedTarget = getRelationTargetQualifiedEntityType(relation);
      const fallbackAddress = normalizeEntityAddress(relation.to);
      return findSchemaByEntityType(schemas, qualifiedTarget)?.entity_type || fallbackAddress.entity_type;
    };

    const walkRelations = (relations: RelationRule[], sourceEntity: string) => {
      relations.forEach((relation) => {
        const target_entity = resolveRelationTarget(relation);
        entities.add(target_entity);
        edgeKeys.add(`${sourceEntity}->${target_entity}:${relation.via.toLowerCase()}`);

        if (relation.relations && relation.relations.length > 0) {
          walkRelations(relation.relations, target_entity);
        }
      });
    };

    entities.add(rootEntity);
    walkRelations(selectedRule.relations || [], rootEntity);

    return { ruleTreeEntities: entities, ruleTreeEdgeKeys: edgeKeys };
  }, [rulesKey, selectedRuleIndex, schemas]);

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
      
      if (selectedRule && selectedRule.entity_type) {
        const selectedSchema = findSchemaByEntityType(schemas, getRuleQualifiedEntityType(selectedRule));
        configs.push({
          id: `rule-${selectedRuleIndex}`,
          startingEntity: selectedSchema?.entity_type || selectedRule.entity_type,
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
      return;
    }

    // If we already have nodes, update them based on selected rule from rules prop (single source of truth)
    if (nodes.length > 0) {
      const currentSchemaNodeCount = nodes.filter((node) => node.type === 'schemaEntity').length;
      if (!isolateToRule && currentSchemaNodeCount < schemas.length) {
        setNodes([]);
        setEdges([]);
        return;
      }

      hasNodes.current = true;
      const selectedRule = selectedRuleIndex !== null ? rules[selectedRuleIndex] : null;
      const entitiesInTree = getEntitiesInPolicyTree(ruleConfigs, selectedRule, schemas);

      // Update existing nodes data based on the selected rule (JSON is source of truth)
      setNodes((nds) =>
        nds
          .map((node) => {
          if (node.type === 'schemaEntity') {
            const entity_type = node.id.replace('schema-', '');
            const schema = schemas.find((s) => s.entity_type === entity_type);
            if (!schema) return node;
            
            const isStartingEntity = ruleConfigs.some((rc) => rc.startingEntity === entity_type);
            const isPolicyNode = isStartingEntity;
            const isInRuleTree = ruleTreeEntities.has(entity_type);
            
            // For the starting entity, get data from the selected rule (JSON source of truth)
            const nodeActions = isPolicyNode && selectedRule ? selectedRule.actions : [];
            const nodeDirectGrants = isPolicyNode && selectedRule ? (selectedRule.direct_grants || []) : [];
            
            // NESTED RULES LOGIC:
            // - Nested rules should ONLY appear on TARGET entities (receiving end of relations)
            // - They should NOT appear on the starting entity
            // - Example: If organization -> building via "My Org", then:
            //   * organization is the source (defines the relation in JSON)
            //   * building is the target (shows the nested rule switch in UI)
            
            const incomingRelations = getIncomingRelations(schemas, entitiesInTree, entity_type);
            const nestedRules = buildNestedRules(schemas, selectedRule, entity_type, incomingRelations);
            
            return {
              ...node,
              data: {
                ...node.data,
                schema,
                isStartingEntity,
                isPolicyNode,
                actions: nodeActions,
                direct_grants: nodeDirectGrants,
                nestedRules,
                isReadOnly: true,
                isInRuleTree,
                onUpdate: isPolicyNode
                  ? (data: any) => handlePolicyUpdate(schema.entity_type, data)
                  : undefined,
                onNestedRuleUpdate: nestedRules.length > 0
                  ? (sourceEntity: string, target_entity: string, relationName: string, data: any) =>
                      handleNestedRuleUpdate(sourceEntity, target_entity, relationName, data)
                  : undefined,
              },
            };
          }
            return node;
          })
          .filter((node) => {
            if (node.type !== 'schemaEntity') return true;
            const entity_type = node.id.replace('schema-', '');
            return !isolateToRule || ruleTreeEntities.has(entity_type);
          })
      );

      setEdges((currentEdges) =>
        currentEdges
          .filter((edge) => {
            const sourceEntity = edge.source.replace('schema-', '');
            const target_entity = edge.target.replace('schema-', '');
            return !isolateToRule || (ruleTreeEntities.has(sourceEntity) && ruleTreeEntities.has(target_entity));
          })
          .map((edge) => {
            const sourceEntity = edge.source.replace('schema-', '');
            const target_entity = edge.target.replace('schema-', '');
            const relationLabel = typeof edge.label === 'string' ? edge.label : '';
            const isRuleEdge = edgeIsInRulePath(sourceEntity, target_entity, relationLabel, ruleTreeEdgeKeys);

            return {
              ...edge,
              animated: isRuleEdge,
              style: {
                stroke: isRuleEdge ? 'hsl(142 76% 36%)' : 'hsl(214, 89%, 4%)',
                strokeWidth: isRuleEdge ? 4 : 2.5,
                opacity: isRuleEdge ? 1 : 0.55,
              },
              labelStyle: {
                fontSize: 10,
                fill: isRuleEdge ? 'hsl(142 76% 36%)' : 'hsl(215 20% 45%)',
                fontWeight: 600,
              },
              markerStart: {
                type: MarkerType.ArrowClosed,
                color: isRuleEdge ? 'hsl(142 76% 36%)' : 'hsl(215 20% 65%)',
              },
            };
          })
      );
      return; // Exit after updating existing nodes
    }

    // Initial creation path: create nodes from scratch
    const selectedRule = selectedRuleIndex !== null ? rules[selectedRuleIndex] : null;
    const entitiesInTree = getEntitiesInPolicyTree(ruleConfigs, selectedRule, schemas);

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Add schema entity nodes (read-only unless they're policy nodes)
    schemas.forEach((schema, index) => {
      const isStartingEntity = ruleConfigs.some((rc) => rc.startingEntity === schema.entity_type);
      const isPolicyNode = isStartingEntity;
      const isInRuleTree = ruleTreeEntities.has(schema.entity_type);

      if (isolateToRule && !isInRuleTree) {
        return;
      }
      
      // For the starting entity, get data from the selected rule (JSON source of truth)
      const nodeActions = isPolicyNode && selectedRule ? selectedRule.actions : [];
      const nodeDirectGrants = isPolicyNode && selectedRule ? (selectedRule.direct_grants || []) : [];
      
      // NESTED RULES LOGIC (same as update path):
      // - Nested rules should ONLY appear on TARGET entities (not starting entity)
      // - Example: If organization -> building via "My Org", building shows the switch
      
      const incomingRelations = getIncomingRelations(schemas, entitiesInTree, schema.entity_type);
      const nestedRules = buildNestedRules(schemas, selectedRule, schema.entity_type, incomingRelations);
      
      newNodes.push({
        id: `schema-${schema.entity_type}`,
        type: 'schemaEntity',
        position: { x: 0, y: index * 250 },
        data: {
          schema,
          isStartingEntity,
          isPolicyNode,
          actions: nodeActions,
          direct_grants: nodeDirectGrants,
          nestedRules,
          isReadOnly: true,
          isInRuleTree,
          onUpdate: isPolicyNode
            ? (data: any) => handlePolicyUpdate(schema.entity_type, data)
            : undefined,
          onNestedRuleUpdate: nestedRules.length > 0
            ? (sourceEntity: string, target_entity: string, relationName: string, data: any) =>
                handleNestedRuleUpdate(sourceEntity, target_entity, relationName, data)
            : undefined,
        },
        draggable: false,
      });

      // No need to create separate nested rule edges - we'll add controls to schema edges
    });

    // Create edges between schema entities based on their relations
    schemas.forEach((schema) => {
      Object.values(schema.relations).forEach((relation) => {
        const targetExists = schemas.some((s) => s.entity_type === relation.target_entity);
        if (targetExists) {
          const edgeId = `schema-rel-${schema.entity_type}-${relation.target_entity}-${relation.name}`;
          
          // All edges are simple smoothstep edges - nested rule config is in the source node
          const isRuleEdge = edgeIsInRulePath(
            schema.entity_type,
            relation.target_entity,
            relation.name,
            ruleTreeEdgeKeys
          );

          if (
            isolateToRule &&
            (!ruleTreeEntities.has(schema.entity_type) || !ruleTreeEntities.has(relation.target_entity))
          ) {
            return;
          }

          newEdges.push({
            id: edgeId,
            source: `schema-${schema.entity_type}`,
            target: `schema-${relation.target_entity}`,
            sourceHandle: 'right',
            targetHandle: 'left',
            label: relation.name,
            type: 'smoothstep',
            animated: isRuleEdge,
            style: {
              stroke: isRuleEdge ? 'hsl(142 76% 36%)' : 'hsl(215 20% 65%)',
              strokeWidth: isRuleEdge ? 4 : 2.5,
              opacity: isRuleEdge ? 1 : 0.55,
            },
            labelStyle: {
              fontSize: 10,
              fill: isRuleEdge ? 'hsl(142 76% 36%)' : 'hsl(215 20% 45%)',
              fontWeight: 600,
            },
            labelBgStyle: {
              fill: 'hsl(var(--background))',
              fillOpacity: 0.8,
            },
            markerStart: {
              type: MarkerType.ArrowClosed,
              color: isRuleEdge ? 'hsl(142 76% 36%)' : 'hsl(215 20% 65%)',
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
  }, [schemas, loadingSchemas, ruleConfigs, rulesKey, isInitialized, selectedRuleIndex, isolateToRule, ruleTreeEntities, ruleTreeEdgeKeys]);

  const handlePolicyUpdate = (entity_type: string, data: any) => {
    let latestNodes: Node[] = nodes;
    setNodes((nds) => {
      latestNodes = nds.map((node) =>
        node.id === `schema-${entity_type}`
          ? { ...node, data: { ...node.data, ...data } }
          : node
      );
      return latestNodes;
    });
    syncRulesToParent(latestNodes);
  };

  const handleNestedRuleUpdate = (sourceEntity: string, target_entity: string, relationName: string, ruleData: { enabled: boolean; actions: string[] }) => {
    let latestNodes: Node[] = nodes;
    setNodes((nds) => {
      const updatedNodes = nds.map((node) => {
        if (node.id === `schema-${target_entity}`) {
          const nestedRules = (node.data.nestedRules as any[]) || [];
          const updatedRules = nestedRules.map((rule: any) =>
            rule.sourceEntity === sourceEntity && rule.relationName === relationName
              ? { ...rule, ...ruleData }
              : rule
          );
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
      latestNodes = updatedNodes;
      return updatedNodes;
    });
    syncRulesToParent(latestNodes);
  };

  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (!sourceNode || !targetNode) return;

      // Allow schema -> schema connections with action selection
      if (sourceNode.type === 'schemaEntity' && targetNode.type === 'schemaEntity') {
        const targetSchema = schemas.find((s) => `schema-${s.entity_type}` === targetNode.id);
        if (!targetSchema) return;

        // Get available actions from target schema
        const actions = [
          ...(targetSchema.atomic_actions || []),
          ...(targetSchema.global_actions || []),
        ];

        setAvailableActions(actions);
        setSelectedActions([]);
        setPendingConnection(params);
        setActionDialogOpen(true);
        return;
      }

      // Only allow rule -> schema connections
      if (sourceNode.type === 'rule' && targetNode.type === 'schemaEntity') {
        const schema = schemas.find((s) => `schema-${s.entity_type}` === targetNode.id);
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

  const syncRulesToParent = (currentNodes?: Node[]) => {
    if (selectedRuleIndex === null) return;

    const activeNodes = currentNodes ?? nodes;
    const updatedRules = [...rules];

    ruleConfigs.forEach((ruleConfig) => {
      const policyNode = activeNodes.find((n) => n.id === `schema-${ruleConfig.startingEntity}`);

      if (policyNode) {
        const policyData = policyNode.data as any;
        const existingRule = updatedRules[selectedRuleIndex] || {
          namespace: '',
          schema_name: '',
          entity_type: '',
          actions: [],
          relations: [],
        };
        const sourceSchema = schemas.find((schema) => schema.entity_type === ruleConfig.startingEntity);

        const nestedRules: RelationRule[] = [];

        activeNodes.forEach((node) => {
          if (node.type === 'schemaEntity' && node.id !== policyNode.id) {
            const nodeData = node.data as any;
            const target_entity = node.id.replace('schema-', '');

            if (nodeData.nestedRules && Array.isArray(nodeData.nestedRules)) {
              nodeData.nestedRules.forEach((nr: any) => {
                if (nr.enabled && nr.sourceEntity === ruleConfig.startingEntity) {
                  const targetSchema = schemas.find((schema) => schema.entity_type === target_entity);
                  nestedRules.push({
                    to: {
                      schema_name: targetSchema?.schema_name || '',
                      entity_type: targetSchema?.entity_type || target_entity,
                    },
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
          ...existingRule,
          namespace: sourceSchema?.namespace || existingRule.namespace,
          schema_name: sourceSchema?.schema_name || existingRule.schema_name,
          entity_type: sourceSchema?.entity_type || ruleConfig.startingEntity,
          actions: policyData.actions || [],
          direct_grants: policyData.direct_grants || [],
          relations: nestedRules,
        };
      }
    });

    isSyncingFromFlow.current = true;
    onChange(updatedRules);
    setTimeout(() => {
      isSyncingFromFlow.current = false;
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
                        <span>{getRuleQualifiedEntityType(rule) || 'Untitled'}</span>
                        <span className="text-muted-foreground text-xs">({rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2 pl-2">
            <Label htmlFor="isolate-to-rule" className="text-sm font-medium whitespace-nowrap">
              Isolate to rule
            </Label>
            <Switch
              id="isolate-to-rule"
              checked={isolateToRule}
              onCheckedChange={setIsolateToRule}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {ruleConfigs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFlowFullscreen((previous) => !previous)}
              className="flex items-center gap-2"
            >
              {isFlowFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {isFlowFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </Button>
          )}
          <Badge variant="secondary" className="px-3 py-1">
            {schemas.length} schema entit{schemas.length !== 1 ? 'ies' : 'y'}
          </Badge>
          <Badge variant="default" className="px-3 py-1">
            {rules.length} rule{rules.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {ruleConfigs.length > 0 && (
        <div
          style={{ height: isFlowFullscreen ? '100vh' : '600px' }}
          className={isFlowFullscreen
            ? 'fixed inset-0 z-50 border-0 rounded-none bg-background shadow-xl'
            : 'border-2 rounded-lg bg-background shadow-sm'}
        >
        {isFlowFullscreen && (
          <div className="absolute right-4 top-4 z-10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFlowFullscreen(false)}
              className="flex items-center gap-2 bg-background"
            >
              <Minimize2 className="h-4 w-4" />
              Exit Full Screen
            </Button>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
        </ReactFlow>
      </div>
      )}

      {ruleConfigs.length === 0 && (
        <div className="border-2 border-dashed rounded-lg bg-muted/30 p-16 text-center">
          <Workflow className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          {rules.length === 0 ? (
            <>
              <p className="text-muted-foreground font-medium">No rules configured yet</p>
              <p className="text-sm text-muted-foreground mt-2">Create a rule in Form or JSON mode to visualize it here</p>
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
        <p className="text-muted-foreground">• <strong className="text-green-600">Green nodes</strong> - Rule starting entity</p>
        <p className="text-muted-foreground">• <strong className="text-amber-600">Amber nodes</strong> - Entities included in the selected rule tree</p>
        <p className="text-muted-foreground">• <strong className="text-slate-600">Gray nodes</strong> - Other schema entities</p>
        <p className="text-muted-foreground">• <strong className="text-green-600">Green edges</strong> - Relations used by the selected rule</p>
        <p className="text-muted-foreground">• <strong className="text-slate-600">Gray dashed edges</strong> - Other schema relations</p>
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
              <EntityTypeSelector
                id="policy-flow-starting-entity"
                schemas={schemas}
                value={selectedEntityType}
                onValueChange={setSelectedEntityType}
                placeholder="Select starting entity..."
              />
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
