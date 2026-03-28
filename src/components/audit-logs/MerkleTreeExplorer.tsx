'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  Archive,
  ChevronRight,
  Fingerprint,
  Hash,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  fetchCheckpoint,
  fetchEvents,
  fetchInclusionProof,
  type EventLeaf,
  getAuditEventSummaryRows,
  getAuditEventTimestamp,
  type InclusionProofResponse,
} from '@/lib/audit-logs-api';
import { cn } from '@/lib/utils';

const MAX_BATCH_SIZE = 100;
const ROOT_NODE_WIDTH = 200;
const COLLAPSED_NODE_WIDTH = 160;
const LEAF_NODE_WIDTH = 220;
const INTERNAL_NODE_WIDTH = 22;
const ROOT_Y = -36;
const ROOT_CHILD_GAP = 156;
const LEAF_X_GAP = 260;
const TREE_LEVEL_GAP = 108;
type RootNodeData = {
  empty: boolean;
  onPath: boolean;
  proofVerified: boolean | null;
  proofHash?: string;
  rootHash: string;
  start: number;
  end: number;
  treeSize: number;
};

type CollapsedNodeData = {
  buttonLabel: string;
  onPath: boolean;
  isLoading: boolean;
  onExpand: () => void;
  proofHash?: string;
  start: number;
  end: number;
};

type LeafNodeData = {
  isNew: boolean;
  isSelected: boolean;
  isTampered: boolean;
  leaf: EventLeaf;
  onProof: (leaf: EventLeaf) => void;
  proofHash?: string;
  proofLoading: boolean;
};

type InternalNodeData = {
  onPath: boolean;
  proofHash?: string;
  start: number;
  end: number;
};

type ExplorerNodeData = RootNodeData | CollapsedNodeData | LeafNodeData | InternalNodeData;

type TreeNodeKind = 'collapsed' | 'internal' | 'leaf' | 'root';

interface TreeNodeModel {
  end: number;
  id: string;
  kind: TreeNodeKind;
  leaf?: EventLeaf;
  left?: TreeNodeModel;
  onPath?: boolean;
  proofHash?: string;
  right?: TreeNodeModel;
  start: number;
  x?: number;
  y?: number;
}

function shortHash(hash: string) {
  if (!hash) return '';
  if (hash.length <= 8) return hash;
  return `${hash.slice(0, 8)}...`;
}

function formatLocalTimestamp(timestamp?: string) {
  if (!timestamp) return 'Server timestamp';
  return new Date(timestamp).toLocaleString();
}

function isServerUnavailable(message: string | null) {
  return Boolean(message && message.includes('HTTP 500'));
}

function dedupeLeaves(leaves: EventLeaf[]) {
  const byIndex = new Map<number, EventLeaf>();
  leaves.forEach((leaf) => byIndex.set(leaf.index, leaf));
  return Array.from(byIndex.values()).sort((left, right) => left.index - right.index);
}

function isValidProofResponse(proof: InclusionProofResponse | undefined): proof is InclusionProofResponse {
  return Boolean(
    proof &&
    typeof proof.leaf_index === 'number' &&
    Array.isArray(proof.merkle_path) &&
    typeof proof.root_hash === 'string',
  );
}

function stopFlowEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function ProofBubble({ hash }: { hash?: string }) {
  if (!hash) return null;

  return (
    <div className="mt-2 inline-flex max-w-full items-center rounded-sm border border-border bg-muted px-2.5 py-1.5 animate-in fade-in-0 slide-in-from-top-2 duration-300">
      <span className="truncate font-mono text-xs text-muted-foreground">{shortHash(hash)}</span>
    </div>
  );
}

function NodeHashText({ hash }: { hash?: string }) {
  if (!hash) {
    return <span className="text-[11px] text-muted-foreground">Hash unavailable</span>;
  }

  return <span className="font-mono text-[11px] text-muted-foreground">{shortHash(hash)}</span>;
}

function largestPowerOfTwoLessThan(size: number) {
  let power = 1;

  while ((power << 1) < size) {
    power <<= 1;
  }

  return power;
}

function getNodeWidth(kind: TreeNodeKind) {
  if (kind === 'root') return ROOT_NODE_WIDTH;
  if (kind === 'collapsed') return COLLAPSED_NODE_WIDTH;
  if (kind === 'leaf') return LEAF_NODE_WIDTH;
  return INTERNAL_NODE_WIDTH;
}

