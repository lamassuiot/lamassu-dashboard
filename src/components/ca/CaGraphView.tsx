
'use client';

import React, { useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, Landmark, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import dagre from '@dagrejs/dagre';
import { isPast, parseISO } from 'date-fns';
import { Badge } from "@/components/ui/badge";

interface CaGraphViewProps {
  cas: CA[];
  allCryptoEngines: ApiCryptoEngine[];
  router: ReturnType<typeof import('next/navigation').useRouter>;
}

const NODE_WIDTH = 350;
const NODE_HEIGHT = 60;

const GraphNodeComponent = ({ node, allCryptoEngines }: { node: dagre.Node & { data: CA }; allCryptoEngines: ApiCryptoEngine[] }) => {
  const ca = node.data;

  if (!ca) {
    return (
      <div className="w-full h-full bg-destructive/20 border border-destructive rounded-lg flex items-center justify-center">
        <p className="text-destructive-foreground">Error: Node data missing</p>
      </div>
    );
  }

  const isExpired = isPast(parseISO(ca.expires));
  const status = isExpired ? 'expired' : ca.status;

  let statusIcon: React.ReactNode;
  let nodeBgColor = 'bg-blue-50 dark:bg-blue-900/40';
  let iconBgColor = 'bg-blue-100 dark:bg-blue-800/50';
  let titleColor = 'text-blue-800 dark:text-blue-200';
  let subtextColor = 'text-gray-500 dark:text-gray-400';
  let borderColor = 'border-blue-300';

  switch (status) {
    case 'active':
      statusIcon = <CheckCircle className="h-5 w-5 text-green-500" />;
      break;
    case 'expired':
      statusIcon = <AlertTriangle className="h-5 w-5 text-orange-500" />;
      nodeBgColor = 'bg-orange-50 dark:bg-orange-900/40';
      iconBgColor = 'bg-orange-100 dark:bg-orange-800/50';
      titleColor = 'text-orange-800 dark:text-orange-200';
      subtextColor = 'text-orange-600 dark:text-orange-300';
      borderColor = 'border-orange-300';
      break;
    case 'revoked':
      statusIcon = <XCircle className="h-5 w-5 text-red-500" />;
      nodeBgColor = 'bg-red-50 dark:bg-red-900/40';
      iconBgColor = 'bg-red-100 dark:bg-red-800/50';
      titleColor = 'text-red-800 dark:text-red-200';
      subtextColor = 'text-red-600 dark:text-red-300';
      borderColor = 'border-red-300';
      break;
  }

  let IconComponent: React.ReactNode;
  const engine = ca.kmsKeyId ? allCryptoEngines.find(e => e.id === ca.kmsKeyId) : undefined;

  if (engine) {
    IconComponent = <CryptoEngineViewer engine={engine} iconOnly />;
  } else {
    IconComponent = <Landmark className={cn('h-6 w-6', titleColor)} />;
  }

  return (
    <div
      className={cn(
        'rounded-lg p-2 flex items-center gap-3 w-full h-full shadow-md border',
        nodeBgColor,
        borderColor
      )}
    >
      <div className={cn('p-2 rounded-full flex-shrink-0', iconBgColor)}>
        {IconComponent}
      </div>
      <div className="flex-grow min-w-0">
        <p className={cn('font-semibold truncate', titleColor)}>
        {ca.name}
        &nbsp;
        {(ca.keyAlgorithm.toUpperCase().startsWith("ML-DSA") || ca.rawApiData?.metadata["lamassu.io/certificate/chameleon"]) && (
          <Badge className="text-xs">PQC</Badge>
        )}
        &nbsp;
        {ca.rawApiData?.metadata["lamassu.io/certificate/chameleon"] && (
          <Badge className="text-xs">HYBRID</Badge>
        )}
        </p>
        <p className={cn('text-xs font-mono truncate', subtextColor)}>ID: {ca.id.substring(0, 8)}...</p>
      </div>
      <div className="flex-shrink-0">{statusIcon}</div>
    </div>
  );
};

export const CaGraphView: React.FC<CaGraphViewProps> = ({ cas, allCryptoEngines, router }) => {
  const { nodes, edges, width, height } = useMemo(() => {
    if (cas.length === 0) {
      return { nodes: [], edges: [], width: 600, height: 400 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
    g.setDefaultEdgeLabel(() => ({}));

    const allNodes: CA[] = [];
    const flatten = (caList: CA[]) => {
      caList.forEach(ca => {
        allNodes.push(ca);
        if (ca.children) flatten(ca.children);
      });
    };
    flatten(cas);

    allNodes.forEach(ca => {
      g.setNode(ca.id, { label: ca.name, width: NODE_WIDTH, height: NODE_HEIGHT, data: ca });
    });

    allNodes.forEach(ca => {
      if (ca.issuer && ca.issuer !== 'Self-signed' && g.hasNode(ca.issuer)) {
        g.setEdge(ca.issuer, ca.id);
      }
    });

    dagre.layout(g);

    const dagreNodes = g.nodes().map(nodeId => {
      const node = g.node(nodeId) as dagre.Node & { data: CA };
      return { ...node, id: nodeId };
    });

    const dagreEdges = g.edges().map(edgeObj => {
      const edge = g.edge(edgeObj);
      const path = edge.points.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x} ${p.y}`).join(' ');
      return { from: edgeObj.v, to: edgeObj.w, path };
    });

    const graph = g.graph();
    const finalWidth = Math.max(graph.width || 0, 600);
    const finalHeight = Math.max(graph.height || 0, 400);

    return {
      nodes: dagreNodes,
      edges: dagreEdges,
      width: finalWidth,
      height: finalHeight,
    };
  }, [cas]);

  return (
    <div className="w-full h-[calc(100vh-250px)] border rounded-md relative overflow-hidden flex flex-col bg-background">
      <div className="flex-grow relative">
        <TransformWrapper initialScale={1} minScale={0.1} maxScale={3} centerOnInit limitToBounds={false}>
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <div className="absolute top-2 left-2 z-10 space-x-1">
                <Button variant="outline" size="icon" onClick={() => zoomIn()} title="Zoom In"><ZoomIn className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => zoomOut()} title="Zoom Out"><ZoomOut className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => resetTransform()} title="Reset View"><RotateCcw className="h-4 w-4" /></Button>
              </div>
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: width, height: height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width={width} height={height} className="bg-background text-foreground">
                  <defs>
                    <marker id="arrowhead-dynamic" viewBox="0 0 10 10" refX="8" refY="5"
                        markerWidth="6" markerHeight="6"
                        orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
                    </marker>
                  </defs>
                  
                  <g>
                    {edges.map((edge, i) => (
                      <path
                        key={`edge-${i}`}
                        d={edge.path}
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth="1.5"
                        fill="none"
                        markerEnd="url(#arrowhead-dynamic)"
                      />
                    ))}
                  </g>
                  
                  <g>
                     {nodes.map((node) => (
                        <foreignObject
                            key={node.id}
                            x={node.x - node.width / 2}
                            y={node.y - node.height / 2}
                            width={node.width}
                            height={node.height}
                            onClick={() => router.push(`/certificate-authorities/details?caId=${node.id}`)}
                            className="cursor-pointer"
                        >
                            <GraphNodeComponent node={node} allCryptoEngines={allCryptoEngines} />
                        </foreignObject>
                     ))}
                  </g>
                </svg>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
};
