
'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Panel,
  MarkerType,
  ReactFlowProvider,
  Handle,
  Position,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RotateCcw, Landmark, CheckCircle, AlertTriangle, XCircle, Loader2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { fetchKmsKeys, type ApiKmsKey } from '@/lib/kms-data';
import { useAuth } from '@/contexts/AuthContext';
import { isPast, parseISO } from 'date-fns';
import ELK from 'elkjs/lib/elk.bundled.js';
import { toPng } from 'html-to-image';

interface CaGraphViewProps {
  cas: CA[];
  allCryptoEngines: ApiCryptoEngine[];
  router: ReturnType<typeof import('next/navigation').useRouter>;
}

interface CaNodeData extends Record<string, unknown> {
  ca: CA;
  onClick: () => void;
}

interface CryptoEngineNodeData extends Record<string, unknown> {
  engine?: ApiCryptoEngine;
  kmsKey?: ApiKmsKey;
  isUnknown?: boolean;
  keyId?: string;
}

interface GroupNodeData extends Record<string, unknown> {
  label: string;
  engine?: ApiCryptoEngine;
  kmsKey?: ApiKmsKey;
}

interface UnknownIssuerNodeData extends Record<string, unknown> {
  issuerName: string;
  issuerDN?: string;
}

type NodeData = CaNodeData | CryptoEngineNodeData | GroupNodeData;

// Helper function to calculate the best handle position based on relative node positions
const getBestHandlePositions = (
  sourceNode: Node,
  targetNode: Node
): { sourceHandle: string; targetHandle: string } => {
  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;
  
  // Determine source handle (where edge leaves from)
  // All nodes have: 'source-top', 'source-right', 'source-bottom', 'source-left'
  let sourceHandle = 'source-right'; // default
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominance
    sourceHandle = dx > 0 ? 'source-right' : 'source-left';
  } else {
    // Vertical dominance
    sourceHandle = dy > 0 ? 'source-bottom' : 'source-top';
  }
  
  // Determine target handle (where edge arrives at)
  // All nodes have: 'target-top', 'target-right', 'target-bottom', 'target-left'
  let targetHandle = 'target-left'; // default
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominance
    targetHandle = dx > 0 ? 'target-left' : 'target-right';
  } else {
    // Vertical dominance
    targetHandle = dy > 0 ? 'target-top' : 'target-bottom';
  }
  
  return { sourceHandle, targetHandle };
};

