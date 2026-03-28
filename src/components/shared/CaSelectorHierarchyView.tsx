
'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Handle,
  Position,
  useNodesInitialized,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Landmark, KeyRound } from 'lucide-react';
import { isPast, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { CryptoEngineViewer } from './CryptoEngineViewer';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_WIDTH = 220;
const NODE_HEIGHT = 68;
const TREE_GAP = 60;

const elk = new ELK();

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectorNodeData extends Record<string, unknown> {
  ca: CA;
  isSelected: boolean;
  onSelect: (ca: CA) => void;
  allCryptoEngines?: ApiCryptoEngine[];
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusVariant = 'active' | 'expired' | 'revoked';

const STATUS_ACCENT: Record<StatusVariant, string> = {
  active: '#10b981',
  expired: '#f97316',
  revoked: '#ef4444',
};

const STATUS_LABEL: Record<StatusVariant, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

const getStatusVariant = (ca: CA): StatusVariant => {
  if (ca.status === 'revoked') return 'revoked';
  if (isPast(parseISO(ca.expires))) return 'expired';
  return 'active';
};

const getExpiryLabel = (ca: CA): string => {
  const expiryDate = parseISO(ca.expires);
  if (ca.status === 'revoked') return 'Revoked';
  if (isPast(expiryDate)) return `Expired ${formatDistanceToNowStrict(expiryDate)} ago`;
  return `Exp. ${formatDistanceToNowStrict(expiryDate)}`;
};

const formatKeyAlgorithm = (raw: string): string =>
  raw
    .replace(/\s*\(\s*/g, ' ')
    .replace(/\s*bit\s*\)/gi, '')
    .replace(/\s*\)\s*/g, '')
    .trim();

// ─── Node component ───────────────────────────────────────────────────────────

const SelectorNode: React.FC<{ data: SelectorNodeData }> = ({ data }) => {
  const { ca, isSelected, onSelect, allCryptoEngines } = data;
  const variant = getStatusVariant(ca);
  const accent = STATUS_ACCENT[variant];
  const expiryLabel = getExpiryLabel(ca);
  const keyLabel = ca.keyAlgorithm ? formatKeyAlgorithm(ca.keyAlgorithm) : null;
  const isRoot = !ca.issuer || ca.issuer === 'Self-signed' || ca.issuer === ca.id;

  let EngineIcon: React.ReactNode = <Landmark className="h-3 w-3" />;
  if (ca.kmsKeyId) {
    const engine = allCryptoEngines?.find((e) => e.id === ca.kmsKeyId);
    if (engine) {
      EngineIcon = <CryptoEngineViewer engine={engine} iconOnly className="h-3 w-3 flex-shrink-0" />;
    } else {
      EngineIcon = <KeyRound className="h-3 w-3" />;
    }
  }

  return (
    <div
      className="select-none"
      style={{ width: NODE_WIDTH, fontFamily: 'inherit', position: 'relative' }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: accent, border: 'none', width: 5, height: 5, opacity: 0.5 }}
      />

      <div
        style={{
          borderRadius: 7,
          border: isSelected ? `2px solid ${accent}` : '1px solid hsl(var(--border))',
          boxShadow: isSelected
            ? `inset 0 3px 0 ${accent}, 0 0 0 3px ${accent}22`
            : `inset 0 3px 0 ${accent}`,
          overflow: 'hidden',
          cursor: 'pointer',
          background: isSelected ? `${accent}08` : 'transparent',
        }}
        onClick={() => onSelect(ca)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(ca)}
      >
        {/* Body */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 9px 6px 9px',
            background: isSelected ? `${accent}06` : 'hsl(var(--card))',
          }}
        >
          <div style={{ flexShrink: 0, color: 'hsl(var(--muted-foreground))' }}>
            {EngineIcon}
          </div>

          <p
            className="flex-1 min-w-0 truncate leading-tight"
            style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))' }}
            title={ca.name}
          >
            {ca.name}
          </p>

          <span
            style={{
              flexShrink: 0,
              fontSize: 9,
              fontWeight: 700,
              color: accent,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {STATUS_LABEL[variant]}
          </span>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 9px',
            borderTop: '1px solid hsl(var(--border))',
            background: isSelected ? `${accent}08` : 'hsl(var(--muted) / 0.4)',
          }}
        >
          <span
            className="flex-1 min-w-0 truncate"
            style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))' }}
            title={expiryLabel}
          >
            {expiryLabel}
          </span>

          {keyLabel && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 9,
                fontFamily: 'monospace',
                padding: '1px 4px',
                borderRadius: 3,
                background: 'hsl(var(--background))',
                color: 'hsl(var(--muted-foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              {keyLabel}
            </span>
          )}

          {isRoot && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 9,
                padding: '1px 4px',
                borderRadius: 3,
                background: 'hsl(var(--background))',
                color: 'hsl(var(--muted-foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              Root
            </span>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: accent, border: 'none', width: 5, height: 5, opacity: 0.5 }}
      />
    </div>
  );
};

