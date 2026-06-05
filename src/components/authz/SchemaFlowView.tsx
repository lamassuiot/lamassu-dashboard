'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import type { SchemaDefinition } from '@/types/authz';
import { SchemaNode } from './SchemaNode';
import Dagre from '@dagrejs/dagre';

interface SchemaFlowViewProps {
  schemas: SchemaDefinition[];
  error?: string | null;
}

const nodeTypes: NodeTypes = {
  schema: SchemaNode as any,
};

// Auto-layout using Dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 100, ranksep: 150 });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) => g.setNode(node.id, { width: 300, height: 250 }));

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const { x, y } = g.node(node.id);
    return { ...node, position: { x: x - 150, y: y - 125 } };
  });

  return { nodes: layoutedNodes, edges };
};

export function SchemaFlowView({ schemas, error }: SchemaFlowViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (schemas.length === 0) return;

    // Create nodes for each schema
    const newNodes: Node[] = schemas.map((schema, index) => ({
      id: schema.entity_type,
      type: 'schema',
      position: { x: 0, y: 0 }, // Will be repositioned by layout
      data: { schema },
    }));

    // Create edges for each relation
    const newEdges: Edge[] = [];
    schemas.forEach((schema) => {
      Object.entries(schema.relations).forEach(([key, relation]) => {
        // Check if target entity exists in schemas
        const targetExists = schemas.some((s) => s.entity_type === relation.target_entity);
        if (targetExists) {
          newEdges.push({
            id: `${schema.entity_type}-${relation.target_entity}-${key}`,
            source: schema.entity_type,
            target: relation.target_entity,
            sourceHandle: 'right',
            targetHandle: 'left',
            label: relation.name,
            type: 'smoothstep',
            animated: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            },
            style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
            labelStyle: {
              fill: 'hsl(var(--foreground))',
              fontSize: 12,
              fontWeight: 500,
            },
            labelBgStyle: {
              fill: 'hsl(var(--background))',
              fillOpacity: 0.9,
            },
          });
        }
      });
    });

    // Apply auto-layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      newNodes,
      newEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [schemas, setNodes, setEdges]);

  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  if (schemas.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No schemas to visualize
      </div>
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

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="outline">
            {nodeCount} entit{nodeCount !== 1 ? 'ies' : 'y'}
          </Badge>
          <Badge variant="outline">
            {edgeCount} relation{edgeCount !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      <div style={{ height: '700px' }} className="border rounded-lg bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              return 'hsl(var(--primary))';
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Drag nodes to reposition them</p>
        <p>• Scroll to zoom in/out</p>
        <p>• Arrows show foreign key relationships between entities</p>
        <p>• Use minimap (bottom-right) for navigation in large schemas</p>
      </div>
    </div>
  );
}