// Custom node component for CA visualization
const CaNode = ({ data }: { data: CaNodeData }) => {
  const { ca, onClick } = data;

  if (!ca) {
    return (
      <div className="w-[280px] h-[60px] bg-destructive/20 border border-destructive rounded-lg flex items-center justify-center">
        <p className="text-destructive-foreground text-sm">Error: Node data missing</p>
      </div>
    );
  }

  const isExpired = isPast(parseISO(ca.expires));
  const status = isExpired ? 'expired' : ca.status;

  let statusIcon: React.ReactNode;
  let statusBadge: React.ReactNode;
  let nodeBgColor = 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/60 dark:to-blue-900/40';
  let iconBgColor = 'bg-blue-500 dark:bg-blue-600';
  let iconColor = 'text-white';
  let titleColor = 'text-blue-900 dark:text-blue-100';
  let subtextColor = 'text-blue-700 dark:text-blue-300';
  let borderColor = 'border-blue-300 dark:border-blue-600';
  let statusBgColor = 'bg-green-100 dark:bg-green-900/50';
  let statusTextColor = 'text-green-700 dark:text-green-300';
  let shadowColor = 'shadow-blue-200/50 dark:shadow-blue-900/30';

  switch (status) {
    case 'active':
      statusIcon = <CheckCircle className="h-5 w-5 text-green-500" />;
      statusBadge = (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700">
          <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
          <span className="text-[10px] font-medium text-green-700 dark:text-green-300">Active</span>
        </div>
      );
      break;
    case 'expired':
      statusIcon = <AlertTriangle className="h-5 w-5 text-orange-500" />;
      nodeBgColor = 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/60 dark:to-orange-900/40';
      iconBgColor = 'bg-orange-500 dark:bg-orange-600';
      titleColor = 'text-orange-900 dark:text-orange-100';
      subtextColor = 'text-orange-700 dark:text-orange-300';
      borderColor = 'border-orange-300 dark:border-orange-600';
      shadowColor = 'shadow-orange-200/50 dark:shadow-orange-900/30';
      statusBadge = (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/50 border border-orange-300 dark:border-orange-700">
          <AlertTriangle className="h-3 w-3 text-orange-600 dark:text-orange-400" />
          <span className="text-[10px] font-medium text-orange-700 dark:text-orange-300">Expired</span>
        </div>
      );
      break;
    case 'revoked':
      statusIcon = <XCircle className="h-5 w-5 text-red-500" />;
      nodeBgColor = 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/60 dark:to-red-900/40';
      iconBgColor = 'bg-red-500 dark:bg-red-600';
      titleColor = 'text-red-900 dark:text-red-100';
      subtextColor = 'text-red-700 dark:text-red-300';
      borderColor = 'border-red-300 dark:border-red-600';
      shadowColor = 'shadow-red-200/50 dark:shadow-red-900/30';
      statusBadge = (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700">
          <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
          <span className="text-[10px] font-medium text-red-700 dark:text-red-300">Revoked</span>
        </div>
      );
      break;
  }

  return (
    <div
      className={cn(
        'rounded-xl p-3 flex flex-col gap-2 w-[380px] h-[85px] shadow-lg border-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-xl',
        nodeBgColor,
        borderColor,
        shadowColor
      )}
      onClick={onClick}
    >
      {/* Handles on all four sides for dynamic edge connections - both source and target */}
      <Handle type="target" position={Position.Top} id="target-top" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="target-right" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="target-left" style={{ opacity: 0 }} />
      
      <Handle type="source" position={Position.Top} id="source-top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="source-right" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} id="source-left" style={{ opacity: 0 }} />
      
      {/* Header row with icon and status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={cn('p-1.5 rounded-lg flex-shrink-0 shadow-sm', iconBgColor)}>
            <Landmark className={cn('h-5 w-5', iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('font-bold text-sm truncate leading-tight', titleColor)}>{ca.name}</p>
          </div>
        </div>
        {statusBadge}
      </div>
      
      {/* Info row */}
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-[11px] font-mono truncate flex-1', subtextColor)}>
          {ca.id}
        </p>
        {ca.issuer === 'Self-signed' ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-300 dark:border-indigo-700">
            <span className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Root CA</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600">
            <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">Intermediate CA</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Custom node component for Crypto Engine visualization
const CryptoEngineNode = ({ data }: { data: CryptoEngineNodeData }) => {
  const { engine, kmsKey, isUnknown, keyId } = data;

  // Unknown KMS Key styling
  if (isUnknown) {
    return (
      <div
        className="rounded-xl p-2.5 flex items-center gap-3 w-[320px] h-[65px] shadow-lg border-2 bg-gradient-to-br from-muted/30 to-muted/50 dark:from-muted/20 dark:to-muted/40 border-muted-foreground/40 dark:border-muted-foreground/30 shadow-muted/30 transition-all duration-200"
        style={{ borderStyle: 'dashed' }}
      >
        {/* Handles on all four sides for dynamic edge connections - both source and target */}
        <Handle type="target" position={Position.Top} id="target-top" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Right} id="target-right" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Left} id="target-left" style={{ opacity: 0 }} />
        
        <Handle type="source" position={Position.Top} id="source-top" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right} id="source-right" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Left} id="source-left" style={{ opacity: 0 }} />
        
        <div className="flex-shrink-0 bg-muted p-2 rounded-lg shadow-sm">
          <Landmark className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-grow min-w-0">
          <p className="text-sm font-bold truncate text-muted-foreground leading-tight">Unknown KMS Key</p>
          <p className="text-[11px] font-mono text-muted-foreground/70 truncate mt-0.5">
            {keyId || 'No key ID'}
          </p>
        </div>
      </div>
    );
  }

  // Normal KMS Key styling
  return (
    <div
      className="rounded-xl p-2.5 flex items-center gap-3 w-[320px] h-[65px] shadow-lg border-2 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/60 dark:to-purple-900/40 border-purple-300 dark:border-purple-600 shadow-purple-200/50 dark:shadow-purple-900/30 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
    >
      {/* Handles on all four sides for dynamic edge connections - both source and target */}
      <Handle type="target" position={Position.Top} id="target-top" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="target-right" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="target-left" style={{ opacity: 0 }} />
      
      <Handle type="source" position={Position.Top} id="source-top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="source-right" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} id="source-left" style={{ opacity: 0 }} />
      
      <div className="flex-shrink-0 bg-purple-500 dark:bg-purple-600 p-2 rounded-lg shadow-sm">
        <CryptoEngineViewer engine={engine!} iconOnly />
      </div>
      <div className="flex-grow min-w-0">
        <p className="text-sm font-bold truncate text-purple-900 dark:text-purple-100 leading-tight">{kmsKey!.name}</p>
        <p className="text-[11px] font-mono text-purple-700 dark:text-purple-300 truncate mt-0.5">
          {kmsKey!.key_id}
        </p>
      </div>
    </div>
  );
};

