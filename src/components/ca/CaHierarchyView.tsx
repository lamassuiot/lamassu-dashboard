'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  MarkerType,
  Position,
  useNodesState,
} from '@xyflow/react';
import { Network } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CaFlowCanvas } from './CaFlowCanvas';
import { CaCard, CA_CARD_HEIGHT, CA_CARD_WIDTH } from './CaCard';
import { layoutTree } from './ca-tree-layout';

interface CaHierarchyViewProps {
  cas: CA[];
  allCryptoEngines: ApiCryptoEngine[];
  router: ReturnType<typeof import('@/lib/router').useRouter>;
}

const TREE_LAYOUT = { nodeWidth: CA_CARD_WIDTH, nodeHeight: CA_CARD_HEIGHT, gapX: 32, gapY: 72, rootGapX: 96 };
const ARROW = { type: MarkerType.ArrowClosed, width: 16, height: 16 };

interface CaNodeData extends Record<string, unknown> {
  ca: CA;
  engine?: ApiCryptoEngine;
  onOpenCa: (caId: string) => void;
}

type CaFlowNode = Node<CaNodeData, 'ca'>;

const CaNode = ({ data }: NodeProps<CaFlowNode>) => {
  const { ca, engine, onOpenCa } = data;

  return (
    <CaCard ca={ca} engine={engine} onClick={() => onOpenCa(ca.id)}>
      <Handle type="target" position={Position.Top} className="opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="opacity-0" isConnectable={false} />
    </CaCard>
  );
};

const nodeTypes = { ca: CaNode };

function flattenCas(cas: CA[], parentId?: string, out: { ca: CA; parentId?: string }[] = []) {
  for (const ca of cas) {
    out.push({ ca, parentId });
    flattenCas(ca.children ?? [], ca.id, out);
  }
  return out;
}

export const CaHierarchyView: React.FC<CaHierarchyViewProps> = ({ cas, allCryptoEngines, router }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<CaFlowNode>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const onOpenCa = useCallback(
    (caId: string) => router.push(`/certificate-authorities/details?caId=${caId}`),
    [router],
  );

  const entries = useMemo(() => flattenCas(cas), [cas]);
  const positions = useMemo(() => layoutTree(cas, TREE_LAYOUT), [cas]);

  const edges = useMemo<Edge[]>(
    () => entries
      .filter(entry => entry.parentId)
      .map(({ ca, parentId }) => ({
        id: `${parentId}->${ca.id}`,
        type: 'smoothstep',
        source: parentId!,
        target: ca.id,
        focusable: false,
        markerEnd: ARROW,
      })),
    [entries],
  );

  useEffect(() => {
    const enginesById = new Map(allCryptoEngines.map(engine => [engine.id, engine]));
    setNodes(entries.map(({ ca }) => ({
      id: ca.id,
      type: 'ca',
      position: positions.get(ca.id) ?? { x: 0, y: 0 },
      data: { ca, engine: ca.kmsKeyId ? enginesById.get(ca.kmsKeyId) : undefined, onOpenCa },
    })));
    setLayoutVersion(version => version + 1);
  }, [entries, positions, allCryptoEngines, onOpenCa, setNodes]);

  return (
    <CaFlowCanvas
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      fitSignal={layoutVersion || null}
      downloadName="ca-hierarchy"
      legend={
        <>
          <p className="mb-1.5 font-medium text-foreground">How to read this hierarchy</p>
          <p className="flex items-start gap-2">
            <Network className="mt-0.5 size-3.5 shrink-0" />
            <span>Each card is a certification authority. Click one to open it.</span>
          </p>
          <p className="mt-1 flex items-start gap-2">
            <svg className="mt-1.5 h-2 w-3.5 shrink-0 overflow-visible" aria-hidden>
              <line x1="0" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 1 L14 4 L10 7 Z" fill="currentColor" />
            </svg>
            <span>Arrows point from an issuer to the CAs it issued. Hover a CA to trace its connections.</span>
          </p>
        </>
      }
    />
  );
};
