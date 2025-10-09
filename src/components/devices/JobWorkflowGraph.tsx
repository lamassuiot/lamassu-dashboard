// src/components/devices/JobWorkflowGraph.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  MarkerType,
  Handle,
  Position,
  BaseEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type {
  DeviceJobWorkflow,
  DeviceJobWorkflowState,
  DeviceJobWorkflowTransition,
  JobHistoryEntry,
} from '@/types/iot';
import dagre from '@dagrejs/dagre';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';

import directWorkflow from '@/lib/workflows/direct.json';
import phasedWorkflow from '@/lib/workflows/phased.json';

const nodeWidth = 172;
const nodeHeight = 60;

// 🔹 Custom sharp left-down edge for TERMINATED
const LeftDownEdge = (props: any) => {
  const { sourceX, sourceY, targetX, targetY } = props;
  const midX = sourceX - 80;
  const path = `M${sourceX},${sourceY} H${midX} V${targetY} H${targetX}`;
  return (
    <BaseEdge
      path={path}
      {...props}
      style={{ ...props.style, strokeWidth: 2 }}
      markerEnd={props.markerEnd}
    />
  );
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 60, align: 'UL' });

  nodes.forEach((node) =>
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  );

  edges.forEach((edge) => {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const idealStates = ['INSTALL', 'INSTALLING', 'INSTALLED', 'ACTIVATE', 'ACTIVATING', 'ACTIVATED'];
  const refX = dagreGraph.node('INSTALLING')?.x || 0;
  idealStates.forEach((id) => {
    const n = dagreGraph.node(id);
    if (n) n.x = refX;
  });

  const installNode = dagreGraph.node('INSTALL');
  if (installNode) installNode.x -= 100;
  const terminatedNode = dagreGraph.node('TERMINATED');
  if (terminatedNode) terminatedNode.x -= 250;

  const layoutedNodes: Node[] = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    let sourcePosition: Position = Position.Bottom;
    let targetPosition: Position = Position.Top;

    if (node.id === 'TERMINATED') targetPosition = Position.Right;
    const connectsToTerminated = edges.some((e) => e.source === node.id && e.target === 'TERMINATED');
    if (connectsToTerminated) sourcePosition = Position.Left;

    return {
      ...node,
      position: { x: dagreNode.x - nodeWidth / 2, y: dagreNode.y - nodeHeight / 2 },
      sourcePosition,
      targetPosition,
    };
  });

  const layoutedEdges: Edge[] = edges.map((edge) => {
    const isToTerminated = edge.target === 'TERMINATED';
    const sourceVisited = edge.data?.sourceVisited;
    const targetVisited = edge.data?.targetVisited;
    const isCurrent = edge.data?.isCurrent;

    let stroke = '#bbb';
    let animated = false;
    let strokeDasharray: string | undefined = undefined;

    if (isToTerminated) {
      stroke = sourceVisited ? '#f87171' : '#bbb'; // red if TERMINATED visited, else gray
    } else if (sourceVisited && targetVisited) {
      stroke = '#4ade80'; // green completed
    } else if (isCurrent) {
      stroke = '#3b82f6'; // blue current
      animated = true;
      strokeDasharray = '4 4';
    }

    return {
      ...edge,
      source: edge.source.trim(),
      target: edge.target.trim(),
      type: isToTerminated ? 'leftDown' : 'step',
      animated,
      style: { stroke, strokeWidth: 2, strokeDasharray },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
};

const CustomNode = ({
  data,
}: {
  data: {
    label: string;
    icon: React.ElementType;
    isVisited: boolean;
    isTerminal: boolean;
    isError: boolean;
    isCurrent: boolean;
    lastEvent: JobHistoryEntry | null;
  };
}) => {
  const { label, icon: Icon, isVisited, isTerminal, isError, isCurrent, lastEvent } = data;

  let bgColor = 'bg-background';
  let borderColor = 'border-border';
  let textColor = 'text-muted-foreground';

  if (isError) {
    bgColor = 'bg-red-100';
    borderColor = 'border-red-400';
    textColor = 'text-red-800';
  } else if (isVisited) {
    bgColor = 'bg-green-100';
    borderColor = 'border-green-400';
    textColor = 'text-green-800';
  }

  if (isCurrent) {
    bgColor = 'bg-blue-200';
    borderColor = 'border-blue-400';
    textColor = 'text-blue-800';
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(`p-3 rounded-lg border-2 w-full h-full flex items-center justify-start gap-3 transition-colors duration-300 relative`, bgColor, borderColor, textColor)}>
            <Handle type="target" position={Position.Top} />
            <Handle type="source" position={Position.Bottom} />
            <Icon className="h-6 w-6 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{label}</span>
              {isVisited && !isCurrent && <Badge variant="outline" className="text-xs mt-1 w-fit border-green-400/50 text-green-700">Visited</Badge>}
              {isCurrent && <Badge variant="outline" className="text-xs mt-1 w-fit border-blue-500 text-blue-900">Current</Badge>}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {lastEvent ? <p>Last visited: {format(parseISO(lastEvent.mtime), 'PPpp')}</p> : <p>Not yet visited</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const nodeTypes: NodeTypes = { custom: CustomNode };

interface JobWorkflowGraphProps {
  workflow: DeviceJobWorkflow;
  jobHistory?: JobHistoryEntry[];
  currentState?: string;
}

export const JobWorkflowGraph: React.FC<JobWorkflowGraphProps> = ({ workflow, jobHistory = [], currentState }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const layoutElements = useMemo(() => {
    let workflowDefinition: DeviceJobWorkflow | null = workflow;
    if (!workflowDefinition?.states?.length) {
      if (workflow.name === 'wfx.workflow.dau.direct') workflowDefinition = directWorkflow as DeviceJobWorkflow;
      else if (workflow.name === 'wfx.workflow.dau.phased') workflowDefinition = phasedWorkflow as DeviceJobWorkflow;
      else return { nodes: [], edges: [] };
    }

    const historyStates = jobHistory.map((h) => h.status.state);
    const lastEventByState = new Map<string, JobHistoryEntry>();
    jobHistory.forEach((event) => lastEventByState.set(event.status.state, event));

    const initialNodes: Node[] = workflowDefinition.states.map((state: DeviceJobWorkflowState) => {
      const isVisited = historyStates.includes(state.name);
      const isTerminal = state.name === 'TERMINATED';
      const isCurrent = currentState === state.name;
      const Icon = isTerminal ? AlertTriangle : Play;
      const lastEvent = lastEventByState.get(state.name) || null;

      return {
        id: state.name.trim(),
        type: 'custom',
        data: { label: state.name, icon: Icon, isVisited, isTerminal, isError: isTerminal, isCurrent, lastEvent },
        position: { x: 0, y: 0 },
        sourcePosition: 'bottom' as Position,
        targetPosition: 'top' as Position,
      };
    });

    const nodeIds = new Set(initialNodes.map((n) => n.id));
    const initialEdges: Edge[] = workflowDefinition.transitions
      .filter((t: DeviceJobWorkflowTransition) => t.from && t.to && nodeIds.has(t.from.trim()) && nodeIds.has(t.to.trim()))
      .map((t: DeviceJobWorkflowTransition) => ({
        id: `e-${t.from}-${t.to}`,
        source: t.from.trim(),
        target: t.to.trim(),
        data: {
          sourceVisited: historyStates.includes(t.from),
          targetVisited: historyStates.includes(t.to),
          isCurrent: currentState === t.to,
        },
        type: t.to === 'TERMINATED' ? 'leftDown' : 'step',
      }));

    return getLayoutedElements(initialNodes, initialEdges);
  }, [workflow, jobHistory, currentState]);

  useEffect(() => {
    setNodes(layoutElements.nodes);
    setEdges(layoutElements.edges);
  }, [layoutElements]);

  const handleNodesChange: OnNodesChange = (changes) => setNodes((nds) => applyNodeChanges(changes, nds));
  const handleEdgesChange: OnEdgesChange = (changes) => setEdges((eds) => applyEdgeChanges(changes, eds));

  const edgeTypes = useMemo(() => ({ leftDown: LeftDownEdge }), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Controls showInteractive={false} />
      <Background />
    </ReactFlow>
  );
};
