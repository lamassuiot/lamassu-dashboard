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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Users, Shield, FileText } from 'lucide-react';

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
        return <Shield className="h-5 w-5 text-blue-600" />;
      default:
        return <Database className="h-5 w-5" />;
    }
  };

  // Determine border and text colors based on selection state
  const getBorderColor = () => {
    if (data.name === 'policy') return 'border-blue-500/50';
    if (selected) return 'border-blue-500';
    
    // Check if this node has a policy connection (should be blue)
    if (hasPolicyConnection) return 'border-blue-500';
    
    // Check if this node has any incoming blue edges (granted permissions from other nodes)
    if (hasIncomingBlueEdges) return 'border-blue-500';
    
    return 'border-gray-300'; // Default gray border instead of red
  };

  const getTextColor = () => {
    if (data.name === 'policy') return 'text-blue-600';
    if (selected) return 'text-blue-600';
    
    // Check if this node has a policy connection (should be blue)
    if (hasPolicyConnection) return 'text-blue-600';
    
    // Check if this node has any incoming blue edges (granted permissions from other nodes)
    if (hasIncomingBlueEdges) return 'text-blue-600';
    
    return 'text-gray-700'; // Default gray text instead of red
  };

  const getBackgroundColor = () => {
    if (data.name === 'policy') return 'bg-blue-50';
    return 'bg-background';
  };

  const getNodeWidth = () => {
    if (data.name === 'policy') return 'min-w-[350px]';
    return 'min-w-[250px]';
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

  const getHandleColor = (handleId: string) => {
  // Get this node's permissions from global state (use nodeId)
  const thisNodeId = data.nodeId || data.name;
  const thisNodePermissions = data.nodeHandlePermissions?.[thisNodeId] || {};
  const thisHandlePermission = thisNodePermissions[handleId];
    
    // Check if this is a target handle with policy connection
    if (hasPolicyConnection && incomingEdges.some((edge: any) => edge.targetHandle === handleId)) {
      return thisHandlePermission ? '#22c55e' : '#ef4444'; // Green if allowed, red if denied
    }
    
    // Check if this is a target handle with incoming edges from nodes with granted permissions
    // Incoming granted: some incoming edge's SOURCE node has the sourceHandle granted
    const hasIncomingGrantedEdge = incomingEdges.some((edge: any) => {
      if (edge.targetHandle === handleId) {
        const sourceNodePermissions = data.nodeHandlePermissions?.[edge.source] || {};
        return edge.sourceHandle && sourceNodePermissions[edge.sourceHandle];
      }
      return false;
    });
    
    if (hasIncomingGrantedEdge) {
      return thisHandlePermission ? '#22c55e' : '#ef4444'; // Green if allowed, red if denied
    }
    
    // If this is a source handle, check whether the target node/handle it connects to is granted.
    // Example: device.right -> device_group.left. If device_group.left is granted, then device.right should show the button.
    const sourceLeadsToGrantedTarget = outgoingEdges.some((edge: any) => {
      if (edge.sourceHandle === handleId && edge.target) {
        const targetPermissions = data.nodeHandlePermissions?.[edge.target] || {};
        return edge.targetHandle && targetPermissions[edge.targetHandle];
      }
      return false;
    });

    if (sourceLeadsToGrantedTarget) {
      return thisHandlePermission ? '#22c55e' : '#ef4444';
    }
    
    return '#6366f1'; // Default primary color
  };

  const isClickableHandle = (handleId: string) => {
    // Clickable if it's a target handle with policy connection
    if (hasPolicyConnection && incomingEdges.some((edge: any) => edge.targetHandle === handleId)) {
      return true;
    }
    
    // Clickable if it's a target handle with incoming edges from nodes with granted permissions
    const hasIncomingGrantedEdge = incomingEdges.some((edge: any) => {
      if (edge.targetHandle === handleId) {
        const sourceNodePermissions = data.nodeHandlePermissions?.[edge.source] || {};
        return edge.sourceHandle && sourceNodePermissions[edge.sourceHandle];
      }
      return false;
    });

    if (hasIncomingGrantedEdge) {
      return true;
    }

    // Clickable if it's a source handle and the target node/handle it connects to has been granted
    const sourceTargetsGranted = outgoingEdges.some((edge: any) => {
      if (edge.sourceHandle === handleId && edge.target) {
        const targetPermissions = data.nodeHandlePermissions?.[edge.target] || {};
        return edge.targetHandle && targetPermissions[edge.targetHandle];
      }
      return false;
    });

    if (sourceTargetsGranted) return true;
    
    return false;
  };

  return (
    <Card className={`shadow-lg border-2 cursor-pointer ${getNodeWidth()} ${getBorderColor()} ${getBackgroundColor()}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`flex items-center gap-2 text-sm ${getTextColor()}`}>
          {getEntityIcon(data.name)}
          {data.name}
        </CardTitle>
      </CardHeader>
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
        // Device node has 3 fixed handles + dynamic handles for policy connections
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
          <Handle
            id="bottom"
            type="target"
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
        // Device Group has 1 fixed handle + dynamic handles for policy connections
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
        // DMS has 1 fixed handle + dynamic handles for policy connections
        <>
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
        // Certificate has 1 fixed handle + dynamic handles for policy connections
        <>
          <Handle
            id="top"
            type="source"
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
    </Card>
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

function RelationshipsFlowDiagramContent() {
  // State for tracking selected node
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  // State for tracking dynamic handles created by policy connections
  const [dynamicHandles, setDynamicHandles] = useState<Record<string, string[]>>({});
  // State for tracking pending edges that need to be created after handles are rendered
  const [pendingEdges, setPendingEdges] = useState<Edge[]>([]);
  // State for tracking handle permissions across all nodes
  const [nodeHandlePermissions, setNodeHandlePermissions] = useState<Record<string, Record<string, boolean>>>({});
  
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
    
    // Device to Device Group relationship (Device right handle → Device Group left handle)
    edges.push({
      id: 'device-device_group',
      source: 'device',
      target: 'device_group',
      sourceHandle: 'right',
      targetHandle: 'left',
      label: 'belongs_to_group',
      type: 'smoothstep',
      style: { stroke: '#6b7280', strokeWidth: 2 }, // Default gray color
      labelStyle: { fontSize: 12, fontWeight: 600 },
      labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
      markerStart: {
        type: 'arrowclosed',
        width: 20,
        height: 20,
        color: '#6b7280',
      },
    });

    // Device to DMS relationship (Device left handle → DMS right handle)
    edges.push({
      id: 'device-dms',
      source: 'device',
      target: 'dms',
      sourceHandle: 'left',
      targetHandle: 'right',
      label: 'dms_owner',
      type: 'smoothstep',
      style: { stroke: '#6b7280', strokeWidth: 2 }, // Default gray color
      labelStyle: { fontSize: 12, fontWeight: 600 },
      labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
      markerStart: {
        type: 'arrowclosed',
        width: 20,
        height: 20,
        color: '#6b7280',
      },
    });

    // Certificate to Device relationship (Certificate top handle → Device bottom handle)
    edges.push({
      id: 'certificate-device',
      source: 'certificate',
      target: 'device',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      label: 'belongs_to_device',
      type: 'smoothstep',
      style: { stroke: '#6b7280', strokeWidth: 2 }, // Default gray color
      labelStyle: { fontSize: 12, fontWeight: 600 },
      labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
      markerStart: {
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
    return edges.map(edge => {
      const isPolicyEdge = edge.source === 'policy' || edge.target === 'policy';
      
      // Check if this edge's target handle has been granted permission (for policy connections)
      const targetNodePermissions = nodeHandlePermissions[edge.target] || {};
      const isTargetPermissionGranted = edge.targetHandle && targetNodePermissions[edge.targetHandle];
      
      // Check if this edge's source handle has been granted permission (for cascading permissions)
      const sourceNodePermissions = nodeHandlePermissions[edge.source] || {};
      const isSourcePermissionGranted = edge.sourceHandle && sourceNodePermissions[edge.sourceHandle];
      
      if (isPolicyEdge) {
        // Policy edges stay blue with markerEnd (arrow at end) and dashed line
        return {
          ...edge,
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
        } as Edge;
      }
      
      if (isTargetPermissionGranted || isSourcePermissionGranted) {
        // Edge with granted permission (either target or source) - make it blue and wider
        return {
          ...edge,
          style: { ...edge.style, stroke: '#3b82f6', strokeWidth: 3 },
          markerStart: {
            type: 'arrowclosed' as const,
            width: 20,
            height: 20,
            color: '#3b82f6',
          },
        } as Edge;
      }
      
      // Default gray edges with markerStart (arrow at start)
      return {
        ...edge,
        style: { ...edge.style, stroke: '#6b7280' },
        markerStart: {
          type: 'arrowclosed' as const,
          width: 20,
          height: 20,
          color: '#6b7280',
        },
      } as Edge;
    });
  }, [edges, nodeHandlePermissions]);

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
          
          // For other nodes, use any available position
          return positions.find(pos => !existingHandles.includes(pos)) || 'top';
        };
        
        const newHandleId = getAvailablePosition(target, existingHandles);
        const dynamicHandleId = `dynamic-${newHandleId}`;
        
        // Update dynamic handles state
        setDynamicHandles(prev => {
          const newState = {
            ...prev,
            [target]: [...existingHandles, newHandleId]
          };
          return newState;
        });
        
        // Update nodes to include the new dynamic handle
        setNodes(currentNodes => {
          const updatedNodes = currentNodes.map(node => {
            if (node.id === target) {
              const updatedNode = {
                ...node,
                data: {
                  ...node.data,
                  dynamicHandles: [...existingHandles, newHandleId]
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
        markerStart: {
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