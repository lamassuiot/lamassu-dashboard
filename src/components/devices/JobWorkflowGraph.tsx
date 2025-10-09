// src/components/devices/JobWorkflowGraph.tsx
'use client';

import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type DefaultEdgeOptions,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { DeviceJobWorkflow, DeviceJobWorkflowState, DeviceJobWorkflowTransition, JobHistoryEntry } from '@/types/iot';
import dagre from '@dagrejs/dagre';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';

// Import the workflow definitions
import directWorkflow from '@/lib/workflows/direct.json';
import phasedWorkflow from '@/lib/workflows/phased.json';


const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 60;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 60, nodesep: 30 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = 'top';
    node.sourcePosition = 'bottom';
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    return node;
  });

  return { nodes, edges };
};

const CustomNode = ({ data }: { data: { label: string; icon: React.ElementType; isVisited: boolean; isTerminal: boolean; isError: boolean; lastEvent: JobHistoryEntry | null; } }) => {
    const { label, icon: Icon, isVisited, isTerminal, isError, lastEvent } = data;
    
    return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
                <div className={cn(
                    "p-3 rounded-lg border-2 w-full h-full flex items-center justify-start gap-3 transition-colors duration-300",
                    isVisited 
                        ? (isError ? "bg-red-100 border-red-400 text-red-800" : (isTerminal ? "bg-green-100 border-green-400 text-green-800" : "bg-blue-100 border-blue-400 text-blue-800"))
                        : "bg-background border-border text-muted-foreground"
                )}>
                    <Icon className={cn("h-6 w-6 flex-shrink-0", isVisited ? "" : "text-muted-foreground/60")} />
                    <div className="flex flex-col">
                        <span className="font-semibold text-sm">{label}</span>
                         {isVisited && <Badge variant="outline" className={cn(
                            "text-xs mt-1 w-fit",
                            isError ? "border-red-400/50 text-red-700" : (isTerminal ? "border-green-400/50 text-green-700" : "border-blue-400/50 text-blue-700")
                         )}>Visited</Badge>}
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent>
              {lastEvent ? (
                <p>Last visited: {format(parseISO(lastEvent.mtime), 'PPpp')}</p>
              ) : (
                <p>Not yet visited</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
    );
};

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

interface JobWorkflowGraphProps {
  workflow: DeviceJobWorkflow;
  jobHistory: JobHistoryEntry[];
}

export const JobWorkflowGraph: React.FC<JobWorkflowGraphProps> = ({ workflow, jobHistory }) => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {

        let workflowToRender: DeviceJobWorkflow = workflow;
        if (!workflow || !workflow.states || workflow.states.length === 0) {
            if (workflow.name === 'wfx.workflow.dau.direct') {
                workflowToRender = directWorkflow as DeviceJobWorkflow;
            } else if (workflow.name === 'wfx.workflow.dau.phased') {
                workflowToRender = phasedWorkflow as DeviceJobWorkflow;
            }
        }
        
        if (!workflowToRender || !workflowToRender.states) {
            return { nodes: [], edges: [] };
        }
        
        const historyStates = jobHistory.map(h => h.status.state);
        const lastEventByState = new Map<string, JobHistoryEntry>();
        jobHistory.forEach(event => {
            lastEventByState.set(event.status.state, event);
        });


        const initialNodes: Node[] = workflowToRender.states.map((state: DeviceJobWorkflowState) => {
            const isVisited = historyStates.includes(state.name);
            const isTerminal = state.name === "ACTIVATED" || state.name === "INSTALLED";
            const isError = state.name === "TERMINATED";
            const Icon = isError ? AlertTriangle : isTerminal ? CheckCircle : Play;
            const lastEvent = lastEventByState.get(state.name) || null;
            
            return {
                id: state.name,
                type: 'custom',
                data: { label: state.name, icon: Icon, isVisited, isTerminal, isError, lastEvent },
                position: { x: 0, y: 0 }, // Position will be set by Dagre
            };
        });

        const initialEdges: Edge[] = workflowToRender.transitions.map((trans: DeviceJobWorkflowTransition) => ({
            id: `e-${trans.from}-${trans.to}`,
            source: trans.from,
            target: trans.to,
            animated: historyStates.includes(trans.from) && historyStates.includes(trans.to),
            style: {
                strokeWidth: 2,
                stroke: (historyStates.includes(trans.from) && historyStates.includes(trans.to)) ? '#0f67ff' : '#cccccc',
            }
        }));
        
        return getLayoutedElements(initialNodes, initialEdges);
    }, [workflow, jobHistory]);

    const [nodes, setNodes] = React.useState<Node[]>(layoutedNodes);
    const [edges, setEdges] = React.useState<Edge[]>(layoutedEdges);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        [setNodes]
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        [setEdges]
    );

    const defaultEdgeOptions: DefaultEdgeOptions = {
        type: 'smoothstep',
        markerEnd: {
            type: 'arrowclosed',
            color: '#0f67ff',
        },
    };

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
        >
            <Controls />
            <Background />
        </ReactFlow>
    );
};