// Custom Group node component
const GroupNode = ({ data }: { data: GroupNodeData }) => {
  return (
    <div className="relative w-full h-full">
      {/* Group header with crypto engine */}
      <div className="absolute top-0 left-0 right-0 bg-purple-100 dark:bg-purple-900/50 border-b border-purple-300 dark:border-purple-700 rounded-t-xl">
        <div className="px-3 py-1.5">
          <p className="text-xs font-semibold text-purple-900 dark:text-purple-100 truncate">
            {data.label}
          </p>
        </div>
        {/* Crypto Engine display */}
        {data.engine && data.kmsKey && (
          <div className="px-3 pb-2 flex items-center gap-2">
            <div className="flex-shrink-0 bg-purple-500 dark:bg-purple-600 p-1.5 rounded shadow-sm">
              <CryptoEngineViewer engine={data.engine} iconOnly />
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-xs font-semibold truncate text-purple-900 dark:text-purple-100 leading-tight">
                {data.kmsKey.name}
              </p>
              <p className="text-[10px] font-mono text-purple-700 dark:text-purple-300 truncate">
                {data.kmsKey.key_id}
              </p>
            </div>
          </div>
        )}
      </div>
      {/* Handles for group-level connections */}
      <Handle type="target" position={Position.Top} id="target-top" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="target-right" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="target-left" style={{ opacity: 0 }} />
      
      <Handle type="source" position={Position.Top} id="source-top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="source-right" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} id="source-left" style={{ opacity: 0 }} />
    </div>
  );
};