const nodeTypes = { selectorNode: SelectorNode };

// ─── ELK layout ───────────────────────────────────────────────────────────────

const elkLayoutSubtree = async (nodes: Node[], edges: Edge[]): Promise<Node[]> => {
  if (nodes.length === 0) return nodes;
  const elkNodes = nodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT }));
  const elkEdges = edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }));
  try {
    const layouted = await elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '20',
        'elk.layered.spacing.nodeNodeBetweenLayers': '44',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      },
      children: elkNodes,
      edges: elkEdges,
    });
    return nodes.map((n) => {
      const en = layouted.children?.find((c) => c.id === n.id);
      return { ...n, position: { x: en?.x ?? 0, y: en?.y ?? 0 } };
    });
  } catch {
    return nodes;
  }
};

const getLayoutedElements = async (
  nodes: Node[],
  edges: Edge[],
  rootIds: string[],
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  if (nodes.length === 0) return { nodes, edges };

  const getSubtreeIds = (rootId: string): Set<string> => {
    const ids = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (ids.has(id)) continue;
      ids.add(id);
      edges.forEach((e) => { if (e.source === id) queue.push(e.target); });
    }
    return ids;
  };

  let xOffset = 0;
  const allPositioned: Node[] = [];

  for (const rootId of rootIds) {
    const ids = getSubtreeIds(rootId);
    const subtreeNodes = nodes.filter((n) => ids.has(n.id));
    const subtreeEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const positioned = await elkLayoutSubtree(subtreeNodes, subtreeEdges);
    const width = Math.max(...positioned.map((n) => n.position.x + NODE_WIDTH), 0);
    positioned.forEach((n) =>
      allPositioned.push({ ...n, position: { x: n.position.x + xOffset, y: n.position.y } }),
    );
    xOffset += width + TREE_GAP;
  }

  return { nodes: allPositioned, edges };
};

// ─── Build elements ───────────────────────────────────────────────────────────

const buildElements = (
  cas: CA[],
  onSelect: (ca: CA) => void,
  currentSelectedCaId?: string | null,
  allCryptoEngines?: ApiCryptoEngine[],
): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const traverse = (ca: CA, parentId: string | null) => {
    nodes.push({
      id: ca.id,
      type: 'selectorNode',
      position: { x: 0, y: 0 },
      data: {
        ca,
        isSelected: ca.id === currentSelectedCaId,
        onSelect,
        allCryptoEngines,
      } satisfies SelectorNodeData,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });

    if (parentId) {
      const variant: StatusVariant =
        ca.status === 'revoked' ? 'revoked' : isPast(parseISO(ca.expires)) ? 'expired' : 'active';
      edges.push({
        id: `${parentId}→${ca.id}`,
        source: parentId,
        target: ca.id,
        type: 'smoothstep',
        style: { stroke: 'hsl(var(--border))', strokeWidth: 1.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'hsl(var(--border))',
          width: 7,
          height: 7,
        },
      });
    }

    for (const child of ca.children ?? []) {
      traverse(child, ca.id);
    }
  };

  for (const root of cas) traverse(root, null);
  return { nodes, edges };
};

// ─── Inner component ──────────────────────────────────────────────────────────

const Inner: React.FC<{
  cas: CA[];
  onSelect: (ca: CA) => void;
  currentSelectedCaId?: string | null;
  allCryptoEngines?: ApiCryptoEngine[];
}> = ({ cas, onSelect, currentSelectedCaId, allCryptoEngines }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SelectorNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const layoutVersionRef = useRef(0);
  const pendingFitRef = useRef(false);

  const stableOnSelect = useCallback(onSelect, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const { nodes: raw, edges: rawEdges } = buildElements(
      cas,
      stableOnSelect,
      currentSelectedCaId,
      allCryptoEngines,
    );
    const rootIds = cas.map((ca) => ca.id);
    const version = ++layoutVersionRef.current;
    pendingFitRef.current = true;

    getLayoutedElements(raw, rawEdges, rootIds).then(({ nodes: ln, edges: le }) => {
      if (layoutVersionRef.current !== version) return;
      setNodes(ln as Node<SelectorNodeData>[]);
      setEdges(le);
    });
  }, [cas, currentSelectedCaId, stableOnSelect, allCryptoEngines, setNodes, setEdges]);

  useEffect(() => {
    if (nodesInitialized && nodes.length > 0 && pendingFitRef.current) {
      pendingFitRef.current = false;
      fitView({ padding: 0.1, duration: 200 });
    }
  }, [nodesInitialized, nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={2}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-20" />
    </ReactFlow>
  );
};

// ─── Public component ─────────────────────────────────────────────────────────

interface CaSelectorHierarchyViewProps {
  cas: CA[];
  onSelect: (ca: CA) => void;
  currentSelectedCaId?: string | null;
  allCryptoEngines?: ApiCryptoEngine[];
}

export const CaSelectorHierarchyView: React.FC<CaSelectorHierarchyViewProps> = (props) => {
  if (props.cas.length === 0) return null;
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
};
