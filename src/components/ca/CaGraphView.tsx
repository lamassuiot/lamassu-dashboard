'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  MarkerType,
  ReactFlowProvider,
  Handle,
  Position,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import { toPng } from 'html-to-image';
import { ArrowDownUp, Download, FileBadge, GitMerge, KeyRound, Loader2, LocateFixed, Maximize, Minimize, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { getEffectiveCaStatus } from '@/lib/ca-utils';
import type { CA } from '@/lib/ca-data';
import { fetchKmsKeys, type ApiKmsKey } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { buildKeyGraph, findCrossSignedKeys, isolateKeys, isSelfSigned, pairMutualSignatures, stackMutualKeys, type GraphKey } from './ca-key-graph';

interface CaGraphViewProps {
  cas: CA[];
  allCryptoEngines: ApiCryptoEngine[];
  router: ReturnType<typeof import('@/lib/router').useRouter>;
}

// Fixed geometry so ELK can place ports exactly where the row handles render.
const NODE_WIDTH = 360;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 40;
const BORDER = 1;

const nodeHeight = (rows: number) => HEADER_HEIGHT + Math.max(rows, 1) * ROW_HEIGHT + BORDER * 2;
const rowHandleId = (caId: string) => `cert-${caId}`;
// Keys that cross-signed each other are stacked vertically and joined top-to-bottom.
const STACK_GAP = 72;

const SIGNATURE_MARKER = { type: MarkerType.ArrowClosed, width: 16, height: 16 };
const MUTUAL_COLOR = 'var(--color-primary)';
const MUTUAL_MARKER = { type: MarkerType.ArrowClosed, width: 10, height: 10, color: MUTUAL_COLOR };
const MUTUAL_STROKE_WIDTH = 3;

interface KeyNodeData extends Record<string, unknown> {
  graphKey: GraphKey;
  isCrossSigned: boolean;
  /** Certificates of this key issued by a mutually cross-signing key, mapped to that key's title. */
  mutualSigners: Record<string, string>;
  onOpenCa: (caId: string) => void;
}

type KeyFlowNode = Node<KeyNodeData, 'key'>;

// Prefer the algorithm as attested in the certificate; KMS metadata covers signer-only keys.
const formatAlgorithm = (graphKey: GraphKey): string | undefined => {
  if (graphKey.certificates[0]) return graphKey.certificates[0].keyAlgorithm;
  if (graphKey.kmsKey) return `${graphKey.kmsKey.algorithm} (${graphKey.kmsKey.size} bit)`;
  return undefined;
};

const keyTitle = (graphKey: GraphKey): string => {
  if (graphKey.kmsKey) return graphKey.kmsKey.name;
  if (!graphKey.keyId) return 'Unknown key';
  return graphKey.certificates.length === 0 ? 'External key' : 'Key not in KMS';
};

const KeyNode = ({ data }: NodeProps<KeyFlowNode>) => {
  const { graphKey, isCrossSigned, mutualSigners, onOpenCa } = data;
  const isExternal = graphKey.certificates.length === 0;
  const algorithm = formatAlgorithm(graphKey);
  const title = keyTitle(graphKey);

  return (
    <div
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-xs',
        isExternal && 'border-dashed bg-muted/40',
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Top} id="mutual-top" className="opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="mutual-bottom" className="opacity-0" isConnectable={false} />
      <div className="relative flex items-center gap-3 border-b px-3" style={{ height: HEADER_HEIGHT }}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          {graphKey.engine ? <CryptoEngineViewer engine={graphKey.engine} iconOnly /> : <KeyRound className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{title}</p>
          <p className="truncate text-xs text-muted-foreground" title={graphKey.keyId}>
            {graphKey.keyId ? <IdentifierDisplay value={graphKey.keyId} className="text-xs" /> : 'No Subject Key ID'}
            {algorithm && <span> · {algorithm}</span>}
          </p>
        </div>
        {isCrossSigned && (
          <Badge variant="info" title="Certificates for this key were signed by more than one key">
            <GitMerge />
            Cross-signed
          </Badge>
        )}
        <Handle type="source" position={Position.Right} id="signs" className="opacity-0" isConnectable={false} />
      </div>

      {isExternal ? (
        <div className="flex items-center px-3 text-xs text-muted-foreground" style={{ height: ROW_HEIGHT }}>
          <span className="truncate">
            No certificate in view{graphKey.issuerHint ? ` · issuer ${graphKey.issuerHint}` : ''}
          </span>
        </div>
      ) : (
        graphKey.certificates.map(ca => {
          const mutualSigner = mutualSigners[ca.id];
          return (
          <button
            key={ca.id}
            type="button"
            onClick={() => onOpenCa(ca.id)}
            className="nodrag relative flex w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none last:rounded-b-lg"
            style={{ height: ROW_HEIGHT }}
            title={mutualSigner ? `Open ${ca.name} · cross-signed by ${mutualSigner}` : `Open ${ca.name}`}
          >
            <Handle type="target" position={Position.Left} id={rowHandleId(ca.id)} className="opacity-0" isConnectable={false} />
            {mutualSigner
              ? <ArrowDownUp className="size-4 shrink-0 text-primary" />
              : <FileBadge className="size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate text-sm">{ca.name}</span>
            {isSelfSigned(ca) && <Badge variant="secondary">Self-signed</Badge>}
            <ApiStatusBadge status={getEffectiveCaStatus(ca)} />
          </button>
          );
        })
      )}
    </div>
  );
};

const nodeTypes = { key: KeyNode };

const elk = new ELK();

const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'SPLINES',
  'elk.spacing.nodeNode': '32',
  'elk.layered.spacing.nodeNodeBetweenLayers': '96',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.separateConnectedComponents': 'true',
  'elk.spacing.componentComponent': '64',
};

const elkPorts = (node: KeyFlowNode, yOffset: number) => [
  { id: `${node.id}::signs`, x: NODE_WIDTH, y: yOffset + HEADER_HEIGHT / 2, layoutOptions: { 'elk.port.side': 'EAST' } },
  ...node.data.graphKey.certificates.map((ca, i) => ({
    id: `${node.id}::${rowHandleId(ca.id)}`,
    x: 0,
    y: yOffset + HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2,
    layoutOptions: { 'elk.port.side': 'WEST' },
  })),
];

const flowNodeHeight = (node: KeyFlowNode) => nodeHeight(node.data.graphKey.certificates.length);

/**
 * Lays out nodes with ELK. Each stack is handed to ELK as one tall node so its members
 * stay vertically aligned, then split back into the individual cards.
 */
async function layoutNodes(nodes: KeyFlowNode[], edges: Edge[], stacks: string[][]): Promise<KeyFlowNode[]> {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const groups = [
    ...stacks.map(stack => stack.map(id => nodesById.get(id)).filter((n): n is KeyFlowNode => !!n)),
    ...nodes.filter(node => !stacks.some(stack => stack.includes(node.id))).map(node => [node]),
  ].filter(group => group.length > 0);

  const groupOf = new Map<string, string>();
  const offsets = new Map<string, number>();
  const children = groups.map(group => {
    const groupId = group.length > 1 ? `stack:${group[0].id}` : group[0].id;
    let y = 0;
    const ports = group.flatMap(node => {
      groupOf.set(node.id, groupId);
      offsets.set(node.id, y);
      const nodePorts = elkPorts(node, y);
      y += flowNodeHeight(node) + STACK_GAP;
      return nodePorts;
    });
    return {
      id: groupId,
      width: NODE_WIDTH,
      height: y - STACK_GAP,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports,
    };
  });

  const graph = {
    id: 'root',
    layoutOptions,
    children,
    edges: edges
      .filter(edge => groupOf.get(edge.source) !== groupOf.get(edge.target))
      .map(edge => ({
        id: edge.id,
        sources: [`${edge.source}::${edge.sourceHandle}`],
        targets: [`${edge.target}::${edge.targetHandle}`],
      })),
  };

  try {
    const result = await elk.layout(graph);
    const positions = new Map(result.children?.map(child => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]));
    return nodes.map(node => {
      const groupPosition = positions.get(groupOf.get(node.id)!);
      if (!groupPosition) return node;
      return { ...node, position: { x: groupPosition.x, y: groupPosition.y + (offsets.get(node.id) ?? 0) } };
    });
  } catch (error) {
    console.error('CA graph layout failed:', error);
    return nodes;
  }
}