// Custom node component for Unknown Issuer visualization
const UnknownIssuerNode = ({ data }: { data: UnknownIssuerNodeData }) => {
  const { issuerName, issuerDN } = data;

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2 w-[380px] h-[85px] shadow-lg border-2 bg-gradient-to-br from-muted/30 to-muted/50 dark:from-muted/20 dark:to-muted/40 border-muted-foreground/40 dark:border-muted-foreground/30 shadow-muted/30 transition-all duration-200"
      style={{ borderStyle: 'dashed' }}
    >
      {/* Handles on all four sides for dynamic edge connections - both source and target */}
      <Handle type="target" position={Position.Top} id="target-top" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="target-right" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="target-left" style={{ opacity: 0 }} />
      
      <Handle type="source" position={Position.Top} id="source-top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="source-right" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left} id="source-left" style={{ opacity: 0 }} />
      
      {/* Header row with icon */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-1.5 rounded-lg flex-shrink-0 shadow-sm bg-muted">
            <Landmark className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate leading-tight text-muted-foreground">Unknown Issuer</p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-muted-foreground/30">
          <AlertTriangle className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">Not Found</span>
        </div>
      </div>
      
      {/* Info row - show issuerDN if available, otherwise issuerName (ID) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-mono truncate flex-1 text-muted-foreground/70" title={issuerDN || issuerName}>
          {issuerDN || issuerName}
        </p>
      </div>
    </div>
  );
};

const nodeTypes = {
  caNode: CaNode,
  cryptoEngineNode: CryptoEngineNode,
  group: GroupNode,
  unknownIssuerNode: UnknownIssuerNode,
};

// ELK instance for graph layout
const elk = new ELK();

// ELK layouting options
const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '100',
  'elk.layered.spacing.nodeNodeBetweenLayers': '150',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.separateConnectedComponents': 'true',
  'elk.spacing.componentComponent': '100',
};

// Helper function to calculate layout using ELK with port configuration
const getLayoutedElements = async (
  nodes: Node<NodeData>[],
  edges: Edge[]
): Promise<Node<NodeData>[]> => {
  // Only layout nodes that don't have a parent (top-level nodes and groups)
  const topLevelNodes = nodes.filter(node => !node.parentId);
  
  const graph = {
    id: 'root',
    layoutOptions,
    children: topLevelNodes.map((node) => {
      // Determine node dimensions
      let width = 380;
      let height = 85;
      
      if (node.type === 'cryptoEngineNode') {
        width = 320;
        height = 65;
      } else if (node.type === 'group') {
        width = node.style?.width as number || 420;
        height = node.style?.height as number || 300;
      }

      // Define ports on all four sides for flexible edge routing with consistent naming
      // All nodes have both source and target ports in all directions
      const ports = [
        { id: node.id }, // default port
        { id: `${node.id}-source-top`, properties: { side: 'NORTH' } },
        { id: `${node.id}-source-right`, properties: { side: 'EAST' } },
        { id: `${node.id}-source-bottom`, properties: { side: 'SOUTH' } },
        { id: `${node.id}-source-left`, properties: { side: 'WEST' } },
        { id: `${node.id}-target-top`, properties: { side: 'NORTH' } },
        { id: `${node.id}-target-right`, properties: { side: 'EAST' } },
        { id: `${node.id}-target-bottom`, properties: { side: 'SOUTH' } },
        { id: `${node.id}-target-left`, properties: { side: 'WEST' } },
      ];

      return {
        id: node.id,
        width,
        height,
        properties: {
          'org.eclipse.elk.portConstraints': 'FREE', // Changed from FIXED_ORDER to FREE for dynamic routing
        },
        ports,
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceHandle ? `${edge.source}-${edge.sourceHandle}` : edge.source],
      targets: [edge.targetHandle ? `${edge.target}-${edge.targetHandle}` : edge.target],
    })),
  };

  try {
    const layoutedGraph = await elk.layout(graph);

    const layoutedNodes = nodes.map((node) => {
      // Child nodes keep their relative positions
      if (node.parentId) {
        return node;
      }
      
      // Top-level nodes get positioned by ELK
      const layoutedNode = layoutedGraph.children?.find((lgNode) => lgNode.id === node.id);
      return {
        ...node,
        position: {
          x: layoutedNode?.x ?? 0,
          y: layoutedNode?.y ?? 0,
        },
      };
    });

    return layoutedNodes;
  } catch (error) {
    console.error('ELK layout error:', error);
    // Fallback to original positions if ELK fails
    return nodes;
  }
};

// Custom hook to handle ELK layout
function useLayoutNodes() {
  const nodesInitialized = useNodesInitialized();
  const { getNodes, getEdges, setNodes, fitView } = useReactFlow<Node<NodeData>>();

  useEffect(() => {
    if (nodesInitialized) {
      const layoutNodes = async () => {
        const layoutedNodes = await getLayoutedElements(getNodes(), getEdges());
        setNodes(layoutedNodes);
        window.requestAnimationFrame(() => fitView());
      };

      layoutNodes();
    }
  }, [nodesInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}

const CaGraphViewInner: React.FC<CaGraphViewProps> = ({ cas, allCryptoEngines, router }) => {
  const { user } = useAuth();
  const [kmsKeys, setKmsKeys] = useState<ApiKmsKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const graphRef = useRef<HTMLDivElement>(null);
  
  // Edge visibility toggles
  const [showHierarchyEdges, setShowHierarchyEdges] = useState(true);
  const [showAttestedKeyEdges, setShowAttestedKeyEdges] = useState(true);
  const [showSignedByEdges, setShowSignedByEdges] = useState(true);
  const [groupByAttestedKey, setGroupByAttestedKey] = useState(true);

  // Fetch KMS keys on mount
  useEffect(() => {
    const loadKmsKeys = async () => {
      if (!user?.access_token) {
        setIsLoadingKeys(false);
        return;
      }
      
      try {
        const params = new URLSearchParams();
        const keysData = await fetchKmsKeys(user.access_token, params);
        setKmsKeys(keysData.list);
      } catch (error) {
        console.error('Error fetching KMS keys:', error);
        setKmsKeys([]);
      } finally {
        setIsLoadingKeys(false);
      }
    };

    loadKmsKeys();
  }, [user?.access_token]);

  // Create a map for quick lookup
  const kmsKeysMap = useMemo(() => {
    const map = new Map<string, ApiKmsKey>();
    kmsKeys.forEach(key => {
      // Map by key_id which should match the CA's subjectKeyId
      map.set(key.key_id, key);
    });
    return map;
  }, [kmsKeys]);

  // Add effect to update edge handles dynamically when nodes move
  useEffect(() => {
    if (nodes.length === 0 || edges.length === 0) return;

    const nodesMap = new Map(nodes.map(n => [n.id, n]));
    
    // Update edges with dynamic handle positions
    const updatedEdges = edges.map(edge => {
      const sourceNode = nodesMap.get(edge.source);
      const targetNode = nodesMap.get(edge.target);
      
      if (!sourceNode || !targetNode) return edge;
      
      // Calculate best handle positions based on node positions
      const { sourceHandle, targetHandle } = getBestHandlePositions(sourceNode, targetNode);
      
      // Only update if handles have changed
      if (edge.sourceHandle === sourceHandle && edge.targetHandle === targetHandle) {
        return edge;
      }
      
      return {
        ...edge,
        sourceHandle,
        targetHandle,
      };
    });
    
    // Only update if edges have changed
    const hasChanges = updatedEdges.some((edge, i) => 
      edge.sourceHandle !== edges[i].sourceHandle || 
      edge.targetHandle !== edges[i].targetHandle
    );
    
    if (hasChanges) {
      setEdges(updatedEdges);
    }
  }, [nodes, edges, setEdges]);

  // Build ReactFlow nodes and edges from CA data
  useEffect(() => {
    if (cas.length === 0 || isLoadingKeys) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const allNodes: CA[] = [];
    const flatten = (caList: CA[]) => {
      caList.forEach(ca => {
        allNodes.push(ca);
        if (ca.children) flatten(ca.children);
      });
    };
    flatten(cas);

    // Group CAs by their subject_key_id (attested key)
    const casByAttestedKey = new Map<string, CA[]>();
    allNodes.forEach(ca => {
      if (ca.subjectKeyId) {
        if (!casByAttestedKey.has(ca.subjectKeyId)) {
          casByAttestedKey.set(ca.subjectKeyId, []);
        }
        casByAttestedKey.get(ca.subjectKeyId)!.push(ca);
      }
    });

    const reactFlowNodes: Node<NodeData>[] = [];
    const groupIdToKeyIdMap = new Map<string, string>(); // Track group IDs to key IDs

    // Conditionally create groups based on toggle
    if (groupByAttestedKey) {
      // Create group nodes for each attested key with multiple CAs
      casByAttestedKey.forEach((casInGroup, keyId) => {
        if (casInGroup.length > 1) {
          const kmsKey = kmsKeysMap.get(keyId);
          const engine = kmsKey ? allCryptoEngines.find((e: ApiCryptoEngine) => e.id === kmsKey.engine_id) : undefined;
          const groupId = `group-${keyId}`;
          groupIdToKeyIdMap.set(groupId, keyId);
          
          // Create a group node with engine and key data
          reactFlowNodes.push({
            id: groupId,
            type: 'group',
            data: { 
              label: "",
              engine,
              kmsKey,
            },
            position: { x: 0, y: 0 },
            style: {
              width: 420,
              height: casInGroup.length * 100 + 120, // Extra space for crypto engine display
              backgroundColor: 'rgba(168, 85, 247, 0.05)',
              border: '2px dashed rgba(168, 85, 247, 0.3)',
              borderRadius: '12px',
              padding: '10px',
            },
          });

          // Create CA nodes as children of the group
          casInGroup.forEach((ca, index) => {
            reactFlowNodes.push({
              id: ca.id,
              type: 'caNode',
              data: {
                ca,
                onClick: () => router.push(`/certificate-authorities/details?caId=${ca.id}`),
              },
              position: { x: 20, y: 85 + index * 95 }, // Offset for crypto engine header
              parentId: groupId,
              extent: 'parent',
              draggable: false, // Prevent moving nodes inside the group
              width: 380,
              height: 85,
            });
          });
        } else {
          // Single CA - no group needed
          const ca = casInGroup[0];
          reactFlowNodes.push({
            id: ca.id,
            type: 'caNode',
            data: {
              ca,
              onClick: () => router.push(`/certificate-authorities/details?caId=${ca.id}`),
            },
            position: { x: 0, y: 0 },
            width: 380,
            height: 85,
          });
        }
      });
    } else {
      // No grouping - create all CA nodes as standalone
      allNodes.forEach(ca => {
        reactFlowNodes.push({
          id: ca.id,
          type: 'caNode',
          data: {
            ca,
            onClick: () => router.push(`/certificate-authorities/details?caId=${ca.id}`),
          },
          position: { x: 0, y: 0 },
          width: 380,
          height: 85,
        });
      });
    }

    // Handle CAs without subjectKeyId (shouldn't happen, but just in case)
    allNodes.forEach(ca => {
      if (!ca.subjectKeyId && !reactFlowNodes.find(n => n.id === ca.id)) {
        reactFlowNodes.push({
          id: ca.id,
          type: 'caNode',
          data: {
            ca,
            onClick: () => router.push(`/certificate-authorities/details?caId=${ca.id}`),
          },
          position: { x: 0, y: 0 },
          width: 380,
          height: 85,
        });
      }
    });

    // Create ReactFlow nodes for Crypto Engines (only for ungrouped keys when grouping is enabled)
    const cryptoEngineNodes: Node<CryptoEngineNodeData>[] = [];
    const addedEngineNodes = new Set<string>();
    
    allNodes.forEach(ca => {
      // Add crypto engine node for subject_key_id (CA's own key)
      if (ca.subjectKeyId) {
        // Skip if this key is used in a group (when grouping is enabled)
        const groupId = `group-${ca.subjectKeyId}`;
        if (groupByAttestedKey && reactFlowNodes.some(n => n.id === groupId)) {
          return; // Skip - crypto engine is shown inside the group
        }
        
        const kmsKey = kmsKeysMap.get(ca.subjectKeyId);
        const engineNodeId = `engine-${ca.subjectKeyId}`;
        
        if (kmsKey) {
          const engine = allCryptoEngines.find((e: ApiCryptoEngine) => e.id === kmsKey.engine_id);
          if (engine) {
            if (!addedEngineNodes.has(engineNodeId)) {
              cryptoEngineNodes.push({
                id: engineNodeId,
                type: 'cryptoEngineNode',
                data: {
                  engine,
                  kmsKey,
                  isUnknown: false,
                },
                position: { x: 0, y: 0 }, // Will be set by layout algorithm
                width: 320,
                height: 65,
              });
              addedEngineNodes.add(engineNodeId);
            }
          }
        } else {
          // Create unknown KMS Key node
          if (!addedEngineNodes.has(engineNodeId)) {
            cryptoEngineNodes.push({
              id: engineNodeId,
              type: 'cryptoEngineNode',
              data: {
                isUnknown: true,
                keyId: ca.subjectKeyId,
              },
              position: { x: 0, y: 0 }, // Will be set by layout algorithm
              width: 320,
              height: 65,
            });
            addedEngineNodes.add(engineNodeId);
          }
        }
      }

      // Add crypto engine node for authority_key_id (signing key)
      if (ca.authorityKeyId && ca.authorityKeyId !== ca.subjectKeyId) {
        const kmsKey = kmsKeysMap.get(ca.authorityKeyId);
        const engineNodeId = `engine-${ca.authorityKeyId}`;
        
        if (kmsKey) {
          const engine = allCryptoEngines.find((e: ApiCryptoEngine) => e.id === kmsKey.engine_id);
          if (engine) {
            if (!addedEngineNodes.has(engineNodeId)) {
              cryptoEngineNodes.push({
                id: engineNodeId,
                type: 'cryptoEngineNode',
                data: {
                  engine,
                  kmsKey,
                  isUnknown: false,
                },
                position: { x: 0, y: 0 }, // Will be set by layout algorithm
                width: 320,
                height: 65,
              });
              addedEngineNodes.add(engineNodeId);
            }
          }
        } else {
          // Create unknown KMS Key node for authority key
          if (!addedEngineNodes.has(engineNodeId)) {
            cryptoEngineNodes.push({
              id: engineNodeId,
              type: 'cryptoEngineNode',
              data: {
                isUnknown: true,
                keyId: ca.authorityKeyId,
              },
              position: { x: 0, y: 0 }, // Will be set by layout algorithm
              width: 320,
              height: 65,
            });
            addedEngineNodes.add(engineNodeId);
          }
        }
      }
    });

    // Add crypto engine nodes to the main nodes array
    reactFlowNodes.push(...cryptoEngineNodes);

    // Create ReactFlow edges for CA hierarchy
    const reactFlowEdges: Edge[] = [];
    const addedUnknownIssuers = new Set<string>();
    
    // Helper to get initial handle positions
    const getInitialHandles = (sourceId: string, targetId: string) => {
      const sourceNode = reactFlowNodes.find(n => n.id === sourceId);
      const targetNode = reactFlowNodes.find(n => n.id === targetId);
      
      if (sourceNode && targetNode) {
        return getBestHandlePositions(sourceNode, targetNode);
      }
      return { sourceHandle: 'source-right', targetHandle: 'target-left' };
    };
    
    allNodes.forEach(ca => {
      if (ca.issuer && ca.issuer !== 'Self-signed') {
        const issuerExists = allNodes.some(node => node.id === ca.issuer);
        
        if (!issuerExists) {
          // Create unknown issuer node if not already added
          const unknownIssuerId = `unknown-issuer-${ca.issuer}`;
          if (!addedUnknownIssuers.has(unknownIssuerId)) {
            // Format issuer DN for display
            let issuerDN = 'Unknown';
            if (ca.issuerDN?.common_name) {
              const parts = [];
              if (ca.issuerDN.common_name) parts.push(`CN=${ca.issuerDN.common_name}`);
              if (ca.issuerDN.organization) parts.push(`O=${ca.issuerDN.organization}`);
              if (ca.issuerDN.organization_unit) parts.push(`OU=${ca.issuerDN.organization_unit}`);
              if (ca.issuerDN.country) parts.push(`C=${ca.issuerDN.country}`);
              issuerDN = parts.join(', ');
            }
            
            reactFlowNodes.push({
              id: unknownIssuerId,
              type: 'unknownIssuerNode',
              data: {
                issuerName: ca.issuer || 'Unknown',
                issuerDN: issuerDN,
              },
              position: { x: 0, y: 0 }, // Will be set by layout algorithm
              width: 380,
              height: 85,
            });
            addedUnknownIssuers.add(unknownIssuerId);
          }
          
          // Create edge from unknown issuer to CA
          let targetId = ca.id;
          
          // Check if target CA is in a group
          if (groupByAttestedKey && ca.subjectKeyId) {
            const targetGroupId = `group-${ca.subjectKeyId}`;
            if (reactFlowNodes.some(n => n.id === targetGroupId)) {
              targetId = targetGroupId;
            }
          }
          
          const { sourceHandle, targetHandle } = getInitialHandles(unknownIssuerId, targetId);
          reactFlowEdges.push({
            id: `${unknownIssuerId}-${ca.id}`,
            source: unknownIssuerId,
            target: targetId,
            type: 'smoothstep',
            sourceHandle,
            targetHandle,
            animated: false,
            data: { edgeType: 'hierarchy' },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#64748b', // slate-500 for visibility
            },
            style: {
              strokeWidth: 2,
              stroke: '#64748b', // slate-500 for clear visibility in exports
            },
          });
        } else if (issuerExists) {
          // Determine source and target (use group if grouped and exists)
          let sourceId = ca.issuer;
          let targetId = ca.id;
          
          if (groupByAttestedKey) {
            // Check if source CA is in a group
            const sourceCa = allNodes.find(n => n.id === ca.issuer);
            if (sourceCa?.subjectKeyId) {
              const sourceGroupId = `group-${sourceCa.subjectKeyId}`;
              if (reactFlowNodes.some(n => n.id === sourceGroupId)) {
                sourceId = sourceGroupId;
              }
            }
            
            // Check if target CA is in a group
            if (ca.subjectKeyId) {
              const targetGroupId = `group-${ca.subjectKeyId}`;
              if (reactFlowNodes.some(n => n.id === targetGroupId)) {
                targetId = targetGroupId;
              }
            }
          }
          
          const { sourceHandle, targetHandle } = getInitialHandles(sourceId, targetId);
          reactFlowEdges.push({
            id: `${ca.issuer}-${ca.id}`,
            source: sourceId,
            target: targetId,
            type: 'smoothstep',
            sourceHandle,
            targetHandle,
            animated: false,
            data: { edgeType: 'hierarchy' },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#64748b', // slate-500 for visibility
            },
            style: {
              strokeWidth: 2,
              stroke: '#64748b', // slate-500 for clear visibility in exports
            },
          });
        }
      }

      // Add edge from crypto engine to CA for subject_key_id (CA's own key)
      // In group mode, edge connects to the group instead
      if (ca.subjectKeyId) {
        const engineNodeId = `engine-${ca.subjectKeyId}`;
        let targetId = ca.id;
        
        // If grouping is enabled and this CA is in a group, connect to the group
        if (groupByAttestedKey) {
          const groupId = `group-${ca.subjectKeyId}`;
          if (reactFlowNodes.some(n => n.id === groupId)) {
            // Skip - don't create edge, crypto engine is inside the group
            return;
          }
        }
        
        const { sourceHandle, targetHandle } = getInitialHandles(engineNodeId, targetId);
        reactFlowEdges.push({
          id: `${engineNodeId}-${ca.id}-subject`,
          source: engineNodeId,
          target: targetId,
          type: 'smoothstep',
          sourceHandle,
          targetHandle,
          animated: false,
          data: { edgeType: 'attested' },
          label: 'attested key',
          labelStyle: { fill: '#10b981', fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: '#f0fdf4' },
          style: {
            strokeWidth: 2,
            stroke: '#10b981', // green color for subject_key_id (attested key)
          },
        });
      }

      // Add edge from crypto engine to CA for authority_key_id (signing key)
      if (ca.authorityKeyId) {
        const engineNodeId = `engine-${ca.authorityKeyId}`;
        let targetId = ca.id;
        
        // If grouping is enabled and this CA is in a group, connect to the group
        if (groupByAttestedKey) {
          const groupId = `group-${ca.subjectKeyId}`;
          if (reactFlowNodes.some(n => n.id === groupId)) {
            targetId = groupId;
          }
        }
        
        const { sourceHandle, targetHandle } = getInitialHandles(engineNodeId, targetId);
        reactFlowEdges.push({
          id: `${engineNodeId}-${ca.id}-authority`,
          source: engineNodeId,
          target: targetId,
          type: 'smoothstep',
          sourceHandle,
          targetHandle,
          animated: false,
          data: { edgeType: 'signed' },
          label: 'signed by',
          labelStyle: { fill: '#f59e0b', fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: '#fffbeb' },
          style: {
            strokeWidth: 2,
            stroke: '#f59e0b', // amber/orange color for authority_key_id (signed by)
            strokeDasharray: '8,4',
          },
        });
      }
    });

    // Filter edges based on visibility settings
    const filteredEdges = reactFlowEdges.filter(edge => {
      const edgeType = edge.data?.edgeType;
      if (edgeType === 'hierarchy' && !showHierarchyEdges) return false;
      if (edgeType === 'attested' && !showAttestedKeyEdges) return false;
      if (edgeType === 'signed' && !showSignedByEdges) return false;
      return true;
    });

    // Set nodes and edges - layout will be applied by useLayoutNodes hook
    setNodes(reactFlowNodes);
    setEdges(filteredEdges);
  }, [cas, allCryptoEngines, kmsKeysMap, router, isLoadingKeys, setNodes, setEdges, showHierarchyEdges, showAttestedKeyEdges, showSignedByEdges, groupByAttestedKey]);

  // Use the layout hook to automatically apply ELK layout
  useLayoutNodes();

  // Get fitView to reset the view
  const { fitView } = useReactFlow();

  const handleReset = () => {
    fitView({ padding: 0.2, duration: 300 });
  };

  const handleDownloadImage = useCallback(async () => {
    if (!graphRef.current) return;
    
    setIsDownloading(true);
    try {
      // Find the ReactFlow viewport element
      const viewportElement = graphRef.current.querySelector('.react-flow__viewport');
      if (!viewportElement) {
        console.error('ReactFlow viewport not found');
        return;
      }

      // Generate the image
      const dataUrl = await toPng(viewportElement as HTMLElement, {
        backgroundColor: '#ffffff',
        quality: 1,
        pixelRatio: 2, // Higher resolution
        filter: (node) => {
          // Exclude controls and panels from the export
          if (node.classList) {
            return !node.classList.contains('react-flow__controls') &&
                   !node.classList.contains('react-flow__panel') &&
                   !node.classList.contains('react-flow__attribution');
          }
          return true;
        },
      });

      // Download the image
      const link = document.createElement('a');
      link.download = `ca-graph-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error downloading image:', error);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  if (isLoadingKeys) {
    return (
      <div className="w-full h-[calc(100vh-250px)] border rounded-md relative overflow-hidden flex flex-col bg-background">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div ref={graphRef} className="w-full h-[calc(100vh-250px)] border rounded-md relative overflow-hidden flex flex-col bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls showInteractive={false} />
        <Panel position="top-left" className="flex items-center gap-4 bg-background/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleReset} 
            title="Reset View"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleDownloadImage}
            disabled={isDownloading}
            title="Download as Image"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="group-toggle"
                checked={groupByAttestedKey}
                onCheckedChange={setGroupByAttestedKey}
                aria-label="Toggle Group by Attested Key"
              />
              <label htmlFor="group-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap text-purple-600 dark:text-purple-400">
                Group by Attested Key
              </label>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Switch
                id="hierarchy-toggle"
                checked={showHierarchyEdges}
                onCheckedChange={setShowHierarchyEdges}
                aria-label="Toggle CA Hierarchy edges"
              />
              <label htmlFor="hierarchy-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                CA Hierarchy
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="attested-toggle"
                checked={showAttestedKeyEdges}
                onCheckedChange={setShowAttestedKeyEdges}
                aria-label="Toggle Attested Key edges"
              />
              <label htmlFor="attested-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap text-green-600 dark:text-green-400">
                Attested Key
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="signed-toggle"
                checked={showSignedByEdges}
                onCheckedChange={setShowSignedByEdges}
                aria-label="Toggle Signed By edges"
              />
              <label htmlFor="signed-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap text-amber-600 dark:text-amber-400">
                Signed By
              </label>
            </div>
          </div>
        </Panel>
        <Panel position="bottom-right" className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
          <div className="text-xs font-semibold mb-2">Legend</div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-muted-foreground"></div>
              <span>CA Hierarchy</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-[#10b981]"></div>
              <span className="text-green-600 dark:text-green-400">Attested Key</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-[#f59e0b]" style={{ borderTop: '2px dashed #f59e0b', height: 0 }}></div>
              <span className="text-amber-600 dark:text-amber-400">Signed By</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export const CaGraphView: React.FC<CaGraphViewProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CaGraphViewInner {...props} />
    </ReactFlowProvider>
  );
};

