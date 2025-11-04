'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeTypes,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  useUpdateNodeInternals,
  EdgeProps,
  EdgeLabelRenderer,
  BaseEdge,
  getBezierPath,
  EdgeTypes,
  OnConnectStart,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield } from 'lucide-react';
import { EntityConfigManager } from '@/lib/entity-config';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import { Input } from '@/components/ui/input';

// Custom edge component with floating action panel
const CustomEdgeWithActions = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  label,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showActionsPanel = (data as any)?.showActionsPanel || false;
  const targetNodeActions = (data as any)?.targetNodeActions || [];
  const edgePermissions = (data as any)?.edgePermissions || {};
  const onActionToggle = (data as any)?.onActionToggle;
  const selectAllForEdge = (data as any)?.selectAllForEdge;
  const selectedTargets = (data as any)?.selectedTargets || [];
  const onSelectTarget = (data as any)?.onSelectTarget;
  const onSelectAll = (data as any)?.onSelectAll;
  const multiselectOptions = (data as any)?.multiselectOptions || [];
  const multiselectCustomComponent = (data as any)?.multiselectCustomComponent;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style as any} />
      <EdgeLabelRenderer>
        {label && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              fontWeight: 600,
              background: 'white',
              padding: '2px 8px',
              borderRadius: '4px',
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        )}
        {showActionsPanel && targetNodeActions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + 40}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <Card className="shadow-lg border-2 border-primary bg-background min-w-[200px]">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold">Allowed Actions</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="space-y-2">
                  {targetNodeActions.map((action: string) => {
                    const isChecked = edgePermissions[action] || false;
                    return (
                      <div key={action} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${id}-${action}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (onActionToggle) {
                              onActionToggle(id, action, checked);
                            }
                          }}
                        />
                        <label
                          htmlFor={`${id}-${action}`}
                          className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {action}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Targets panel for policy edges: separate floating card */}
        {data?.isPolicyEdge && ( (multiselectOptions && multiselectOptions.length > 0) || multiselectCustomComponent ) && (
          <TargetsPanel
            id={id}
            labelX={labelX}
            labelY={labelY}
            showActionsPanel={showActionsPanel}
            selectAllForEdge={selectAllForEdge}
            selectedTargets={selectedTargets}
            onSelectAll={onSelectAll}
            onSelectTarget={onSelectTarget}
            multiselectOptions={multiselectOptions}
            multiselectCustomComponent={multiselectCustomComponent}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
};

// TargetsPanel: separate floating panel that can be collapsed and measures DOM to avoid overlap
const TargetsPanel = ({
  id,
  labelX,
  labelY,
  showActionsPanel,
  selectAllForEdge,
  selectedTargets,
  onSelectAll,
  onSelectTarget,
  multiselectOptions,
  multiselectCustomComponent,
}: any) => {
  const actionsRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [offsetX, setOffsetX] = React.useState(0);
  const [isOpen, setIsOpen] = React.useState(true);

  // Measure widths and compute offset to avoid overlap
  useEffect(() => {
    const measure = () => {
      const actionsWidth = actionsRef.current?.offsetWidth || 0;
      const panelWidth = panelRef.current?.offsetWidth || 0;
      // If actions panel visible, offset by actionsWidth + some gap; otherwise keep centered
      const desiredOffset = showActionsPanel ? actionsWidth / 2 + panelWidth / 2 + 12 : 0;
      setOffsetX(desiredOffset);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showActionsPanel]);

  // Render
  return (
    <div ref={panelRef}
      style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX + offsetX}px,${labelY + 40}px)`,
        pointerEvents: 'all',
      }}
      className="nodrag nopan"
    >
      <Card className="shadow-lg border-2 border-primary bg-background min-w-[220px]">
        <CardHeader className="pb-2 pt-3 px-3 flex items-center justify-between">
          <CardTitle className="text-xs font-semibold">Targets</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? 'Collapse' : 'Open'}
            </Button>
          </div>
        </CardHeader>
        {isOpen && (
          <CardContent className="px-3 pb-3 pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium">Select targets</label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-select-all`}
                    checked={selectAllForEdge === true}
                    onCheckedChange={(checked: any) => {
                      if (onSelectAll) onSelectAll(id, checked === true);
                    }}
                  />
                  <label htmlFor={`${id}-select-all`} className="text-xs">Select all</label>
                </div>
              </div>

              {/* Render custom component if provided */}
              {multiselectCustomComponent ? (
                // Inject props into many possible shapes of customComponent:
                // - JSX element: clone with injected props
                // - Component type: create it with injected props
                // - Component that returns a MultiSelectDropdown with fixed props: if detected, clone that inner dropdown and inject working handlers
                (() => {
                  const injectedProps = {
                    edgeId: id,
                    options: multiselectOptions,
                    selected: selectedTargets,
                    onSelect: (targetId: string, checked: boolean) => onSelectTarget && onSelectTarget(id, targetId, checked),
                    onSelectAll: (checked: boolean) => onSelectAll && onSelectAll(id, checked),
                  } as any;

                  if (React.isValidElement(multiselectCustomComponent)) {
                    return React.cloneElement(multiselectCustomComponent as React.ReactElement, injectedProps);
                  }

                  // Try creating element with injected props (works for function/class components)
                  try {
                    const created = React.createElement(multiselectCustomComponent as React.ComponentType<any>, injectedProps);
                    // Return the created custom component element; it should render its own inner MultiSelectDropdown
                    return created;
                  } catch (e) {
                    // Fallback: just render nothing if creation fails
                    return null;
                  }
                })()
              ) : (
                // Fallback searchable dropdown (uses MultiSelectDropdown as base + search input)
                <div>
                  <Input placeholder="Search targets..." className="mb-2" onChange={() => { /* simple placeholder, not used for filtering here yet */ }} />
                  <MultiSelectDropdown
                    id={`${id}-targets-dropdown`}
                    options={multiselectOptions.map((o: any) => ({ value: o.id, label: o.label }))}
                    allOptionValues={multiselectOptions.map((o: any) => o.id)}
                    selectedValues={selectedTargets}
                    onChange={(selected: string[]) => {
                      // Replace entire set (clear select-all when using explicit selection)
                      if (onSelectAll) onSelectAll(id, false);
                      // compute diffs and trigger per-item toggles
                      // set selected directly by calling onSelectTarget for each option
                      // we'll clear previous selections by calling onSelectTarget(false) for those removed
                      const prev = new Set(selectedTargets || []);
                      const next = new Set(selected || []);

                      // Added
                      for (const t of next) {
                        if (!prev.has(t) && onSelectTarget) onSelectTarget(id, t, true);
                      }
                      // Removed
                      for (const t of prev) {
                        if (!next.has(t) && onSelectTarget) onSelectTarget(id, t, false);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

// Custom node component for entities
const EntityNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  // Extract isConnectingFromPolicy from data
  const isConnectingFromPolicy = data.isConnectingFromPolicy || false;
  // Local cache not required; read permissions from the global nodeHandlePermissions via data.nodeHandlePermissions[data.nodeId]
  // This avoids synchronization bugs. If UI needs instant feedback, parent updates nodeHandlePermissions which will re-render this node.

  const getEntityIcon = (entityName: string) => {
    const IconComponent = EntityConfigManager.getEntityIcon(entityName);
    const config = EntityConfigManager.getEntityConfig(entityName);
    const iconClass = config?.iconColor || '';
    return <IconComponent className={`h-5 w-5 ${iconClass}`} />;
  };

  // Determine border and text colors based on selection state
  const getBorderColor = () => {
    const config = EntityConfigManager.getEntityConfig(data.name);

    if (EntityConfigManager.shouldUsePrimaryStyle(data.name)) {
      return config?.borderColor || 'border-primary';
    }
    if (selected) return 'border-blue-500';

    // Check if this node has a policy connection (should be blue)
    if (hasPolicyConnection) return 'border-blue-500';

    // Check if this node has any incoming blue edges (granted permissions from other nodes)
    if (hasIncomingBlueEdges) return 'border-blue-500';

    return 'border-gray-300'; // Default gray border instead of red
  };

  const getTextColor = () => {
    const config = EntityConfigManager.getEntityConfig(data.name);

    if (EntityConfigManager.shouldUsePrimaryStyle(data.name)) {
      return config?.textColor || 'text-primary-foreground';
    }
    if (selected) return 'text-blue-600';

    // Check if this node has a policy connection (should be blue)
    if (hasPolicyConnection) return 'text-blue-600';

    // Check if this node has any incoming blue edges (granted permissions from other nodes)
    if (hasIncomingBlueEdges) return 'text-blue-600';

    return 'text-gray-700'; // Default gray text instead of red
  };

  const getBackgroundColor = () => {
    const config = EntityConfigManager.getEntityConfig(data.name);

    if (EntityConfigManager.shouldUsePrimaryStyle(data.name)) {
      return config?.backgroundColor || 'bg-primary';
    }
    return 'bg-background';
  };

  const getNodeWidth = () => {
    const config = EntityConfigManager.getEntityConfig(data.name);
    return config?.minWidth || 'min-w-[250px]';
  };

  const getBorderWidth = () => {
    // Check if there's a path from policy via granted permissions
    const thisNodeId = data.nodeId || data.name;

    // Policy always gets default border
    if (thisNodeId === 'policy') return 'border-2';

    // Check if entity should use thick border on policy path
    if (!EntityConfigManager.shouldUseThickBorderOnPolicyPath(thisNodeId)) {
      return 'border-2';
    }

    // Check if there's a path from policy to this node via granted permissions
    const hasPathFromPolicy = hasPathFromPolicyViaGrantedPermissions(
      thisNodeId,
      data.nodeHandlePermissions || {},
      data.allEdges || []
    );

    if (hasPathFromPolicy) {
      return 'border-[5px]'; // Thicker border when there's a path from policy
    }

    return 'border-2'; // Default border
  };

  // Get available positions for dynamic handles
  const getAvailablePosition = (nodeId: string, existingHandles: string[]) => {
    return EntityConfigManager.getAvailablePosition(nodeId, existingHandles);
  };

  // Get dynamic handles for this node
  const dynamicHandlesForNode = data.dynamicHandles || [];

  // Check if this node has a policy connection (incoming edge from policy)
  const hasPolicyConnection = data.hasPolicyConnection || false;

  // Get incoming edges for this node to determine which handles need permission buttons
  const incomingEdges = data.incomingEdges || [];
  // Get outgoing edges for this node
  const outgoingEdges = data.outgoingEdges || [];
  // Check if this node has any incoming blue edges (granted permissions)
  const hasIncomingBlueEdges = data.hasIncomingBlueEdges || false;

  const toggleHandlePermission = (handleId: string) => {
    const thisNodeId = data.nodeId || data.name;
    const current = data.nodeHandlePermissions?.[thisNodeId] || {};
    const newGranted = !current[handleId];

    // Notify parent component about permission changes using node id as key
    if (data.onPermissionChange) {
      data.onPermissionChange(thisNodeId, handleId, newGranted);
    }
  };

  // Helper function to check if there's a path from Policy to this node via granted permissions
  const hasPathFromPolicyViaGrantedPermissions = (targetNodeId: string, nodeHandlePermissions: any, allEdges: any[]) => {
    // If this is the policy node itself, it always has a path to itself
    if (targetNodeId === 'policy') {
      return true;
    }

    // Use BFS to find a path from policy to targetNodeId through granted permissions
    const visited = new Set();
    const queue = ['policy']; // Start from policy

    while (queue.length > 0) {
      const currentNode = queue.shift()!;

      if (currentNode === targetNodeId) {
        return true; // Found a path
      }

      if (visited.has(currentNode)) {
        continue;
      }
      visited.add(currentNode);

      // Find all edges from current node
      const outgoingEdges = allEdges.filter(edge => edge.source === currentNode);

      for (const edge of outgoingEdges) {
        const nextNode = edge.target;

        if (currentNode === 'policy') {
          // For policy connections, just having the connection is enough to continue
          if (!visited.has(nextNode)) {
            queue.push(nextNode);
          }
        } else {
          // For non-policy connections, the source handle must be granted (green)
          if (edge.sourceHandle) {
            const sourcePermissions = nodeHandlePermissions[currentNode] || {};
            const isSourceGranted = sourcePermissions[edge.sourceHandle];

            if (isSourceGranted && !visited.has(nextNode)) {
              queue.push(nextNode);
            }
          }
        }
      }
    }

    return false; // No path found
  };

  const getHandleColor = (handleId: string) => {
    // Get this node's permissions from global state (use nodeId)
    const thisNodeId = data.nodeId || data.name;
    const thisNodePermissions = data.nodeHandlePermissions?.[thisNodeId] || {};
    const thisHandlePermission = thisNodePermissions[handleId];

    // ENHANCED LOGIC: Only source handles that connect to related nodes AND have path from policy get green/red colors

    const nodeType = data.name;
    const isSource = isSourceHandle(nodeType, handleId);

    // Only color source handles that connect to related nodes
    if (isSource) {
      const connectsToRelatedNode = outgoingEdges.some((edge: any) => {
        return edge.sourceHandle === handleId && edge.target;
      });

      // NEW RULE: Must also have a path from Policy via granted permissions
      const hasPathFromPolicy = hasPathFromPolicyViaGrantedPermissions(
        thisNodeId,
        data.nodeHandlePermissions || {},
        data.allEdges || []
      );

      if (connectsToRelatedNode && hasPathFromPolicy) {
        return thisHandlePermission ? '#22c55e' : '#ef4444'; // Green if granted, red if denied
      }
    }

    return '#6366f1'; // Default primary color for all other handles
  };

  // Helper function to determine if a handle is a source handle based on node type and handle ID
  const isSourceHandle = (nodeType: string, handleId: string) => {
    return EntityConfigManager.isSourceHandle(nodeType, handleId);
  };

  const isClickableHandle = (handleId: string) => {
    // ENHANCED LOGIC: Source handles get green/red buttons when they connect to related nodes 
    // AND there's a path from Policy via granted permissions

    const nodeType = data.name;
    const isSource = isSourceHandle(nodeType, handleId);

    // Only source handles can be clickable
    if (!isSource) {
      return false;
    }

    // Check if this source handle connects to a related node (target of an edge)
    const connectsToRelatedNode = outgoingEdges.some((edge: any) => {
      return edge.sourceHandle === handleId && edge.target;
    });

    // NEW RULE: Must also have a path from Policy via granted permissions
    const thisNodeId = data.nodeId || data.name;
    const hasPathFromPolicy = hasPathFromPolicyViaGrantedPermissions(
      thisNodeId,
      data.nodeHandlePermissions || {},
      data.allEdges || []
    );

    if (connectsToRelatedNode && hasPathFromPolicy) {
      return true;
    }

    return false;
  };

  return (
    <div className="relative">
      <Card className={`shadow-lg cursor-pointer ${getBorderWidth()} ${getNodeWidth()} ${getBorderColor()} ${getBackgroundColor()}`}>
        <CardHeader className="pb-2">
          <CardTitle className={`flex items-center gap-2 text-sm ${getTextColor()}`}>
            {getEntityIcon(data.name)}
            {data.name}
          </CardTitle>
        </CardHeader>
        {data.name === 'policy' ? (
          <div className='mt-5' />
        ) : (
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description:</p>
              <p className="text-xs">{data.description}</p>
            </div>
          </CardContent>
        )}

        {/* Invisible handles for connections */}
        {/* Only render a central target handle for non-policy nodes when connecting from policy */}
        {data.name !== 'policy' && (
          <Handle
            id="node-center"
            type="target"
            position={Position.Top}
            className="opacity-0"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '200px',
              height: '120px',
              transform: 'translate(-50%, -50%)',
              background: 'transparent',
              border: 'none',
              borderRadius: '8px',
              pointerEvents: 'auto',
              zIndex: 10,
              display: isConnectingFromPolicy ? 'block' : 'none',
            }}
          />
        )}
      </Card>

      {/* Connection handles - Generated from entity configuration */}
      {(() => {
        const entityConfig = EntityConfigManager.getEntityConfig(data.name);
        if (!entityConfig) return null;

        // Helper function to convert position string to Position enum
        const getPositionEnum = (position: string) => {
          switch (position) {
            case 'top': return Position.Top;
            case 'right': return Position.Right;
            case 'bottom': return Position.Bottom;
            case 'left': return Position.Left;
            default: return Position.Top;
          }
        };

        // Generate handles from configuration
        const configuredHandles = entityConfig.handles.map((handleConfig) => {
          const handleId = handleConfig.id;
          const isPolicy = data.name === 'policy';

          // Permission state for this handle (reads from provided nodeHandlePermissions)
          const thisNodeId = data.nodeId || data.name;
          const isGranted = !!(data.nodeHandlePermissions?.[thisNodeId]?.[handleId]);

          const clickable = isClickableHandle(handleId);

          // Larger pill-like button when clickable, otherwise smaller circular handle
          return (
            <Handle
              key={handleId}
              id={handleId}
              type={handleConfig.type as 'source' | 'target'}
              position={getPositionEnum(handleConfig.position)}
              isConnectable={isPolicy ? ((connection: any) => {
                const count = data.policyOutgoingCount || 0;
                return count < 1;
              }) as any : true}
              className={clickable ? 'cursor-pointer' : ''}
              title={clickable ? 'Toggle permission' : undefined}
              aria-label={clickable ? `permission-${handleId}` : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: clickable ? 32 : 16,
                height: clickable ? 32 : 16,
                borderRadius: '9999px',
                backgroundColor: isPolicy ? undefined : getHandleColor(handleId),
                boxShadow: clickable ? '0 8px 16px rgba(0,0,0,0.12)' : undefined,
                transition: 'transform 120ms ease, box-shadow 120ms ease',
              }}
              onClick={clickable ? (e: React.MouseEvent) => {
                e.stopPropagation();
                toggleHandlePermission(handleId);
              } : undefined}
              >
              {clickable ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '9999px',
                    backgroundColor: isGranted ? '#ffffff' : 'transparent',
                    border: isGranted ? undefined : '2px solid rgba(255,255,255,0.9)'
                  }} />
                </div>
              ) : null}
            </Handle>
          );
        });

        // Add dynamic handles for policy connections (if not policy entity)
        const dynamicHandles = data.name !== 'policy' ? dynamicHandlesForNode.map((handleId: string) => {
          const position = handleId === 'top' ? Position.Top : 
                         handleId === 'right' ? Position.Right : 
                         handleId === 'bottom' ? Position.Bottom : Position.Left;
          const fullHandleId = `dynamic-${handleId}`;
          
          return (
            <Handle
              key={fullHandleId}
              id={fullHandleId}
              type="target"
              position={position}
              className={`border-2 border-white shadow-lg ${isClickableHandle(fullHandleId) ? 'cursor-pointer' : ''} flex items-center justify-center`}
              title={isClickableHandle(fullHandleId) ? 'Toggle permission' : undefined}
              aria-label={isClickableHandle(fullHandleId) ? `permission-${fullHandleId}` : undefined}
              style={{
                width: isClickableHandle(fullHandleId) ? '28px' : '16px',
                height: isClickableHandle(fullHandleId) ? '28px' : '16px',
                borderRadius: isClickableHandle(fullHandleId) ? '8px' : '50%',
                backgroundColor: getHandleColor(fullHandleId),
                boxShadow: isClickableHandle(fullHandleId) ? '0 6px 12px rgba(0,0,0,0.12)' : undefined,
                transition: 'transform 120ms ease, box-shadow 120ms ease',
              }}
              onClick={isClickableHandle(fullHandleId) ? (e: React.MouseEvent) => {
                e.stopPropagation();
                toggleHandlePermission(fullHandleId);
              } : undefined}
            >
              {isClickableHandle(fullHandleId) ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '9999px',
                    backgroundColor: data.nodeHandlePermissions?.[data.nodeId || data.name]?.[fullHandleId] ? '#ffffff' : 'transparent',
                    border: data.nodeHandlePermissions?.[data.nodeId || data.name]?.[fullHandleId] ? undefined : '2px solid rgba(255,255,255,0.9)'
                  }} />
                </div>
              ) : null}
            </Handle>
          );
        }) : [];

        return [...configuredHandles, ...dynamicHandles];
      })()}
    </div>
  );
};