const CaGraphViewInner: React.FC<CaGraphViewProps> = ({ cas, allCryptoEngines, router }) => {
  const { isDarkMode } = useTheme();
  const { fitView } = useReactFlow();
  const graphRef = useRef<HTMLDivElement>(null);
  const [kmsKeys, setKmsKeys] = useState<ApiKmsKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<KeyFlowNode>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [crossSignOnly, setCrossSignOnly] = useState(false);

  useEffect(() => {
    fetchKmsKeys(new URLSearchParams())
      .then(data => setKmsKeys(data.list))
      .catch(error => {
        console.error('Error fetching KMS keys:', error);
        setKmsKeys([]);
      })
      .finally(() => setIsLoadingKeys(false));
  }, []);

  const fullGraph = useMemo(
    () => buildKeyGraph(cas, kmsKeys, allCryptoEngines),
    [cas, kmsKeys, allCryptoEngines],
  );
  const crossSignedKeys = useMemo(() => findCrossSignedKeys(fullGraph), [fullGraph]);
  const graph = useMemo(
    () => (crossSignOnly ? isolateKeys(fullGraph, crossSignedKeys) : fullGraph),
    [fullGraph, crossSignedKeys, crossSignOnly],
  );

  const { oneWay, mutual } = useMemo(() => pairMutualSignatures(graph.signatures), [graph]);
  const stacks = useMemo(() => stackMutualKeys(mutual), [mutual]);

  const mutualSigners = useMemo(() => {
    const titles = new Map(graph.keys.map(key => [key.id, keyTitle(key)]));
    const signers: Record<string, string> = {};
    for (const { forward, backward } of mutual) {
      signers[forward.caId] = titles.get(forward.source) ?? '';
      signers[backward.caId] = titles.get(backward.source) ?? '';
    }
    return signers;
  }, [graph, mutual]);

  const baseEdges = useMemo<Edge[]>(() => {
    const oneWayEdges: Edge[] = oneWay.map(sig => ({
      id: `${sig.source}->${sig.caId}`,
      source: sig.source,
      target: sig.target,
      sourceHandle: 'signs',
      targetHandle: rowHandleId(sig.caId),
      focusable: false,
      markerEnd: SIGNATURE_MARKER,
    }));
    // One vertical line joins the two keys of a mutual cross-sign, upper card to lower card.
    const stackIndex = new Map(stacks.flatMap(stack => stack.map((id, i) => [id, i] as const)));
    const mutualEdges: Edge[] = mutual.map(({ forward, backward }) => {
      const [upper, lower] = (stackIndex.get(forward.source) ?? 0) <= (stackIndex.get(forward.target) ?? 0)
        ? [forward.source, forward.target]
        : [forward.target, forward.source];
      return {
        id: `${backward.caId}<->${forward.caId}`,
        type: 'straight',
        source: upper,
        target: lower,
        sourceHandle: 'mutual-bottom',
        targetHandle: 'mutual-top',
        focusable: false,
        zIndex: 1,
        markerStart: MUTUAL_MARKER,
        markerEnd: MUTUAL_MARKER,
        style: { stroke: MUTUAL_COLOR, strokeWidth: MUTUAL_STROKE_WIDTH },
      };
    });
    return [...oneWayEdges, ...mutualEdges];
  }, [oneWay, mutual, stacks]);

  const hasMutualEdges = baseEdges.some(edge => edge.markerStart);

  const onOpenCa = useCallback(
    (caId: string) => router.push(`/certificate-authorities/details?caId=${caId}`),
    [router],
  );

  useEffect(() => {
    if (isLoadingKeys) return;
    let cancelled = false;
    const flowNodes: KeyFlowNode[] = graph.keys.map(graphKey => ({
      id: graphKey.id,
      type: 'key',
      position: { x: 0, y: 0 },
      data: { graphKey, isCrossSigned: crossSignedKeys.has(graphKey.id), mutualSigners, onOpenCa },
    }));
    layoutNodes(flowNodes, baseEdges, stacks)
      .then(layouted => {
        if (cancelled) return;
        setNodes(layouted);
        window.requestAnimationFrame(() => fitView({ padding: 0.15, duration: 200 }));
      })
      .catch(error => console.error('CA graph layout failed:', error));
    return () => { cancelled = true; };
  }, [graph, baseEdges, stacks, crossSignedKeys, mutualSigners, isLoadingKeys, onOpenCa, setNodes, fitView]);

  // Hovering a key highlights the certificates it signed and the key that signed it.
  const edges = useMemo<Edge[]>(() => {
    if (!activeKeyId) return baseEdges;
    return baseEdges.map(edge => {
      const isActive = edge.source === activeKeyId || edge.target === activeKeyId;
      const strokeWidth = edge.markerStart ? MUTUAL_STROKE_WIDTH : isActive ? 2 : 1;
      return { ...edge, zIndex: isActive ? 1 : 0, style: { ...edge.style, opacity: isActive ? 1 : 0.15, strokeWidth } };
    });
  }, [baseEdges, activeKeyId]);

  const handleFullscreenToggle = useCallback(() => {
    if (!graphRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      graphRef.current.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`));
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => fitView({ padding: 0.15, duration: 200 }), 100);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fitView]);

  const handleDownloadImage = useCallback(async () => {
    const viewport = graphRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!graphRef.current || !viewport) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: getComputedStyle(graphRef.current).backgroundColor,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `ca-key-graph-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error downloading image:', error);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return (
    <div
      ref={graphRef}
      className={cn(
        'relative w-full overflow-hidden rounded-lg border bg-background',
        '[--xy-edge-stroke:var(--color-muted-foreground)]',
        isFullscreen ? 'h-screen' : 'h-[calc(100vh-250px)]',
      )}
    >
      {isLoadingKeys ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeMouseEnter={(_, node) => setActiveKeyId(node.id)}
          onNodeMouseLeave={() => setActiveKeyId(null)}
          nodeTypes={nodeTypes}
          colorMode={isDarkMode ? 'dark' : 'light'}
          nodesConnectable={false}
          elementsSelectable={false}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="bg-background!"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showFitView={false} showInteractive={false} position="bottom-left" />
          <Panel position="top-right" className="flex gap-1">
            <Button
              variant={crossSignOnly ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={crossSignOnly}
              onClick={() => setCrossSignOnly(on => !on)}
              disabled={!crossSignOnly && crossSignedKeys.size === 0}
              title={crossSignOnly ? 'Show all keys' : 'Show only cross-signed keys and the keys that signed them'}
            >
              <GitMerge data-icon="inline-start" />
              Cross-signed
              <span className="tabular-nums text-muted-foreground">{crossSignedKeys.size}</span>
              {crossSignOnly && <X data-icon="inline-end" />}
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => fitView({ padding: 0.15, duration: 200 })} title="Fit to view">
              <LocateFixed />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={handleDownloadImage} disabled={isDownloading} title="Download as PNG">
              {isDownloading ? <Loader2 className="animate-spin" /> : <Download />}
            </Button>
            <Button variant="outline" size="icon-sm" onClick={handleFullscreenToggle} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize /> : <Maximize />}
            </Button>
          </Panel>
          <Panel position="bottom-right" className="max-w-xs rounded-lg border bg-card p-3 text-xs text-muted-foreground shadow-xs">
            <p className="mb-1.5 font-medium text-foreground">How to read this graph</p>
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 size-3.5 shrink-0" />
              <span>Each card is a key. Its rows are the certificates that attest that key.</span>
            </p>
            <p className="mt-1 flex items-start gap-2">
              <svg className="mt-1.5 h-2 w-3.5 shrink-0 overflow-visible" aria-hidden>
                <line x1="0" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 1 L14 4 L10 7 Z" fill="currentColor" />
              </svg>
              <span>Arrows point from the signing key to each certificate it signed. Hover a key to trace it.</span>
            </p>
            {hasMutualEdges && (
              <p className="mt-1 flex items-start gap-2">
                <ArrowDownUp className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>Keys that cross-signed each other are stacked and joined vertically. Marked rows are the cross-certificates.</span>
              </p>
            )}
            {crossSignOnly && (
              <p className="mt-1 flex items-start gap-2">
                <GitMerge className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Showing {crossSignedKeys.size} cross-signed {crossSignedKeys.size === 1 ? 'key' : 'keys'}, whose
                  certificates were signed by more than one key, plus the keys that signed them.
                </span>
              </p>
            )}
          </Panel>
        </ReactFlow>
      )}
    </div>
  );
};

export const CaGraphView: React.FC<CaGraphViewProps> = (props) => (
  <ReactFlowProvider>
    <CaGraphViewInner {...props} />
  </ReactFlowProvider>
);