function LeafCardContent({
  isNew,
  isSelected,
  isTampered,
  leaf,
  onProof,
  proofHash,
  proofLoading,
}: LeafNodeData) {
  const accent = isTampered ? '#ef4444' : isSelected ? '#3b82f6' : '#10b981';
  const summaryRows = getAuditEventSummaryRows(leaf.event).map((row) => (
    row.label === 'time'
      ? { ...row, value: formatLocalTimestamp(getAuditEventTimestamp(leaf.event)) }
      : row
  ));

  return (
    <div
      className={cn('nodrag nopan', isNew && 'animate-in slide-in-from-right-8 duration-500')}
      style={{
        borderRadius: 8,
        border: `1px solid ${isTampered ? 'rgba(239,68,68,0.3)' : 'hsl(var(--border))'}`,
        boxShadow: `inset 0 3px 0 ${accent}`,
        outline: isSelected ? '2px solid rgba(59,130,246,0.25)' : 'none',
        outlineOffset: 2,
        overflow: 'hidden',
      }}
      onClick={stopFlowEvent}
      onMouseDown={stopFlowEvent}
      onPointerDown={stopFlowEvent}
    >
      {/* Body */}
      <div style={{ padding: '10px 10px 8px 10px', background: 'hsl(var(--card))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: accent, opacity: 0.7 }}>#</span>
              <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase' }}>
                leaf {leaf.index}
              </span>
              {isNew && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 ml-1">new</Badge>}
            </div>
            <Badge variant="secondary" className="font-mono text-[11px]">{leaf.event.type}</Badge>
          </div>
          <Button
            variant={isSelected ? 'default' : 'ghost'}
            size="sm"
            className="nodrag nopan h-7 shrink-0 text-[11px] px-2"
            disabled={proofLoading}
            onClick={(event) => { stopFlowEvent(event); onProof(leaf); }}
            onMouseDown={stopFlowEvent}
            onPointerDown={stopFlowEvent}
          >
            {proofLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Proof'}
          </Button>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {summaryRows.map(({ label, mono, value }) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', opacity: 0.6 }}>{label}</span>
              <span className="truncate" style={{ fontSize: 11, fontFamily: mono ? 'monospace' : 'inherit' }} title={value}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Footer hash strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
        borderTop: `1px solid ${isTampered ? 'rgba(239,68,68,0.2)' : 'hsl(var(--border))'}`,
        background: isTampered ? 'rgba(239,68,68,0.06)' : 'hsl(var(--muted) / 0.4)',
      }}>
        {isTampered
          ? <ShieldAlert style={{ width: 12, height: 12, color: '#ef4444', flexShrink: 0 }} />
          : <Hash style={{ width: 12, height: 12, color: accent, opacity: 0.5, flexShrink: 0 }} />
        }
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'hsl(var(--muted-foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortHash(leaf.leaf_hash)}
        </span>
        {isTampered && (
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#ef4444', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Tampered
          </span>
        )}
      </div>
      <ProofBubble hash={proofHash} />
    </div>
  );
}

function RootNode({ data }: NodeProps<Node<RootNodeData>>) {
  const accent = data.proofVerified === false ? '#ef4444' : '#a855f7';
  const statusColor = data.proofVerified === true ? '#10b981' : data.proofVerified === false ? '#ef4444' : null;
  return (
    <div style={{ width: ROOT_NODE_WIDTH }} className="select-none">
      <div
        style={{
          borderRadius: 8,
          border: '1px solid hsl(var(--border))',
          boxShadow: `inset 0 3px 0 ${accent}`,
          overflow: 'hidden',
        }}
      >
        {/* Body */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 8px 10px', background: 'hsl(var(--card))' }}>
          <Fingerprint style={{ width: 14, height: 14, color: accent, flexShrink: 0 }} />
          <p style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))', margin: 0 }}>
            Merkle Root
          </p>
          {statusColor && (
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: statusColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {data.proofVerified ? 'Verified' : 'Tamper'}
            </span>
          )}
        </div>
        {data.empty && (
          <div style={{ padding: '0 10px 10px 10px', background: 'hsl(var(--card))' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>No events yet</p>
          </div>
        )}
        {/* Footer strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--muted) / 0.4)' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 10, color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortHash(data.rootHash)}
          </span>
          <span style={{ flexShrink: 0, fontSize: 10, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4, background: 'hsl(var(--background))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }}>
            {data.empty ? 'empty' : `${data.treeSize.toLocaleString()} entries`}
          </span>
        </div>
      </div>
      <ProofBubble hash={data.proofHash} />
      <Handle type="source" position={Position.Bottom} style={{ background: accent, border: 'none', width: 6, height: 6, opacity: 0.6 }} />
    </div>
  );
}

function CollapsedNode({ data }: NodeProps<Node<CollapsedNodeData>>) {
  const accent = data.onPath ? '#a855f7' : '#94a3b8';
  return (
    <div style={{ width: COLLAPSED_NODE_WIDTH }} className="select-none">
      <Handle type="target" position={Position.Top} style={{ background: accent, border: 'none', width: 6, height: 6, opacity: 0.5 }} />
      <div
        style={{
          borderRadius: 8,
          border: '1px solid hsl(var(--border))',
          borderStyle: 'dashed',
          boxShadow: `inset 0 3px 0 ${accent}`,
          overflow: 'hidden',
        }}
      >
        {/* Body */}
        <div
          className="nodrag nopan"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 8px 10px', background: 'hsl(var(--card))' }}
          onClick={stopFlowEvent}
          onMouseDown={stopFlowEvent}
          onPointerDown={stopFlowEvent}
        >
          <Archive style={{ width: 14, height: 14, color: accent, flexShrink: 0 }} />
          <p style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))', margin: 0 }}>
            Archived
          </p>
          <span style={{ flexShrink: 0, fontFamily: 'monospace', fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
            [{data.start}..{data.end}]
          </span>
        </div>
        {/* Footer with expand */}
        <div
          className="nodrag nopan"
          style={{ padding: '5px 8px', borderTop: '1px solid hsl(var(--border))', background: 'hsl(var(--muted) / 0.4)' }}
          onClick={stopFlowEvent}
          onMouseDown={stopFlowEvent}
          onPointerDown={stopFlowEvent}
        >
          <Button
            variant="ghost"
            size="sm"
            className="nodrag nopan h-6 w-full text-[11px]"
            disabled={data.isLoading}
            onClick={(event) => { stopFlowEvent(event); data.onExpand(); }}
            onMouseDown={stopFlowEvent}
            onPointerDown={stopFlowEvent}
          >
            {data.isLoading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            {data.buttonLabel}
          </Button>
        </div>
      </div>
      <ProofBubble hash={data.proofHash} />
    </div>
  );
}

function LeafNode({ data }: NodeProps<Node<LeafNodeData>>) {
  const accent = data.isTampered ? '#ef4444' : data.isSelected ? '#3b82f6' : '#10b981';
  return (
    <div style={{ width: LEAF_NODE_WIDTH }} className="select-none">
      <Handle type="target" position={Position.Top} style={{ background: accent, border: 'none', width: 6, height: 6, opacity: 0.6 }} />
      <LeafCardContent {...data} />
    </div>
  );
}

function InternalNode({ data }: NodeProps<Node<InternalNodeData>>) {
  const accent = data.onPath ? '#a855f7' : '#64748b';
  return (
    <div style={{ width: 132 }} className="select-none">
      <Handle type="target" position={Position.Top} style={{ background: accent, border: 'none', width: 6, height: 6, opacity: 0.5 }} />
      <div
        style={{
          borderRadius: 6,
          border: '1px solid hsl(var(--border))',
          boxShadow: `inset 0 2px 0 ${accent}`,
          overflow: 'hidden',
          background: 'hsl(var(--card))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px' }}>
          <Hash style={{ width: 11, height: 11, color: accent, flexShrink: 0 }} />
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {data.proofHash ? shortHash(data.proofHash) : '—'}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: accent, border: 'none', width: 6, height: 6, opacity: 0.5 }} />
    </div>
  );
}

const nodeTypes = {
  collapsed: CollapsedNode,
  internal: InternalNode,
  leaf: LeafNode,
  root: RootNode,
};

function ExplorerTree({
  edges,
  nodes,
}: {
  edges: Edge[];
  nodes: Node<ExplorerNodeData>[];
}) {
  const { fitView } = useReactFlow();
  const handleNodeClick = useCallback(() => {
    // Keep node pointer events enabled so buttons inside custom nodes remain interactive.
  }, []);

  useEffect(() => {
    if (nodes.length === 0) return;
    fitView({ duration: 250, padding: 0.12 });
  }, [fitView, nodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      onNodeClick={handleNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} className="opacity-20" />
    </ReactFlow>
  );
}

export function MerkleTreeExplorer({ refreshToken = 0 }: { refreshToken?: number }) {
  const isMobile = useIsMobile();
  const treeSizeRef = useRef(0);
  const proofFetchesRef = useRef(new Set<number>());
  const [showTree, setShowTree] = useState(false);

  const [checkpoint, setCheckpoint] = useState<{ root_hash: string; tree_size: number } | null>(null);
  const [expandedOlderLeaves, setExpandedOlderLeaves] = useState<EventLeaf[]>([]);
  const [proofCache, setProofCache] = useState<Record<number, InclusionProofResponse>>({});
  const [recentLeaves, setRecentLeaves] = useState<EventLeaf[]>([]);
  const [selectedProof, setSelectedProof] = useState<InclusionProofResponse | null>(null);
  const [loadingProofIndex, setLoadingProofIndex] = useState<number | null>(null);
  const [newLeafIndices, setNewLeafIndices] = useState<Set<number>>(new Set());
  const [tamperedLeafIndices, setTamperedLeafIndices] = useState<Set<number>>(new Set());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isMobile === true) {
      setShowTree(false);
      return;
    }
    if (isMobile === false) {
      setShowTree(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (newLeafIndices.size === 0) return undefined;
    const timer = window.setTimeout(() => {
      setNewLeafIndices(new Set());
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [newLeafIndices]);

  const loadTree = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);
    setActionError(null);

    const previousTreeSize = treeSizeRef.current;

    try {
      const nextCheckpoint = await fetchCheckpoint();
      const nextRecentStart = Math.max(nextCheckpoint.tree_size - MAX_BATCH_SIZE, 0);
      const nextRecentResponse = nextCheckpoint.tree_size === 0
        ? { events: [] as EventLeaf[] }
        : await fetchEvents(nextRecentStart, MAX_BATCH_SIZE);

      const grew = nextCheckpoint.tree_size > previousTreeSize;
      treeSizeRef.current = nextCheckpoint.tree_size;

      setCheckpoint(nextCheckpoint);
      setProofCache({});
      proofFetchesRef.current.clear();
      setRecentLeaves(nextRecentResponse.events);
      setExpandedOlderLeaves((current) =>
        current.filter((leaf) => leaf.index < nextRecentStart),
      );
      setLastUpdatedAt(new Date());

      if (grew) {
        setNewLeafIndices(
          new Set(
            nextRecentResponse.events
              .filter((leaf) => leaf.index >= previousTreeSize)
              .map((leaf) => leaf.index),
          ),
        );
        setSelectedProof(null);
        setTamperedLeafIndices(new Set());
      } else if (!isManualRefresh) {
        setNewLeafIndices(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Merkle tree');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTree(false);
  }, [loadTree, refreshToken]);

  const recentStartIndex = checkpoint ? Math.max(checkpoint.tree_size - MAX_BATCH_SIZE, 0) : 0;
  const olderEntryCount = recentStartIndex;
  const olderLoadedCount = expandedOlderLeaves.length;
  const olderRemainingStart = olderLoadedCount;
  const olderRemainingEnd = olderEntryCount - 1;
  const hasCollapsedOlder = olderRemainingStart <= olderRemainingEnd;

  const leaves = useMemo(
    () => dedupeLeaves([...expandedOlderLeaves, ...recentLeaves]),
    [expandedOlderLeaves, recentLeaves],
  );

  useEffect(() => {
    if (!checkpoint || leaves.length === 0) return undefined;

    const missingLeafIndices = leaves
      .map((leaf) => leaf.index)
      .filter((index) => !proofCache[index] && !proofFetchesRef.current.has(index));

    if (missingLeafIndices.length === 0) return undefined;

    let cancelled = false;
    const concurrency = 6;

    missingLeafIndices.forEach((index) => proofFetchesRef.current.add(index));

    const worker = async () => {
      while (missingLeafIndices.length > 0 && !cancelled) {
        const index = missingLeafIndices.shift();
        if (index === undefined) return;

        try {
          const proof = await fetchInclusionProof(index);

          if (!cancelled && isValidProofResponse(proof)) {
            setProofCache((current) => ({ ...current, [index]: proof }));
          }
        } catch {
          // Leave the node as unavailable when the proof cannot be fetched in the background.
        } finally {
          proofFetchesRef.current.delete(index);
        }
      }
    };

    void Promise.all(Array.from({ length: Math.min(concurrency, missingLeafIndices.length) }, worker));

    return () => {
      cancelled = true;
    };
  }, [checkpoint, leaves, proofCache]);

  const handleExpandOlder = useCallback(async () => {
    if (!checkpoint || isLoadingOlder || !hasCollapsedOlder) return;

    setIsLoadingOlder(true);
    setActionError(null);

    try {
      const remaining = olderEntryCount - expandedOlderLeaves.length;
      const limit = Math.min(MAX_BATCH_SIZE, remaining);
      const response = await fetchEvents(expandedOlderLeaves.length, limit);

      setExpandedOlderLeaves((current) => dedupeLeaves([...current, ...response.events]));
      setLastUpdatedAt(new Date());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to expand subtree');
    } finally {
      setIsLoadingOlder(false);
    }
  }, [checkpoint, expandedOlderLeaves, hasCollapsedOlder, isLoadingOlder, olderEntryCount]);

  const handleProof = useCallback(async (leaf: EventLeaf) => {
    setLoadingProofIndex(leaf.index);
    setActionError(null);

    try {
      const proof = await fetchInclusionProof(leaf.index);
      setProofCache((current) => ({ ...current, [leaf.index]: proof }));
      setSelectedProof(proof);
      setTamperedLeafIndices((current) => {
        const next = new Set(current);
        if (proof.verified) {
          next.delete(leaf.index);
        } else {
          next.add(leaf.index);
        }
        return next;
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to load proof for leaf ${leaf.index}`);
    } finally {
      setLoadingProofIndex(null);
    }
  }, []);

  const flowElements = useMemo(() => {
    if (!checkpoint || checkpoint.tree_size === 0) {
      return {
        edges: [] as Edge[],
        maxDepth: 0,
        nodes: [
          {
            id: 'root',
            type: 'root',
            position: { x: 0, y: ROOT_Y },
            data: {
              empty: true,
              end: 0,
              onPath: false,
              proofHash: undefined,
              proofVerified: selectedProof ? selectedProof.verified : null,
              rootHash: checkpoint?.root_hash ?? '',
              start: 0,
              treeSize: 0,
            },
          },
        ] as Node<ExplorerNodeData>[],
      };
    }

    const leafByIndex = new Map(leaves.map((leaf) => [leaf.index, leaf]));
    const unloadedStart = expandedOlderLeaves.length;
    const unloadedEnd = recentStartIndex;

    const buildTree = (start: number, end: number, kind: TreeNodeKind = 'internal'): TreeNodeModel => {
      const fullyUnloaded = start >= unloadedStart && end <= unloadedEnd && start < end;

      if (fullyUnloaded) {
        return {
          end,
          id: `collapsed-${start}-${end}`,
          kind: 'collapsed',
          start,
        };
      }

      if (end - start === 1) {
        const leaf = leafByIndex.get(start);

        if (leaf) {
          return {
            end,
            id: `leaf-${start}`,
            kind: 'leaf',
            leaf,
            start,
          };
        }

        return {
          end,
          id: `collapsed-${start}-${end}`,
          kind: 'collapsed',
          start,
        };
      }

      const split = largestPowerOfTwoLessThan(end - start);
      const left = buildTree(start, start + split, 'internal');
      const right = buildTree(start + split, end, 'internal');

      return {
        end,
        id: kind === 'root' ? 'root' : `internal-${start}-${end}`,
        kind,
        left,
        right,
        start,
      };
    };

    const root = buildTree(0, checkpoint.tree_size, 'root');
    let maxDepth = 0;
    let terminalIndex = 0;

    const assignLayout = (node: TreeNodeModel, depth: number): number => {
      node.y = depth === 0 ? ROOT_Y : ROOT_CHILD_GAP + ((depth - 1) * TREE_LEVEL_GAP);
      maxDepth = Math.max(maxDepth, depth);

      if (node.kind === 'leaf' || node.kind === 'collapsed') {
        node.x = terminalIndex * LEAF_X_GAP;
        terminalIndex += 1;
        return node.x;
      }

      const childCenters = [node.left, node.right]
        .filter((child): child is TreeNodeModel => Boolean(child))
        .map((child) => assignLayout(child, depth + 1));

      node.x = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length;
      return node.x;
    };

    assignLayout(root, 0);

    const annotateProofHashes = (node: TreeNodeModel, proof: InclusionProofResponse, highlightPath: boolean): number | null => {
      if (proof.leaf_index < node.start || proof.leaf_index >= node.end) return null;

      if (highlightPath) {
        node.onPath = true;
      }

      if (node.kind === 'leaf') {
        return 0;
      }

      const childOnLeft = Boolean(node.left && proof.leaf_index >= node.left.start && proof.leaf_index < node.left.end);
      const activeChild = childOnLeft ? node.left : node.right;
      const siblingChild = childOnLeft ? node.right : node.left;
      const childLevel = activeChild ? annotateProofHashes(activeChild, proof, highlightPath) : null;

      if (childLevel !== null && siblingChild) {
        const siblingHash = proof.merkle_path.find((step) => step.level === childLevel)?.sibling_hash;
        if (siblingHash) {
          siblingChild.proofHash = siblingHash;
        }
      }

      return childLevel === null ? null : childLevel + 1;
    };

    Object.values(proofCache).forEach((proof) => {
      annotateProofHashes(root, proof, false);
    });

    if (selectedProof) {
      annotateProofHashes(root, selectedProof, true);
    }

    const nodes: Node<ExplorerNodeData>[] = [];
    const edges: Edge[] = [];
    const proofStroke = selectedProof
      ? selectedProof.verified
        ? 'hsl(var(--primary))'
        : 'hsl(var(--destructive))'
      : null;

    const visit = (node: TreeNodeModel) => {
      const width = getNodeWidth(node.kind);
      const position = {
        x: (node.x ?? 0) - (width / 2),
        y: node.y ?? 0,
      };

      if (node.kind === 'root') {
        nodes.push({
          id: node.id,
          type: 'root',
          position,
          data: {
            empty: checkpoint.tree_size === 0,
            end: node.end,
            onPath: Boolean(node.onPath),
            proofHash: node.proofHash,
            proofVerified: selectedProof ? selectedProof.verified : null,
            rootHash: checkpoint.root_hash,
            start: node.start,
            treeSize: checkpoint.tree_size,
          },
        });
      } else if (node.kind === 'internal') {
        nodes.push({
          id: node.id,
          type: 'internal',
          position,
          data: {
            end: node.end,
            onPath: Boolean(node.onPath),
            proofHash: node.proofHash,
            start: node.start,
          },
        });
      } else if (node.kind === 'collapsed') {
        nodes.push({
          id: node.id,
          type: 'collapsed',
          position,
          data: {
            buttonLabel: expandedOlderLeaves.length === 0 ? 'Expand' : 'Load next 100',
            end: node.end - 1,
            onPath: Boolean(node.onPath),
            isLoading: isLoadingOlder,
            onExpand: handleExpandOlder,
            proofHash: node.proofHash,
            start: node.start,
          },
        });
      } else if (node.leaf) {
        nodes.push({
          id: node.id,
          type: 'leaf',
          position,
          data: {
            isNew: newLeafIndices.has(node.leaf.index),
            isSelected: selectedProof?.leaf_index === node.leaf.index,
            isTampered: tamperedLeafIndices.has(node.leaf.index),
            leaf: node.leaf,
            onProof: handleProof,
            proofHash: node.proofHash,
            proofLoading: loadingProofIndex === node.leaf.index,
          },
        });
      }

      [node.left, node.right]
        .filter((child): child is TreeNodeModel => Boolean(child))
        .forEach((child) => {
          edges.push({
            id: `${node.id}->${child.id}`,
            source: node.id,
            target: child.id,
            type: 'smoothstep',
            animated: Boolean(child.onPath && selectedProof),
            style: child.onPath && proofStroke
              ? {
                  stroke: proofStroke,
                  strokeWidth: 2,
                }
              : {
                  stroke: child.kind === 'collapsed' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--border))',
                  strokeDasharray: child.kind === 'collapsed' ? '6 6' : undefined,
                  strokeWidth: 1.25,
                },
          });

          visit(child);
        });
    };

    visit(root);

    return { edges, maxDepth, nodes };
  }, [
    checkpoint,
    expandedOlderLeaves.length,
    handleExpandOlder,
    handleProof,
    isLoadingOlder,
    leaves,
    loadingProofIndex,
    newLeafIndices,
    recentStartIndex,
    selectedProof,
    tamperedLeafIndices,
  ]);

  const lastUpdatedLabel = lastUpdatedAt ? lastUpdatedAt.toLocaleString() : 'Waiting for data';
  const flowHeight = Math.max(680, ((flowElements.maxDepth ?? 0) + 1) * TREE_LEVEL_GAP + 180);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-[220px] items-center justify-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading Merkle tree...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{isServerUnavailable(error) ? 'Log unavailable' : 'Unable to load Merkle tree'}</AlertTitle>
        <AlertDescription className="mt-2 flex flex-wrap items-center gap-3">
          <span>{isServerUnavailable(error) ? 'The audit log service returned an internal error.' : error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadTree(false)}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Tree size</p>
              <p className="mt-1 text-lg font-semibold">{checkpoint?.tree_size.toLocaleString() ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Root hash</p>
              <p className="mt-1 font-mono text-sm">{shortHash(checkpoint?.root_hash ?? '')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last updated</p>
              <p className="mt-1 text-sm">{lastUpdatedLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isMobile && (
              <Button variant="outline" size="sm" onClick={() => setShowTree((current) => !current)}>
                {showTree ? 'Hide tree' : 'Show tree'}
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={isRefreshing} onClick={() => void loadTree(true)}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {actionError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {isMobile && !showTree ? (
        <div className="space-y-3">
          {checkpoint?.tree_size === 0 && (
            <div className="rounded-md border bg-card p-4 shadow-sm">
              <p className="text-sm font-medium">Root</p>
              <p className="mt-2 text-sm text-muted-foreground">No events yet</p>
            </div>
          )}

          {expandedOlderLeaves.map((leaf) => (
            <LeafCardContent
              key={leaf.index}
              isNew={newLeafIndices.has(leaf.index)}
              isSelected={selectedProof?.leaf_index === leaf.index}
              isTampered={tamperedLeafIndices.has(leaf.index)}
              leaf={leaf}
              onProof={handleProof}
              proofLoading={loadingProofIndex === leaf.index}
            />
          ))}

          {hasCollapsedOlder && (
            <div className="rounded-md border border-dashed border-border bg-muted/40 p-4">
              <p className="text-sm font-medium">
                Entries {olderRemainingStart}-{olderRemainingEnd}
              </p>
              <Button variant="outline" size="sm" className="mt-3" disabled={isLoadingOlder} onClick={handleExpandOlder}>
                {isLoadingOlder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {expandedOlderLeaves.length === 0 ? 'Expand' : 'Load next 100'}
              </Button>
            </div>
          )}

          {recentLeaves.map((leaf) => (
            <LeafCardContent
              key={leaf.index}
              isNew={newLeafIndices.has(leaf.index)}
              isSelected={selectedProof?.leaf_index === leaf.index}
              isTampered={tamperedLeafIndices.has(leaf.index)}
              leaf={leaf}
              onProof={handleProof}
              proofLoading={loadingProofIndex === leaf.index}
            />
          ))}

          {selectedProof && (
            <div className="rounded-md border bg-card p-4 shadow-sm animate-in fade-in-0 slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Proof path</p>
                <Badge variant={selectedProof.verified ? 'default' : 'destructive'} className="gap-1">
                  {selectedProof.verified ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                  {selectedProof.verified ? 'verified' : 'tamper detected'}
                </Badge>
              </div>
              <div className="mt-3 space-y-2">
                {[...selectedProof.merkle_path]
                  .sort((left, right) => right.level - left.level)
                  .map((step) => (
                    <div key={step.level} className="rounded-sm border border-border bg-muted px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Level {step.level}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{shortHash(step.sibling_hash)}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border bg-card" style={{ height: flowHeight }}>
          <ReactFlowProvider>
            <ExplorerTree nodes={flowElements.nodes} edges={flowElements.edges} />
          </ReactFlowProvider>
        </div>
      )}

      {leaves.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ChevronRight className="h-3.5 w-3.5" />
          <span>{leaves.length} loaded leaves in view</span>
        </div>
      )}
    </div>
  );
}
