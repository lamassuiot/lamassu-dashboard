'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Database, Users, Shield, FileText } from 'lucide-react';

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
      </EdgeLabelRenderer>
    </>
  );
};

// Custom node component for entities
const EntityNode = ({ data, selected }: { data: any; selected?: boolean }) => {
  // Local cache not required; read permissions from the global nodeHandlePermissions via data.nodeHandlePermissions[data.nodeId]
  // This avoids synchronization bugs. If UI needs instant feedback, parent updates nodeHandlePermissions which will re-render this node.
  
  const getEntityIcon = (entityName: string) => {
    switch (entityName) {
      case 'device':
        return <Shield className="h-5 w-5" />;
      case 'device_group':
        return <Users className="h-5 w-5" />;
      case 'dms':
        return <Database className="h-5 w-5" />;
      case 'certificate':
        return <FileText className="h-5 w-5" />;
      case 'policy':
        return <Shield className="h-5 w-5 text-primary-foreground" />;
      default:
        return <Database className="h-5 w-5" />;
    }
  };

  // Determine border and text colors based on selection state
  const getBorderColor = () => {
    if (data.name === 'policy') return 'border-primary';
    if (selected) return 'border-blue-500';
    
    // Check if this node has a policy connection (should be blue)
    if (hasPolicyConnection) return 'border-blue-500';
    
    // Check if this node has any incoming blue edges (granted permissions from other nodes)
    if (hasIncomingBlueEdges) return 'border-blue-500';
    
    return 'border-gray-300'; // Default gray border instead of red
  };

  const getTextColor = () => {
    if (data.name === 'policy') return 'text-primary-foreground';
    if (selected) return 'text-blue-600';
    
    // Check if this node has a policy connection (should be blue)
    if (hasPolicyConnection) return 'text-blue-600';
    
    // Check if this node has any incoming blue edges (granted permissions from other nodes)
    if (hasIncomingBlueEdges) return 'text-blue-600';
    
    return 'text-gray-700'; // Default gray text instead of red
  };

  const getBackgroundColor = () => {
    if (data.name === 'policy') return 'bg-primary';
    return 'bg-background';
  };

  const getNodeWidth = () => {
    if (data.name === 'policy') return 'min-w-[350px]';
    return 'min-w-[250px]';
  };

  const getBorderWidth = () => {
    // Check if there's a path from policy via granted permissions
    const thisNodeId = data.nodeId || data.name;
    
    // Policy always gets default border
    if (thisNodeId === 'policy') return 'border-2';
    
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
    const positions = ['top', 'right', 'bottom', 'left'];
    
    // For non-policy nodes, avoid their fixed handles
    if (nodeId === 'device') {
      // Device has fixed right, left, bottom handles
      return positions.find(pos => !['right', 'left', 'bottom'].includes(pos) && !existingHandles.includes(pos)) || 'top';
    } else if (nodeId === 'device_group') {
      // Device Group has fixed left handle
      return positions.find(pos => pos !== 'left' && !existingHandles.includes(pos)) || 'top';
    } else if (nodeId === 'dms') {
      // DMS has fixed right handle
      return positions.find(pos => pos !== 'right' && !existingHandles.includes(pos)) || 'top';
    } else if (nodeId === 'certificate') {
      // Certificate has fixed top handle
      return positions.find(pos => pos !== 'top' && !existingHandles.includes(pos)) || 'right';
    }
    
    // For policy and other nodes, use any available position
    return positions.find(pos => !existingHandles.includes(pos)) || 'top';
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
    switch (nodeType) {
      case 'device':
        // Device has source handle: bottom (sends to certificate)
        return handleId === 'bottom';
      case 'device_group':
        // Device Group has source handle: right (sends to device)
        return handleId === 'right';
      case 'dms':
        // DMS has source handle: left (sends to device)
        return handleId === 'left';
      case 'policy':
        // Policy has source handle: bottom
        return handleId === 'bottom';
      case 'certificate':
        // Certificate only has target handles
        return false;
      default:
        // For dynamic handles, none are source handles (they are all targets for policy connections)
        return !handleId.startsWith('dynamic-');
    }
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
          <></>
        ) : (
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description:</p>
              <p className="text-xs">{data.description}</p>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground mb-1">Table:</p>
              <Badge variant="outline" className="text-xs">{data.table}</Badge>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground mb-1">ID Column:</p>
              <Badge variant="secondary" className="text-xs">{data.column_id}</Badge>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground mb-1">Actions:</p>
              <div className="flex flex-wrap gap-1">
                {data.actions.map((action: string) => (
                  <Badge key={action} variant="outline" className="text-xs">
                    {action}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        )}
        
        {/* Invisible handles for connections */}
        {data.name === 'policy' ? (
          // Policy has a large source handle for easy dragging
          <Handle
            id="node-center"
            type="source"
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
            }}
          />
        ) : (
          // Other nodes have large target handles to receive connections
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
            }}
          />
        )}
      </Card>
      
      {/* Connection handles */}
      {data.name === 'policy' ? (
        // Policy node has only one connection handle (right side)
        <Handle
          id="right"
          type="source"
          position={Position.Right}
            className="w-4 h-4 bg-primary border-2 border-white shadow-lg"
            // Limit to a single outgoing connection from policy. Cast to any to satisfy Handle prop typing.
            isConnectable={( (connection: any) => {
              const count = data.policyOutgoingCount || 0;
              return count < 1;
            }) as any}
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
          }}
        />
      ) : data.name === 'device' ? (
        // Device node has 2 target handles + 1 source handle + dynamic handles for policy connections
        <>
          <Handle
            id="left"
            type="target"
            position={Position.Left}
            className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle('left') ? 'cursor-pointer' : ''}`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: isClickableHandle('left') ? '4px' : '50%',
              backgroundColor: getHandleColor('left'),
            }}
            onClick={isClickableHandle('left') ? (e) => {
              e.stopPropagation();
              toggleHandlePermission('left');
            } : undefined}
          />
          <Handle
            id="right"
            type="target"
            position={Position.Right}
            className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle('right') ? 'cursor-pointer' : ''}`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: isClickableHandle('right') ? '4px' : '50%',
              backgroundColor: getHandleColor('right'),
            }}
            onClick={isClickableHandle('right') ? (e) => {
              e.stopPropagation();
              toggleHandlePermission('right');
            } : undefined}
          />
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle('bottom') ? 'cursor-pointer' : ''}`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: isClickableHandle('bottom') ? '4px' : '50%',
              backgroundColor: getHandleColor('bottom'),
            }}
            onClick={isClickableHandle('bottom') ? (e) => {
              e.stopPropagation();
              toggleHandlePermission('bottom');
            } : undefined}
          />
          {/* Dynamic handles for policy connections */}
          {dynamicHandlesForNode.map((handleId: string) => {
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
                className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle(fullHandleId) ? 'cursor-pointer' : ''}`}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: isClickableHandle(fullHandleId) ? '4px' : '50%',
                  backgroundColor: getHandleColor(fullHandleId),
                }}
                onClick={isClickableHandle(fullHandleId) ? (e) => {
                  e.stopPropagation();
                  toggleHandlePermission(fullHandleId);
                } : undefined}
              />
            );
          })}
        </>
      ) : data.name === 'device_group' ? (
        // Device Group has 1 source handle + dynamic handles for policy connections
        <>
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle('right') ? 'cursor-pointer' : ''}`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: isClickableHandle('right') ? '4px' : '50%',
              backgroundColor: getHandleColor('right'),
            }}
            onClick={isClickableHandle('right') ? (e) => {
              e.stopPropagation();
              toggleHandlePermission('right');
            } : undefined}
          />
          {/* Dynamic handles for policy connections */}
          {dynamicHandlesForNode.map((handleId: string) => {
            const position = handleId === 'top' ? Position.Top : 
                           handleId === 'right' ? Position.Right : 
                           handleId === 'bottom' ? Position.Bottom : Position.Left;
            const fullId = `dynamic-${handleId}`;
            return (
              <Handle
                key={fullId}
                id={fullId}
                type="target"
                position={position}
                className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle(fullId) ? 'cursor-pointer' : ''}`}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: isClickableHandle(fullId) ? '4px' : '50%',
                  backgroundColor: getHandleColor(fullId),
                }}
                onClick={isClickableHandle(fullId) ? (e) => {
                  e.stopPropagation();
                  toggleHandlePermission(fullId);
                } : undefined}
              />
            );
          })}
        </>
      ) : data.name === 'dms' ? (
        // DMS has 1 source handle + dynamic handles for policy connections
        <>
          <Handle
            id="left"
            type="source"
            position={Position.Left}
            className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle('left') ? 'cursor-pointer' : ''}`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: isClickableHandle('left') ? '4px' : '50%',
              backgroundColor: getHandleColor('left'),
            }}
            onClick={isClickableHandle('left') ? (e) => {
              e.stopPropagation();
              toggleHandlePermission('left');
            } : undefined}
          />
          {/* Dynamic handles for policy connections */}
          {dynamicHandlesForNode.map((handleId: string) => {
            const position = handleId === 'top' ? Position.Top : 
                           handleId === 'right' ? Position.Right : 
                           handleId === 'bottom' ? Position.Bottom : Position.Left;
            const fullId = `dynamic-${handleId}`;
            return (
              <Handle
                key={fullId}
                id={fullId}
                type="target"
                position={position}
                className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle(fullId) ? 'cursor-pointer' : ''}`}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: isClickableHandle(fullId) ? '4px' : '50%',
                  backgroundColor: getHandleColor(fullId),
                }}
                onClick={isClickableHandle(fullId) ? (e) => {
                  e.stopPropagation();
                  toggleHandlePermission(fullId);
                } : undefined}
              />
            );
          })}
        </>
      ) : data.name === 'certificate' ? (
        // Certificate has 1 target handle + dynamic handles for policy connections
        <>
          <Handle
            id="top"
            type="target"
            position={Position.Top}
            className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle('top') ? 'cursor-pointer' : ''}`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: isClickableHandle('top') ? '4px' : '50%',
              backgroundColor: getHandleColor('top'),
            }}
            onClick={isClickableHandle('top') ? (e) => {
              e.stopPropagation();
              toggleHandlePermission('top');
            } : undefined}
          />
          {/* Dynamic handles for policy connections */}
          {dynamicHandlesForNode.map((handleId: string) => {
            const position = handleId === 'top' ? Position.Top : 
                           handleId === 'right' ? Position.Right : 
                           handleId === 'bottom' ? Position.Bottom : Position.Left;
            const fullId = `dynamic-${handleId}`;
            return (
              <Handle
                key={fullId}
                id={fullId}
                type="target"
                position={position}
                className={`w-4 h-4 border-2 border-white shadow-lg ${isClickableHandle(fullId) ? 'cursor-pointer' : ''}`}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: isClickableHandle(fullId) ? '4px' : '50%',
                  backgroundColor: getHandleColor(fullId),
                }}
                onClick={isClickableHandle(fullId) ? (e) => {
                  e.stopPropagation();
                  toggleHandlePermission(fullId);
                } : undefined}
              />
            );
          })}
        </>
      ) : null}
    </div>
  );
};

// Define the entities data structure
const entitiesData = {
  device: {
    name: "device",
    description: "A device entity",
    table: "devices",
    column_id: "id",
    actions: ["read", "create", "update", "update-metadata", "delete", "list"],
    relationships: [
      {
        name: "belongs_to_group",
        relation_with: "device_group",
        column: "device_group_id",
        column_type: "varchar",
        actions: ["read"]
      },
      {
        name: "dms_owner",
        relation_with: "dms",
        column: "dms_owner",
        column_type: "varchar",
        actions: ["read", "write", "delete"]
      }
    ]
  },
  device_group: {
    name: "device_group",
    actions: ["read", "create", "update", "update-metadata", "delete", "list"],
    description: "A device group entity",
    table: "groups",
    column_id: "id",
    relationships: []
  },
  dms: {
    name: "dms",
    description: "A DMS group entity",
    actions: ["read", "create", "update", "update-metadata", "delete", "list"],
    table: "dmss",
    column_id: "id",
    relationships: []
  },
  certificate: {
    name: "certificate",
    description: "A certificate entity",
    actions: ["read", "create", "update", "update-metadata", "update-status", "delete", "list"],
    table: "certificates",
    column_id: "serial_number",
    relationships: [
      {
        name: "belongs_to_device",
        relation_with: "device",
        column: "device_id",
        column_type: "varchar",
        actions: ["read", "write", "delete"]
      }
    ]
  },
  policy: {
    name: "policy",
    description: "A security policy entity",
    table: "policies",
    column_id: "id",
    actions: ["read", "create", "update", "delete", "list", "apply"],
    relationships: []
  }
};

const nodeTypes: NodeTypes = {
  entityNode: EntityNode,
};

const edgeTypes: EdgeTypes = {
  customEdge: CustomEdgeWithActions,
};

function RelationshipsFlowDiagramContent() {
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

  // Create initial nodes based on entities
  const initialNodes: Node[] = useMemo(() => [
    {
      id: 'device',
      type: 'entityNode',
      position: { x: 200, y: 300 },
      data: { ...entitiesData.device, nodeId: 'device' },
    },
    {
      id: 'device_group',
      type: 'entityNode',
      position: { x: 800, y: 200 },
      data: { ...entitiesData.device_group, nodeId: 'device_group' },
    },
    {
      id: 'dms',
      type: 'entityNode',
      position: { x: 50, y: 600 },
      data: { ...entitiesData.dms, nodeId: 'dms' },
    },
    {
      id: 'certificate',
      type: 'entityNode',
      position: { x: 500, y: 800 },
      data: { ...entitiesData.certificate, nodeId: 'certificate' },
    },
    {
      id: 'policy',
      type: 'entityNode',
      position: { x: 500, y: 20 },
      data: { ...entitiesData.policy, nodeId: 'policy' },
    },
  ], []);

  // Create initial edges based on relationships
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    
    // Device Group to Device relationship (Device Group → Device, device belongs_to_group device_group)
    edges.push({
      id: 'device_group-device',
      source: 'device_group',
      target: 'device',
      sourceHandle: 'right', // Device Group needs a source handle
      targetHandle: 'left',  // Device receives on left
      label: 'belongs_to_group',
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

    // DMS to Device relationship (DMS → Device, device dms_owner dms)
    edges.push({
      id: 'dms-device',
      source: 'dms',
      target: 'device',
      sourceHandle: 'left',  // DMS needs a source handle
      targetHandle: 'right', // Device receives on right
      label: 'dms_owner',
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

    // Device to Certificate relationship (Device → Certificate, certificate belongs_to_device device)
    edges.push({
      id: 'device-certificate',
      source: 'device',
      target: 'certificate',
      sourceHandle: 'bottom', // Device sends from bottom
      targetHandle: 'top',    // Certificate receives on top
      label: 'belongs_to_device',
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
              const targetNode = currentNodes.find(n => n.id === edge.target);
              
              if (targetNode) {
                // Create a connection object that matches React Flow's expected format
                const connection: Connection = {
                  source: edge.source,
                  target: edge.target,
                  sourceHandle: edge.sourceHandle || null,
                  targetHandle: edge.targetHandle || null,
                };
                
                // Use addEdge with the connection directly
                setEdges(currentEdges => {
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
    const policyOutgoingCount = edges.filter(edge => edge.source === 'policy').length;

    return nodes.map(node => {
      // Check if this node has a policy connection (incoming edge from policy)
      const hasPolicyConnection = edges.some(edge => edge.source === 'policy' && edge.target === node.id);
      
      // Get incoming edges for this node (edges where this node is the target)
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      
      // Get outgoing edges for this node (edges where this node is the source)
      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      
      // Check if this node has any incoming blue edges (granted permissions)
      const hasIncomingBlueEdges = incomingEdges.some(edge => {
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
          onPermissionChange: handlePermissionChange,
          onClick: () => {
            setSelectedNode(selectedNode === node.id ? null : node.id);
          }
        }
      };
    });
  }, [nodes, selectedNode, dynamicHandles, edges, handlePermissionChange, nodeHandlePermissions]);

  // Update edges with selection highlighting and permission colors
  const updatedEdges = useMemo(() => {
    console.log('🎨 Updating edges, current count:', edges.length);
    return edges.map(edge => {
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
      const targetNode = nodes.find(n => n.id === edge.target);
      const targetNodeActions = targetNode?.data?.actions || [];
      
      // Get edge permissions for this edge
      const edgePermissions = edgeActionPermissions[edge.id] || {};
      
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
        },
      } as Edge;
    });
  }, [edges, nodeHandlePermissions, edgeActionPermissions, nodes, handleEdgeActionToggle]);

  // Handle node clicks
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(selectedNode === node.id ? null : node.id);
  }, [selectedNode]);

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
        const existingPolicyEdge = edges.find(edge => edge.source === 'policy' || edge.target === 'policy');
        if (existingPolicyEdge) {
          setEdges(currentEdges => currentEdges.filter(edge => edge.id !== existingPolicyEdge.id));
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
        setNodes(currentNodes => {
          const updatedNodes = currentNodes.map(node => {
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
      setEdges((eds) => addEdge(newEdge, eds));
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
        {Object.entries(entitiesData).map(([key, entity]) => (
          <Card key={key} className="p-4">
            <h4 className="font-medium text-sm mb-2 capitalize flex items-center gap-2">
              {entity.name === 'policy' && <span className="text-blue-600">🔒</span>}
              {entity.name} Relationships
            </h4>
            {entity.relationships.length > 0 ? (
              <ul className="space-y-2">
                {entity.relationships.map((rel, index) => (
                  <li key={index} className="text-xs">
                    <div className="font-medium">{rel.name}</div>
                    <div className="text-muted-foreground">→ {rel.relation_with}</div>
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
                {entity.name === 'policy' 
                  ? 'Connect to one entity by dragging from the connection handle (replaces existing connection)' 
                  : 'No relationships defined'
                }
              </p>
            )}
          </Card>
        ))}
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