const nodeTypes: NodeTypes = {
  entityNode: EntityNode,
};

const edgeTypes: EdgeTypes = {
  customEdge: CustomEdgeWithActions,
};

function RelationshipsFlowDiagramContent() {
  // Validate that Policy entity exists and is properly configured - this is CRITICAL for security model
  const policyValidation = EntityConfigManager.validatePolicyEntity();
  
  if (!policyValidation.isValid) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Entity Relationships</h3>
            <p className="text-sm text-muted-foreground">
              Visual representation of entity relationships and their permissions
            </p>
          </div>
        </div>
        
        <div className="h-[600px] w-full border rounded-lg bg-background flex items-center justify-center">
          <Card className="p-8 max-w-lg mx-auto border-destructive">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
                <Shield className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-destructive">Policy Entity Required</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                {policyValidation.error}
              </p>
              <div className="bg-muted p-4 rounded-md text-left">
                <p className="text-xs font-medium mb-2">Required Policy configuration:</p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
{`policy: {
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
}`}
                </pre>
              </div>
              <div className="text-xs space-y-1">
                <p className="font-medium">Why Policy is required:</p>
                <ul className="text-muted-foreground text-left list-disc list-inside space-y-1">
                  <li>Controls access permissions across all entities</li>
                  <li>Defines security boundaries and relationships</li>
                  <li>Enables permission cascading through the system</li>
                  <li>Required for the security model to function</li>
                </ul>
              </div>
              <p className="text-xs text-destructive">
                Please add/fix the Policy entity in <code>src/lib/entity-config.ts</code>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // State for tracking selected node
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  // State for tracking dynamic handles created by policy connections
  const [dynamicHandles, setDynamicHandles] = useState<Record<string, string[]>>({});
  // State for tracking pending edges that need to be created after handles are rendered
  const [pendingEdges, setPendingEdges] = useState<Edge[]>([]);
  // State for tracking handle permissions across all nodes
  const [nodeHandlePermissions, setNodeHandlePermissions] = useState<Record<string, Record<string, boolean>>>({});
  // State for tracking edge action permissions (which actions are allowed for each edge)
  const [edgeActionPermissions, setEdgeActionPermissions] = useState<Record<string, Record<string, boolean>>>({});
  // State for tracking select-all for policy edges
  const [edgeSelectAll, setEdgeSelectAll] = useState<Record<string, boolean>>({});
  // State for tracking selected specific targets per edge (array of target IDs)
  const [edgeTargetSelections, setEdgeTargetSelections] = useState<Record<string, string[]>>({});
  // State for tracking when a connection is being initiated from policy
  const [isConnectingFromPolicy, setIsConnectingFromPolicy] = useState<boolean>(false);

  // React Flow instance for internal operations
  const reactFlowInstance = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // Handle permission changes from child nodes
  const handlePermissionChange = useCallback((nodeId: string, handleId: string, granted: boolean) => {
    setNodeHandlePermissions(prev => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        [handleId]: granted
      }
    }));
  }, []);

  // Handle action permission changes for edges
  const handleEdgeActionToggle = useCallback((edgeId: string, action: string, checked: boolean | 'indeterminate') => {
    setEdgeActionPermissions(prev => ({
      ...prev,
      [edgeId]: {
        ...prev[edgeId],
        [action]: checked === true
      }
    }));
  }, []);

  // Handle select-all toggles for edges
  const handleSelectAllForEdge = useCallback((edgeId: string, checked: boolean) => {
    setEdgeSelectAll(prev => ({ ...prev, [edgeId]: checked }));
    if (checked) {
      // If select all, clear specific selections (all targets implicitly selected)
      setEdgeTargetSelections(prev => ({ ...prev, [edgeId]: [] }));
    }
  }, []);

  // Handle selecting/unselecting individual targets for an edge
  const handleSelectTargetForEdge = useCallback((edgeId: string, targetId: string, checked: boolean) => {
    setEdgeTargetSelections(prev => {
      const current = new Set(prev[edgeId] || []);
      if (checked) current.add(targetId); else current.delete(targetId);
      return { ...prev, [edgeId]: Array.from(current) };
    });
    // Unset select-all if a specific selection is changed
    setEdgeSelectAll(prev => ({ ...prev, [edgeId]: false }));
  }, []);

  // Create initial nodes based on entity configurations
  const initialNodes: Node[] = useMemo(() => {
    const entityConfigs = EntityConfigManager.getAllEntityConfigs();
    const positions = {
      device: { x: 200, y: 300 },
      device_group: { x: 800, y: 200 },
      dms: { x: 50, y: 600 },
      certificate: { x: 500, y: 800 },
      policy: { x: 500, y: 20 },
    };

    return Object.keys(entityConfigs).map(entityId => {
      const config = entityConfigs[entityId];
      // Create entity data structure from configuration
      const entityData = {
        name: entityId,
        description: `A ${config.displayName.toLowerCase()} entity`,
        table: `${entityId}s`,
        column_id: entityId === 'certificate' ? 'serial_number' : 'id',
        relationships: [] // Will be populated from relationship configs
      };

      return {
        id: entityId,
        type: 'entityNode',
        position: positions[entityId as keyof typeof positions] || { x: 0, y: 0 },
        data: {
          ...entityData,
          nodeId: entityId,
          name: entityId,
          displayName: config.displayName,
        },
      };
    });
  }, []);

  // Create initial edges based on relationship configurations
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    // Get all relationship configs and create edges
    const relationshipConfigs = EntityConfigManager.getAllRelationships();

    relationshipConfigs.forEach(config => {
      if (config.sourceHandle !== 'dynamic') {
        edges.push({
          id: `${config.sourceEntity}-${config.targetEntity}`,
          source: config.sourceEntity,
          target: config.targetEntity,
          sourceHandle: config.sourceHandle,
          targetHandle: config.targetHandle,
          label: config.label,
          type: 'smoothstep',
          style: { stroke: '#6b7280', strokeWidth: 2 }, // Default gray color
          labelStyle: { fontSize: 12, fontWeight: 600 },
          labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          markerEnd: {
            type: 'arrowclosed',
            width: 20,
            height: 20,
            color: '#6b7280',
          },
        });
      }
    });

    return edges;
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Debug: Log edges to see if they're being set correctly
  useEffect(() => {
    console.log('🔍 Current edges state:', edges);
    console.log('🔍 Initial edges:', initialEdges);
  }, [edges, initialEdges]);

  // Effect to handle pending edge creation after handles are rendered
  useEffect(() => {
    if (pendingEdges.length > 0) {
      // Check if the target handles actually exist in the DOM
      const checkHandlesExist = () => {
        for (const edge of pendingEdges) {
          const targetHandleSelector = `[data-handleid="${edge.targetHandle}"]`;
          const handleElement = document.querySelector(targetHandleSelector);
          if (!handleElement) {
            return false;
          }
        }
        return true;
      };

      // Use a more aggressive retry mechanism
      let retryCount = 0;
      const maxRetries = 10;

      const tryAddEdges = () => {
        retryCount++;

        if (checkHandlesExist()) {
          // Try to validate and add edges using React Flow's internal validation
          for (const edge of pendingEdges) {
            try {
              // Get the current nodes to validate handles exist
              const currentNodes = reactFlowInstance.getNodes();
              const targetNode = currentNodes.find((n: Node) => n.id === edge.target);

              if (targetNode) {
                // Create a connection object that matches React Flow's expected format
                const connection: Connection = {
                  source: edge.source,
                  target: edge.target,
                  sourceHandle: edge.sourceHandle || null,
                  targetHandle: edge.targetHandle || null,
                };

                // Use addEdge with the connection directly
                setEdges((currentEdges: Edge[]) => {
                  const newEdges = addEdge(connection, currentEdges);
                  return newEdges;
                });
              }
            } catch (error) {
              // Silent error handling
            }
          }

          setPendingEdges([]);
        } else if (retryCount < maxRetries) {
          setTimeout(tryAddEdges, 50 * retryCount);
        } else {
          setPendingEdges([]); // Clear pending edges to prevent infinite loop
        }
      };

      // Start checking immediately
      tryAddEdges();
    }
  }, [pendingEdges, setEdges, reactFlowInstance]);

  // Update nodes with selection state and dynamic handles
  const updatedNodes = useMemo(() => {
    // Count how many outgoing edges policy currently has
  const policyOutgoingCount = edges.filter((edge: Edge) => edge.source === 'policy').length;

  return nodes.map((node: Node) => {
      // Check if this node has a policy connection (incoming edge from policy)
  const hasPolicyConnection = edges.some((edge: Edge) => edge.source === 'policy' && edge.target === node.id);

      // Get incoming edges for this node (edges where this node is the target)
  const incomingEdges = edges.filter((edge: Edge) => edge.target === node.id);

      // Get outgoing edges for this node (edges where this node is the source)
  const outgoingEdges = edges.filter((edge: Edge) => edge.source === node.id);

      // Check if this node has any incoming blue edges (granted permissions)
  const hasIncomingBlueEdges = incomingEdges.some((edge: Edge) => {
        // Check if the edge itself is blue (either from policy or cascading permissions)
        const sourceNodePermissions = nodeHandlePermissions[edge.source] || {};
        const targetNodePermissions = nodeHandlePermissions[edge.target] || {};

        const isSourcePermissionGranted = edge.sourceHandle && sourceNodePermissions[edge.sourceHandle];
        const isTargetPermissionGranted = edge.targetHandle && targetNodePermissions[edge.targetHandle];
        const isPolicyEdge = edge.source === 'policy';

        return isPolicyEdge || isSourcePermissionGranted || isTargetPermissionGranted;
      });

      return {
        ...node,
        data: {
          ...node.data,
          nodeId: node.data?.nodeId || node.id,
          policyOutgoingCount,
          selected: selectedNode === node.id,
          dynamicHandles: dynamicHandles[node.id] || [],
          hasPolicyConnection,
          incomingEdges,
          outgoingEdges,
          hasIncomingBlueEdges,
          nodeHandlePermissions,
          allEdges: edges, // Add all edges for path checking
          isConnectingFromPolicy, // Add connection state for node-center visibility
          onPermissionChange: handlePermissionChange,
          onClick: () => {
            setSelectedNode(selectedNode === node.id ? null : node.id);
          }
        }
      };
    });
  }, [nodes, selectedNode, dynamicHandles, edges, handlePermissionChange, nodeHandlePermissions, isConnectingFromPolicy]);

  // Update edges with selection highlighting and permission colors
  const updatedEdges = useMemo(() => {
    console.log('🎨 Updating edges, current count:', edges.length);
  return edges.map((edge: Edge) => {
      const isPolicyEdge = edge.source === 'policy' || edge.target === 'policy';

      // Check if this edge's target handle has been granted permission (for policy connections)
  const targetNodePermissions = nodeHandlePermissions[edge.target] || {};
      const isTargetPermissionGranted = edge.targetHandle && targetNodePermissions[edge.targetHandle];

      // Check if this edge's source handle has been granted permission (for cascading permissions)
  const sourceNodePermissions = nodeHandlePermissions[edge.source] || {};
      const isSourcePermissionGranted = edge.sourceHandle && sourceNodePermissions[edge.sourceHandle];

      // Determine if we should show the actions panel
      const showActionsPanel = isPolicyEdge || isSourcePermissionGranted;

      // Get target node's actions
  // Compute allowed actions for this edge from the relationship configuration
  const targetNodeActions = EntityConfigManager.getAvailableActions(edge.source, edge.target);

      // Get edge permissions for this edge
      const edgePermissions = edgeActionPermissions[edge.id] || {};

  // Fetch multiselect options and custom component for the target entity if configured
  const targetEntityConfig = EntityConfigManager.getEntityConfig(edge.target);
  const multiselectOptions = targetEntityConfig?.multiselect?.enabled ? (targetEntityConfig.multiselect?.options || []) : [];
  const multiselectCustomComponent = targetEntityConfig?.multiselect?.customComponent;


      if (isPolicyEdge) {
        // Policy edges stay blue with markerEnd (arrow at end) and dashed line
        return {
          ...edge,
          type: 'customEdge',
          style: {
            stroke: '#3b82f6',
            strokeWidth: 3,
            strokeDasharray: '8,8'
          },
          markerEnd: {
            type: 'arrowclosed' as const,
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
          data: {
            showActionsPanel,
            targetNodeActions,
            edgePermissions,
            onActionToggle: handleEdgeActionToggle,
            isPolicyEdge: true,
            selectAllForEdge: edgeSelectAll[edge.id] || false,
            selectedTargets: edgeTargetSelections[edge.id] || [],
            multiselectOptions,
            multiselectCustomComponent,
            onSelectAll: handleSelectAllForEdge,
            onSelectTarget: handleSelectTargetForEdge,
          },
        } as Edge;
      }

      if (isTargetPermissionGranted || isSourcePermissionGranted) {
        // Edge with granted permission (either target or source) - make it blue and wider
        return {
          ...edge,
          type: 'customEdge',
          style: { ...edge.style, stroke: '#3b82f6', strokeWidth: 3 },
          markerEnd: {
            type: 'arrowclosed' as const,
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
          data: {
            showActionsPanel,
            targetNodeActions,
            edgePermissions,
            onActionToggle: handleEdgeActionToggle,
            isPolicyEdge: false,
            selectAllForEdge: edgeSelectAll[edge.id] || false,
            selectedTargets: edgeTargetSelections[edge.id] || [],
            multiselectOptions,
            multiselectCustomComponent,
            onSelectAll: handleSelectAllForEdge,
            onSelectTarget: handleSelectTargetForEdge,
          },
        } as Edge;
      }

      // Default gray edges with markerEnd (arrow at destination)
      return {
        ...edge,
        type: 'customEdge',
        style: { ...edge.style, stroke: '#6b7280', strokeWidth: 2 },
        markerEnd: {
          type: 'arrowclosed' as const,
          width: 20,
          height: 20,
          color: '#6b7280',
        },
        data: {
          showActionsPanel: false,
          targetNodeActions: [],
          edgePermissions: {},
          onActionToggle: handleEdgeActionToggle,
          multiselectOptions,
          multiselectCustomComponent,
          selectAllForEdge: edgeSelectAll[edge.id] || false,
          selectedTargets: edgeTargetSelections[edge.id] || [],
          onSelectAll: handleSelectAllForEdge,
          onSelectTarget: handleSelectTargetForEdge,
        },
      } as Edge;
    });
  }, [edges, nodeHandlePermissions, edgeActionPermissions, nodes, handleEdgeActionToggle]);

  // Handle node clicks
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(selectedNode === node.id ? null : node.id);
  }, [selectedNode]);

  // Handle connection start - track when connection is initiated from policy
  const onConnectStart: OnConnectStart = useCallback((event: any, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
    if (nodeId === 'policy') {
      setIsConnectingFromPolicy(true);
    }
  }, []);

  // Handle connection end - reset connection state
  const onConnectEnd = useCallback(() => {
    setIsConnectingFromPolicy(false);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      // Ensure policy is always the source (arrow points away from policy)
      let source = params.source;
      let target = params.target;
      let sourceHandle = params.sourceHandle;
      let targetHandle = params.targetHandle;

      // If target is policy, swap source and target so policy becomes source
      if (params.target === 'policy') {
        source = params.target;
        target = params.source;
        sourceHandle = params.targetHandle;
        targetHandle = params.sourceHandle;
      }

      // Normalize policy source handles (both "right" and "node-center" should work the same)
      if (source === 'policy' && (sourceHandle === 'node-center' || sourceHandle === 'right')) {
        sourceHandle = 'right'; // Use the visible handle for the actual edge
      }

      // Easy Connect: Create dynamic handle if policy is connecting to another node
      if (source === 'policy' && target && target !== 'policy') {
        // Remove any existing policy edge to enforce the limit of 1 outgoing connection
        const existingPolicyEdge = edges.find((edge: Edge) => edge.source === 'policy' || edge.target === 'policy');
        if (existingPolicyEdge) {
          setEdges((currentEdges: Edge[]) => currentEdges.filter((edge: Edge) => edge.id !== existingPolicyEdge.id));
          const oldTarget = existingPolicyEdge.target;
          const oldTargetHandle = existingPolicyEdge.targetHandle;
          if (oldTargetHandle && oldTargetHandle.startsWith('dynamic-')) {
            const handlePosition = oldTargetHandle.replace('dynamic-', '');
            setDynamicHandles(prev => {
              const newState = { ...prev };
              if (newState[oldTarget]) {
                newState[oldTarget] = newState[oldTarget].filter(h => h !== handlePosition);
                if (newState[oldTarget].length === 0) {
                  delete newState[oldTarget];
                }
              }
              return newState;
            });
            setNodeHandlePermissions(prev => {
              const newState = { ...prev };
              if (newState[oldTarget]) {
                delete newState[oldTarget][oldTargetHandle];
                if (Object.keys(newState[oldTarget]).length === 0) {
                  delete newState[oldTarget];
                }
              }
              return newState;
            });
          }
        }

        // Get available position for new handle on target node
        const existingHandles = dynamicHandles[target] || [];

        const getAvailablePosition = (nodeId: string, existingHandles: string[]) => {
          const positions = ['top', 'right', 'bottom', 'left'];

          // For non-policy nodes, avoid their fixed handles
          if (nodeId === 'device') {
            // Device has fixed left, right (target) and bottom (source) handles
            return positions.find(pos => !['left', 'right', 'bottom'].includes(pos) && !existingHandles.includes(pos)) || 'top';
          } else if (nodeId === 'device_group') {
            // Device Group has fixed right (source) handle
            return positions.find(pos => pos !== 'right' && !existingHandles.includes(pos)) || 'top';
          } else if (nodeId === 'dms') {
            // DMS has fixed left (source) handle
            return positions.find(pos => pos !== 'left' && !existingHandles.includes(pos)) || 'top';
          } else if (nodeId === 'certificate') {
            // Certificate has fixed top (target) handle
            return positions.find(pos => pos !== 'top' && !existingHandles.includes(pos)) || 'right';
          }

          // For other nodes, use any available position
          return positions.find(pos => !existingHandles.includes(pos)) || 'top';
        };

        // If targetHandle is null, undefined, or "node-center", we're connecting to the node itself - create a dynamic handle
        if (!targetHandle || targetHandle === 'node-center') {
          const newHandleId = getAvailablePosition(target, existingHandles);
          targetHandle = `dynamic-${newHandleId}`;

          // Update dynamic handles state
          setDynamicHandles(prev => ({
            ...prev,
            [target]: [...existingHandles, newHandleId]
          }));
        } else if (!targetHandle.startsWith('dynamic-')) {
          // If targetHandle exists but is not dynamic, still create a dynamic handle for policy connections
          const newHandleId = getAvailablePosition(target, existingHandles);
          targetHandle = `dynamic-${newHandleId}`;

          // Update dynamic handles state
          setDynamicHandles(prev => ({
            ...prev,
            [target]: [...existingHandles, newHandleId]
          }));
        }

        const dynamicHandleId = targetHandle;

        // Update nodes to include the new dynamic handle
        setNodes((currentNodes: Node[]) => {
          const updatedNodes = currentNodes.map((node: Node) => {
            if (node.id === target) {
              const currentDynamicHandles = dynamicHandles[target] || [];
              const updatedNode = {
                ...node,
                data: {
                  ...node.data,
                  dynamicHandles: currentDynamicHandles
                }
              };
              return updatedNode;
            }
            return node;
          });
          return updatedNodes;
        });

        // CRITICAL: Update React Flow's internal handle registry
        setTimeout(() => {
          updateNodeInternals(target);
        }, 10); // Small delay to ensure state update is processed

        // Create the policy edge and add it to pending edges for proper timing
        const policyEdge: Edge = {
          id: `${source}-${target}-${Date.now()}`, // Add timestamp to ensure unique IDs
          source: source!,
          target: target!,
          sourceHandle: sourceHandle || undefined,
          targetHandle: dynamicHandleId,
          type: 'smoothstep',
          style: {
            stroke: '#3b82f6',
            strokeWidth: 3,
            strokeDasharray: '8,8' // Creates dashed line
          },
          labelStyle: { fontSize: 12, fontWeight: 600 },
          labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          markerEnd: {
            type: 'arrowclosed',
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
          label: 'applies_to',
        };

        console.log(`Creating policy edge from ${source} to ${target} via ${policyEdge.label}`);

        // Add to pending edges with a short delay to allow node internals update
        setTimeout(() => {
          setPendingEdges([policyEdge]);
        }, 50); // Delay to ensure updateNodeInternals has been processed

        return; // Don't create edge immediately for policy connections
      }

      // For non-policy connections, create edge immediately
      const newEdge: Edge = {
        id: `${params.source}-${params.target}-${Date.now()}`, // Add timestamp to ensure unique IDs
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle || undefined,
        targetHandle: params.targetHandle || undefined,
        type: 'smoothstep',
        style: {
          stroke: '#6b7280',
          strokeWidth: 2
        },
        labelStyle: { fontSize: 12, fontWeight: 600 },
        labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
        markerEnd: {
          type: 'arrowclosed',
          width: 20,
          height: 20,
          color: '#6b7280',
        },
        label: 'connection',
      };

  console.log(`Creating edge from ${params.source} to ${params.target} via ${newEdge.label}`);
  setEdges((eds: Edge[]) => addEdge(newEdge, eds));
    },
    [setEdges, setNodes, dynamicHandles, edges, nodeHandlePermissions],
  );

  // Debug: Log render info
  console.log('📊 Rendering component with', updatedNodes.length, 'nodes and', updatedEdges.length, 'edges');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Entity Relationships</h3>
          <p className="text-sm text-muted-foreground">
            Visual representation of entity relationships and their permissions
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-gray-500"></div>
            <span>belongs_to_group</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-gray-500"></div>
            <span>dms_owner</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-gray-500"></div>
            <span>belongs_to_device</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500 border-dashed border-t-2 border-blue-500"></div>
            <span>policy applies_to (user-defined)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>💡 Connect policy to entities to enable permission controls</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 bg-red-500 rounded-sm border border-white"></div>
            <span>Click red buttons to grant permissions</span>
            <div className="w-3 h-3 bg-green-500 rounded-sm border border-white"></div>
            <span>Green = permission granted</span>
          </div>
        </div>
      </div>

      <div className="h-[600px] w-full border rounded-lg bg-background">
        <ReactFlow
          nodes={updatedNodes}
          edges={updatedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          className="bg-background"
        >
          <Controls />
          <Background color="#aaa" gap={16} />
        </ReactFlow>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
        {Object.entries(EntityConfigManager.getAllEntityConfigs()).map(([entityId, config]) => {
          // Get relationships for this entity from relationship configs
          const relationships = EntityConfigManager.getAllRelationships()
            .filter(rel => rel.sourceEntity === entityId)
            .map(rel => ({
              name: rel.label || 'connection',
              relation_with: rel.targetEntity,
              actions: rel.actions || []
            }));

          return (
            <Card key={entityId} className="p-4">
              <h4 className="font-medium text-sm mb-2 capitalize flex items-center gap-2">
                {entityId === 'policy' && <span className="text-blue-600">🔒</span>}
                {config.displayName} Relationships
              </h4>
              {relationships.length > 0 ? (
                <ul className="space-y-2">
                  {relationships.map((rel, index) => (
                    <li key={index} className="text-xs">
                      <div className="font-medium">{rel.name}</div>
                      <div className="text-muted-foreground">→ {EntityConfigManager.getEntityDisplayName(rel.relation_with)}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rel.actions.map((action) => (
                          <Badge key={action} variant="outline" className="text-xs">
                            {action}
                          </Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {entityId === 'policy'
                    ? 'Connect to one entity by dragging from the connection handle (replaces existing connection)'
                    : 'No relationships defined'
                  }
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function RelationshipsFlowDiagram() {
  return (
    <ReactFlowProvider>
      <RelationshipsFlowDiagramContent />
    </ReactFlowProvider>
  );
}