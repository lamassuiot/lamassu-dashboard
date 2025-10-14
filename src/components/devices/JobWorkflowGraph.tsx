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
import { Play, CheckCircle, AlertTriangle, Check, X, Cpu, Code } from 'lucide-react';
import { NodeStatusIndicator } from '@/components/node-status-indicator';
import { BaseNode, BaseNodeContent } from '@/components/base-node';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';

import directWorkflow from '@/lib/workflows/direct.json';
import phasedWorkflow from '@/lib/workflows/phased.json';

const nodeWidth = 180; // Fixed width for all nodes to ensure perfect center alignment
const nodeHeight = 60;

// Algorithm to determine the ideal path (main flow) from workflow definition
const determineIdealPath = (workflowDefinition: DeviceJobWorkflow): string[] => {
  if (!workflowDefinition.states || !workflowDefinition.transitions) {
    return [];
  }

  // Build a graph representation
  const stateNames = workflowDefinition.states.map((s: any) => s.name);
  const transitions = workflowDefinition.transitions || [];
  
  // Create adjacency list and count incoming edges
  const adjacencyList = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  
  // Initialize counts
  stateNames.forEach(state => {
    adjacencyList.set(state, []);
    incomingCount.set(state, 0);
    outgoingCount.set(state, 0);
  });
  
  // Build the graph
  transitions.forEach((transition: any) => {
    if (transition.from && transition.to && transition.from !== transition.to) {
      const from = transition.from;
      const to = transition.to;
      
      if (stateNames.includes(from) && stateNames.includes(to)) {
        adjacencyList.get(from)?.push(to);
        incomingCount.set(to, (incomingCount.get(to) || 0) + 1);
        outgoingCount.set(from, (outgoingCount.get(from) || 0) + 1);
      }
    }
  });
  
  // Find start state (no incoming edges or commonly named start states)
  let startState = stateNames.find(state => incomingCount.get(state) === 0);
  if (!startState) {
    // Fallback: look for common start state names
    const commonStartNames = ['CREATED', 'INSTALL', 'START', 'INIT', 'BEGIN'];
    startState = stateNames.find(state => commonStartNames.includes(state));
  }
  if (!startState) {
    // Last fallback: use first state in definition
    startState = stateNames[0];
  }
  
  // Find terminal states (no outgoing edges or commonly named end states)
  const terminalStates = stateNames.filter(state => outgoingCount.get(state) === 0);
  const commonEndNames = ['ACTIVATED', 'COMPLETED', 'SUCCESS', 'FINISHED', 'END'];
  const successTerminals = terminalStates.filter(state => 
    commonEndNames.includes(state) || 
    !['TERMINATED', 'FAILED', 'ERROR', 'CANCELLED', 'ABORTED'].includes(state)
  );
  
  // Choose the most likely success terminal
  let targetState = successTerminals.find(state => commonEndNames.includes(state));
  if (!targetState && successTerminals.length > 0) {
    targetState = successTerminals[0];
  }
  if (!targetState && terminalStates.length > 0) {
    targetState = terminalStates[0];
  }
  
  if (!startState || !targetState) {
    // Fallback: return all non-terminal states in order
    return stateNames.filter(state => !terminalStates.includes(state));
  }
  
  // Find the shortest path from start to target (ideal path)
  const queue: { state: string; path: string[] }[] = [{ state: startState, path: [startState] }];
  const visited = new Set<string>();
  
  while (queue.length > 0) {
    const { state, path } = queue.shift()!;
    
    if (state === targetState) {
      return path;
    }
    
    if (visited.has(state)) {
      continue;
    }
    visited.add(state);
    
    const neighbors = adjacencyList.get(state) || [];
    neighbors.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        queue.push({ state: neighbor, path: [...path, neighbor] });
      }
    });
  }
  
  // If no path found, return states in definition order, excluding obvious terminal error states
  const errorStates = ['TERMINATED', 'FAILED', 'ERROR', 'CANCELLED', 'ABORTED'];
  return stateNames.filter(state => !errorStates.includes(state));
};

// Determine the eligible type for a state based on workflow transitions
const getStateEligibleType = (
  stateName: string,
  workflowDefinition: DeviceJobWorkflow
): 'CLIENT' | 'WFX' | 'UNKNOWN' => {
  if (!workflowDefinition.transitions) return 'UNKNOWN';
  
  // Find transitions that lead TO this state
  const incomingTransitions = workflowDefinition.transitions.filter(
    (transition: any) => transition.to === stateName
  );
  
  // If we have incoming transitions, use the eligible field from the first one
  if (incomingTransitions.length > 0 && incomingTransitions[0].eligible) {
    return incomingTransitions[0].eligible as 'CLIENT' | 'WFX';
  }
  
  // Find transitions that start FROM this state 
  const outgoingTransitions = workflowDefinition.transitions.filter(
    (transition: any) => transition.from === stateName
  );
  
  // If we have outgoing transitions, use the eligible field from the first one
  if (outgoingTransitions.length > 0 && outgoingTransitions[0].eligible) {
    return outgoingTransitions[0].eligible as 'CLIENT' | 'WFX';
  }
  
  return 'UNKNOWN';
};

// Determine if a state was skipped based on the ideal path and job history
const isStateSkipped = (
  stateName: string,
  idealPath: string[],
  historyStates: string[],
  currentState?: string
): boolean => {
  // If the state is not in the ideal path, it can't be skipped (it's not part of main flow)
  if (!idealPath.includes(stateName)) {
    return false;
  }
  
  // If the state was actually visited, it wasn't skipped
  if (historyStates.includes(stateName)) {
    return false;
  }
  
  // If it's the current state, it's not skipped
  if (currentState === stateName) {
    return false;
  }
  
  // Find the position in the ideal path
  const stateIndex = idealPath.indexOf(stateName);
  const currentStateIndex = currentState ? idealPath.indexOf(currentState) : -1;
  
  // If we have a current state and it's past this state in the ideal path
  if (currentStateIndex > stateIndex) {
    return true; // This state was skipped
  }
  
  // Check if any later state in the ideal path was visited
  // If so, this state was skipped
  for (let i = stateIndex + 1; i < idealPath.length; i++) {
    if (historyStates.includes(idealPath[i]) || currentState === idealPath[i]) {
      return true; // A later state was reached, so this one was skipped
    }
  }
  
  return false; // Not skipped
};

// 🔹 Custom edge for TERMINATED connections - L-shaped path (flexible direction)
const LeftDownEdge = (props: any) => {
  const { sourceX, sourceY, targetX, targetY, sourceHandle, data, id } = props;
  
  // Create L-shaped path: horizontal first, then vertical
  // Ensure we create a visible path for both left and right connections
  const path = `M${sourceX},${sourceY} H${targetX} V${targetY}`;
  
  // For current edges going to terminal states, add animation
  const dynamicStyle = data?.isCurrentEdge ? {
    ...props.style,
    strokeWidth: props.style?.strokeWidth || 2,
    animation: 'currentEdgePulse 2s ease-in-out infinite'
  } : {
    ...props.style,
    strokeWidth: props.style?.strokeWidth || 2
  };
  
  // Create animated marker for current edge using exact ReactFlow ArrowClosed shape
  const animatedMarker = data?.isCurrentEdge ? (
    <defs>
      <marker
        id={`animated-terminal-arrow-${id}`}
        markerWidth="12.5"
        markerHeight="12.5"
        viewBox="-10 -10 20 20"
        refX="0"
        refY="0"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <polyline
          points="-5,-4 0,0 -5,4 -5,-4"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            fill: '#999',
            stroke: '#999',
            animation: 'currentMarkerPulse 2s ease-in-out infinite'
          }}
        />
      </marker>
    </defs>
  ) : null;
  
  const markerEnd = data?.isCurrentEdge ? `url(#animated-terminal-arrow-${id})` : props.markerEnd;
  
  return (
    <>
      {animatedMarker}
      <BaseEdge
        path={path}
        {...props}
        style={dynamicStyle}
        markerEnd={markerEnd}
      />
    </>
  );
};

// 🔹 Custom edge for horizontal-only connections to shared line
const HorizontalOnlyEdge = (props: any) => {
  const { sourceX, sourceY, targetX } = props;
  
  // Only horizontal line to the shared vertical line position
  const endX = targetX;
  const path = `M${sourceX},${sourceY} H${endX}`;
  
  return (
    <BaseEdge
      path={path}
      {...props}
      style={{ ...props.style, strokeWidth: 2 }}
      markerEnd={undefined} // No arrow for horizontal segments
    />
  );
};

// 🔹 Custom edge for individual vertical segments
const VerticalSegmentEdge = (props: any) => {
  const { data } = props;
  
  if (!data) return null;
  
  const { startY, endY, terminatedX } = data;
  
  // Create vertical segment from startY to endY at the TERMINATED X position
  const path = `M${terminatedX},${startY} V${endY}`;
  
  return (
    <BaseEdge
      path={path}
      {...props}
      style={{ ...props.style, strokeWidth: 2 }}
      markerEnd={props.markerEnd}
    />
  );
};

// 🔹 Custom edge for regular vertical connections between states
const VerticalConnectionEdge = (props: any) => {
  const { sourceX, sourceY, targetX, targetY, data, id } = props;
  
  // Create straight vertical line from source bottom to target top
  const path = `M${sourceX},${sourceY} L${targetX},${targetY}`;
  
  // For current edges, add CSS animation for smooth continuous transition
  const dynamicStyle = data?.isCurrentEdge ? {
    ...props.style,
    strokeWidth: 2.5,
    animation: 'currentEdgePulse 2s ease-in-out infinite'
  } : {
    ...props.style,
    strokeWidth: 2.5
  };
  
  // Create animated marker for current edge using exact ReactFlow ArrowClosed shape
  const animatedMarker = data?.isCurrentEdge ? (
    <defs>
      <marker
        id={`animated-arrow-${id}`}
        markerWidth="12.5"
        markerHeight="12.5"
        viewBox="-10 -10 20 20"
        refX="0"
        refY="0"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <polyline
          points="-5,-4 0,0 -5,4 -5,-4"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            fill: '#999',
            stroke: '#999',
            animation: 'currentMarkerPulse 2s ease-in-out infinite'
          }}
        />
      </marker>
    </defs>
  ) : null;
  
  const markerEnd = data?.isCurrentEdge ? `url(#animated-arrow-${id})` : props.markerEnd;
  
  return (
    <>
      {animatedMarker}
      <BaseEdge
        path={path}
        {...props}
        style={dynamicStyle}
        markerEnd={markerEnd}
      />
    </>
  );
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], historyStates: string[], jobHistory: JobHistoryEntry[], mainFlowStates: string[], direction = 'TB') => {
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

  // Create perfectly aligned vertical layout using the provided mainFlowStates
  
  const centerX = 300; // Fixed center X position for perfect alignment
  const startY = 100;
  const verticalSpacing = 120; // Consistent spacing between nodes
  
  // Identify terminal states (states that have no outgoing transitions or are explicitly terminal)
  const terminalStates = nodes.filter(node => {
    const hasOutgoingEdges = edges.some(edge => edge.source === node.id);
    return !hasOutgoingEdges || node.data?.isTerminal;
  }).map(node => node.id);
  
  // Position main flow states in perfect vertical alignment
  mainFlowStates.forEach((id, index) => {
    const node = dagreGraph.node(id);
    if (node) {
      node.x = centerX; // All nodes at exact same X coordinate
      node.y = startY + (index * verticalSpacing); // Evenly spaced vertically
    }
  });

  // Position terminal states at the bottom in a horizontal row
  const lastMainStateY = startY + ((mainFlowStates.length - 1) * verticalSpacing); // Y position of ACTIVATED (last main state)
  const terminalStartY = lastMainStateY + 40; // Very close gap
  const terminalSpacing = 300; // Increased horizontal spacing between terminal states
  const terminalStartX = centerX - ((terminalStates.length - 1) * terminalSpacing) / 2; // Center the terminal states
  
  terminalStates.forEach((terminalId, index) => {
    const node = dagreGraph.node(terminalId);
    if (node) {
      node.x = terminalStartX + (index * terminalSpacing);
      node.y = terminalStartY;
    }
  });

  // Position any other states (non-main, non-terminal) to the left
  nodes.forEach((node) => {
    if (!mainFlowStates.includes(node.id) && !terminalStates.includes(node.id)) {
      const nodeData = dagreGraph.node(node.id);
      if (nodeData) {
        nodeData.x = centerX - 300; // To the left of main flow
        nodeData.y = startY + 200;
      }
    }
  });

  const layoutedNodes: Node[] = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    
    // Default positions for main flow: bottom to top connections
    let sourcePosition: Position = Position.Bottom;
    let targetPosition: Position = Position.Top;

    // Terminal states receive connections from top
    if (terminalStates.includes(node.id)) {
      targetPosition = Position.Top; // Arrows enter from top
      sourcePosition = Position.Bottom; // Not used but keep consistent
    }
    
    // Main flow nodes use bottom for main flow connections and right for terminal connections
    const isInMainFlow = mainFlowStates.includes(node.id);
    
    if (isInMainFlow) {
      sourcePosition = Position.Bottom; // Main flow connections go down
      targetPosition = Position.Top;    // Receive from top
    } else if (!terminalStates.includes(node.id)) {
      // Other nodes (error states, etc.)
      sourcePosition = Position.Right; // Use right for terminal connections
      targetPosition = Position.Top;   // Receive from top
    }

    return {
      ...node,
      position: { x: dagreNode.x - nodeWidth / 2, y: dagreNode.y - nodeHeight / 2 },
      sourcePosition,
      targetPosition,
    };
  });

  // Separate terminal edges to create L-shaped connections
  const terminalEdges = edges.filter(e => terminalStates.includes(e.target));
  const regularEdges = edges.filter(e => !terminalStates.includes(e.target));
  
  // Separate terminal edges into red (terminated) and gray (non-terminated) for proper layering
  const terminalEdgesData = terminalEdges
    .filter(edge => {
      const sourceNode = layoutedNodes.find(n => n.id === edge.source.trim());
      const targetNode = layoutedNodes.find(n => n.id === edge.target.trim());
      return sourceNode && targetNode;
    })
    .map((edge, index) => {
      // Determine if this path was actually taken for error coloring
      const wasTerminalReached = historyStates.includes(edge.target.trim());
      let lastStateBeforeTerminal = null;
      
      if (wasTerminalReached && jobHistory.length > 0) {
        // Find the terminal event in job history and get the previous state
        const terminalEventIndex = jobHistory.findIndex(event => event.status.state === edge.target.trim());
        
        if (terminalEventIndex > 0) {
          // Get the state immediately before this terminal state
          lastStateBeforeTerminal = jobHistory[terminalEventIndex - 1].status.state;
        }
      }
      
      // Color red if this is the actual path taken to a terminal state
      const isActualTerminalPath = wasTerminalReached && edge.source.trim() === lastStateBeforeTerminal;
      const sourceVisited = historyStates.includes(edge.source);
      const targetVisited = historyStates.includes(edge.target);
      
      // Check if source state was skipped using the ideal path  
      const actualCurrentState = jobHistory.length > 0 ? jobHistory[jobHistory.length - 1]?.status?.state : null;
      const wasSourceSkipped = isStateSkipped(edge.source, mainFlowStates, historyStates, actualCurrentState || undefined);
      
      // Check if this terminal edge goes FROM the current state AND not to TERMINATED (for animation)
      const isCurrentTerminalEdge = edge.source === actualCurrentState && actualCurrentState !== null && edge.target !== 'TERMINATED';
      
      let stroke: string;
      let animated = true;
      let animationDuration = `${2 + (index % 3)}s`;
      
      let strokeWidth = 2;
      
      if (isActualTerminalPath) {
        // Actual terminal path: red color and thicker
        stroke = '#ef4444';
        strokeWidth = 3; // Make red paths thicker
      } else if ((sourceVisited || wasSourceSkipped) && edge.target !== 'TERMINATED') {
        // Source visited or skipped AND not going to TERMINATED: blue color
        stroke = '#3b82f6'; // Blue for visited terminal edges (except TERMINATED)
      } else {
        // Not visited or going to TERMINATED: gray
        stroke = '#999';
      }

      // Determine source handle based on target position
      // Find the target node to determine its position
      const targetNode = layoutedNodes.find(n => n.id === edge.target.trim());
      const sourceNode = layoutedNodes.find(n => n.id === edge.source.trim());
      
      // If target is to the left of source, use left handle; if to the right, use right handle
      let sourceHandle = 'right'; // default
      if (targetNode && sourceNode) {
        sourceHandle = targetNode.position.x < sourceNode.position.x ? 'left' : 'right';
      }

      return {
        ...edge,
        id: `terminal-${edge.id}`,
        source: edge.source.trim(),
        target: edge.target.trim(),
        type: 'leftDown', // L-shaped connection from appropriate side of source to terminal
        sourceHandle,
        targetHandle: 'top',
        animated,
        isActualTerminalPath, // Add flag for sorting
        data: { isCurrentEdge: isCurrentTerminalEdge }, // Pass current edge flag for animation
        style: { 
          stroke, 
          strokeWidth,
          strokeDasharray: 'none',
          animationDuration
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 12, height: 12 },
      };
    });

  // Separate red and gray terminal edges
  const grayTerminalEdges = terminalEdgesData.filter(edge => !edge.isActualTerminalPath);
  const redTerminalEdges = terminalEdgesData.filter(edge => edge.isActualTerminalPath);

  const layoutedEdges: Edge[] = [
    // Regular edges (main flow)
    ...regularEdges.map((edge, index) => {
      const sourceVisited = historyStates.includes(edge.source);
      const targetVisited = historyStates.includes(edge.target);
      
      // Find current state from job history or passed currentState
      const actualCurrentState = jobHistory.length > 0 ? jobHistory[jobHistory.length - 1]?.status?.state : null;
      const currentStateToUse = actualCurrentState;
      
      // An edge is "current" if it goes FROM the current state TO the next ideal state
      const isCurrentEdge = edge.source === currentStateToUse && currentStateToUse !== null;
      
      // Check if states were skipped
      const wasSourceSkipped = isStateSkipped(edge.source, mainFlowStates, historyStates, actualCurrentState || undefined);
      const wasTargetSkipped = isStateSkipped(edge.target, mainFlowStates, historyStates, actualCurrentState || undefined);
      
      // Determine edge color based on state
      let stroke: string;
      let animated = false;
      let animationDuration = '2s';
      
      if (isCurrentEdge) {
        // Current state edge: will vibrate between visited (blue) and non-visited (gray) colors in component
        stroke = '#3b82f6'; // Start with blue visited color
        animated = true;
        animationDuration = '1s'; // Faster vibration
      } else if ((sourceVisited || wasSourceSkipped) && (targetVisited || wasTargetSkipped)) {
        // Both states visited or skipped: blue color
        stroke = '#3b82f6'; // Blue for visited edges
        animated = true;
        animationDuration = `${2 + (index % 3)}s`;
      } else {
        // Not visited: medium gray (previous color)
        stroke = '#999';
        animated = true;
        animationDuration = `${2 + (index % 3)}s`;
      }
      
      const strokeWidth = 2.5;

      return {
        ...edge,
        source: edge.source.trim(),
        target: edge.target.trim(),
        type: 'verticalConnection',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        animated,
        data: { isCurrentEdge }, // Pass flag for custom styling
        style: { 
          stroke, 
          strokeWidth,
          strokeDasharray: 'none',
          animationDuration
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 12, height: 12 },
      };
    }),
    
    // Gray terminal edges first (behind)
    ...grayTerminalEdges,
    
    // Red terminal edges last (on top)
    ...redTerminalEdges
  ];

  return { nodes: layoutedNodes, edges: layoutedEdges };
};

// Helper function to calculate state duration
const calculateStateDuration = (stateEvents: JobHistoryEntry[], allJobHistory?: JobHistoryEntry[], stateName?: string): string => {
  if (stateEvents.length === 0) return "0s";
  
  const startEvent = stateEvents[0];
  const startTime = new Date(startEvent.mtime);
  
  // If we don't have all job history or state name, fallback to simple calculation
  if (!allJobHistory || !stateName) {
    const lastEvent = stateEvents[stateEvents.length - 1];
    const endTime = new Date(lastEvent.mtime);
    const durationSeconds = differenceInSeconds(endTime, startTime);
    
    if (durationSeconds < 60) return `${durationSeconds}s`;
    if (durationSeconds < 3600) return `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
    
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = durationSeconds % 60;
    
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  
  // Find the next different state after this one to determine when this state ended
  const startIndex = allJobHistory.findIndex(event => event.mtime === startEvent.mtime);
  let endTime: Date;
  
  // Look for the next event that's a different state
  let nextStateEvent = null;
  for (let i = startIndex + 1; i < allJobHistory.length; i++) {
    if (allJobHistory[i].status.state !== stateName) {
      nextStateEvent = allJobHistory[i];
      break;
    }
  }
  
  if (nextStateEvent) {
    endTime = new Date(nextStateEvent.mtime);
  } else {
    // If no next state found, use the last event of this state
    const lastEvent = stateEvents[stateEvents.length - 1];
    endTime = new Date(lastEvent.mtime);
  }
  
  const durationSeconds = differenceInSeconds(endTime, startTime);
  
  if (durationSeconds < 60) return `${durationSeconds}s`;
  if (durationSeconds < 3600) return `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
  
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  
  return `${hours}h ${minutes}m ${seconds}s`;
};

const CustomNode = ({
  data,
  onStateClick,
}: {
  data: {
    label: string;
    icon: React.ElementType;
    isVisited: boolean;
    isTerminal: boolean;
    isError: boolean;
    isCurrent: boolean;
    lastEvent: JobHistoryEntry | null;
    currentState?: string;
    jobHistory?: JobHistoryEntry[];
  };
  onStateClick?: (stateData: any) => void;
}) => {
  const { label, icon: Icon, isVisited, isTerminal, isError, isCurrent, lastEvent, currentState, jobHistory = [] } = data;
  
  // Real-time timer for current state
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    if (isCurrent && !isTerminal) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isCurrent, isTerminal]);

  // Use the isCurrent prop which should be correctly set
  const isCurrentState = isCurrent;
  
  // Check if this state was actually visited (has event history)
  const actuallyVisited = isVisited;
  
  // Use the properly calculated wasSkipped value passed from the node data
  // This is calculated using the actual ideal path from the workflow definition
  const wasSkipped = data.wasSkipped || false;
  
  // Should be considered visited if actually visited or if it's before current state and wasn't skipped
  const shouldBeVisited = actuallyVisited && !isCurrentState;

  // Determine styling based on state status
  let backgroundColor: string;
  let borderColor: string;
  let textColor: string;
  let opacity: number = 1;

  if (isCurrentState && !isTerminal) {
    // Current state - normal background with prominent border
    backgroundColor = 'hsl(var(--card))';
    borderColor = 'hsl(var(--primary))';
    textColor = 'hsl(var(--card-foreground))';
    opacity = 1;
  } else if (isTerminal && actuallyVisited) {
    // Terminal states that were reached - special colors
    if (label === 'TERMINATED') {
      // TERMINATED state when reached - red
      backgroundColor = '#fef2f2'; // Light red background
      borderColor = '#ef4444'; // Red border
      textColor = '#dc2626'; // Dark red text
    } else if (label === 'ACTIVATED') {
      // ACTIVATED state when reached - green
      backgroundColor = '#f0fdf4'; // Light green background
      borderColor = '#22c55e'; // Green border
      textColor = '#16a34a'; // Dark green text
    } else {
      // Other terminal states - default terminal styling
      backgroundColor = 'hsl(var(--card))';
      borderColor = 'hsl(var(--primary))';
      textColor = 'hsl(var(--card-foreground))';
    }
    opacity = 1;
  } else if (actuallyVisited || wasSkipped) {
    // Visited or skipped states - normal appearance
    backgroundColor = 'hsl(var(--card))';
    borderColor = 'hsl(var(--primary))';
    textColor = 'hsl(var(--card-foreground))';
    opacity = 1;
  } else {
    // Non-visited states - gray and subdued (OFF appearance)
    backgroundColor = 'hsl(var(--card))'; // Keep original background
    borderColor = 'hsl(var(--muted-foreground) / 0.3)';
    textColor = 'hsl(var(--muted-foreground))';
    opacity = 0.6;
  }

  const nodeContent = (
    <div 
      className={cn(
        'p-3 rounded-lg border-2 flex items-center justify-start gap-3 transition-colors duration-300 relative cursor-pointer hover:shadow-lg select-none'
      )}
      style={{
        width: '180px', 
        height: '60px',
        backgroundColor,
        borderColor,
        color: textColor,
        opacity,
        zIndex: 9999, // Much higher z-index to ensure nodes are always on top
        position: 'relative' // Ensure z-index takes effect
      }}
      onClick={(e) => {
        e.stopPropagation();
        onStateClick(data);
      }}
      draggable={false}
      title="Click to show info"
    >

      {/* Eligible Type Icon - Top Right Corner */}
      {data.eligibleType && data.eligibleType !== 'UNKNOWN' && (
        <div className="absolute top-1.5 right-1.5 z-20 flex flex-col items-center gap-1">
          {/* Eligible Type Icon with its own tooltip */}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  {data.eligibleType === 'CLIENT' ? (
                    <Cpu className={`w-3.5 h-3.5 ${actuallyVisited || wasSkipped || isCurrentState ? 'text-primary' : 'text-muted-foreground/70'}`} />
                  ) : (
                    <Code className={`w-3.5 h-3.5 ${actuallyVisited || wasSkipped || isCurrentState ? 'text-primary' : 'text-muted-foreground/70'}`} />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Eligible: {data.eligibleType === 'CLIENT' ? 'Device' : 'Developer'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Current state + Developer eligible = add play button below with its own tooltip */}
          {isCurrentState && data.eligibleType === 'WFX' && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('Future transition button - will trigger workflow state transition');
                    }}
                    title="Trigger transition (Developer action)"
                  >
                    <Play className="w-2.5 h-2.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Click to trigger transition
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
      
      {/* Small invisible handles for actual edge connections */}
      <Handle type="source" position={Position.Left} id="left" style={{ opacity: 0, width: '8px', height: '8px', border: 'none', background: 'transparent', zIndex: 1020 }} />
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0, width: '8px', height: '8px', border: 'none', background: 'transparent', zIndex: 1020 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0, width: '8px', height: '8px', border: 'none', background: 'transparent', zIndex: 1020 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0, width: '8px', height: '8px', border: 'none', background: 'transparent', zIndex: 1020 }} />
      
      {/* Status indicator circle - replaces the Play icon */}
      <div 
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 relative"
        style={{
          backgroundColor: 'hsl(var(--background))', // Keep original background for all states
          borderColor: !actuallyVisited && !wasSkipped && !isCurrentState ? 'hsl(var(--muted-foreground) / 0.3)' : 'hsl(var(--border))',
          zIndex: 1005 // Above node background but below clickable handle
        }}
      >
        {actuallyVisited && !isCurrentState && !wasSkipped && (
          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-3 h-3 text-primary-foreground" />
          </div>
        )}
        {wasSkipped && (
          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-3 h-3 text-primary-foreground" />
          </div>
        )}
        {(isTerminal && actuallyVisited) && (
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <X className="w-3 h-3 text-white" />
          </div>
        )}
        {!actuallyVisited && !wasSkipped && !isError && !isTerminal && !isCurrentState && (
          <></>
        )}
        {isCurrentState && !isTerminal && (
          <>
            {/* Spinning border animation - slightly larger than the container */}
            <div 
              className="absolute -inset-0.5 rounded-full"
              style={{
                border: '3px solid transparent',
                borderTopColor: '#f59e0b', /* Orange/yellow color */
                borderRadius: '50%',
                animation: 'spin 2s linear infinite'
              }}
            />
            {/* Colored inner circle for current state */}
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
          </>
        )}
      </div>
      

      
      <div className="flex flex-col relative z-10 flex-1">
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs text-muted-foreground mt-1">
          {(() => {
            if (wasSkipped) return "0s (skipped)";
            if (!actuallyVisited && !isCurrentState) return ""; // No time for unreached states
            
            const stateEvents = jobHistory.filter(event => event.status.state === label);
            
            if (isCurrentState && !isTerminal) {
              // Calculate real-time duration for current state
              if (stateEvents.length > 0) {
                const startTime = new Date(stateEvents[0].mtime);
                const durationSeconds = differenceInSeconds(currentTime, startTime);
                
                if (durationSeconds < 60) return `${durationSeconds}s`;
                if (durationSeconds < 3600) return `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
                
                const hours = Math.floor(durationSeconds / 3600);
                const minutes = Math.floor((durationSeconds % 3600) / 60);
                const seconds = durationSeconds % 60;
                
                return `${hours}h ${minutes}m ${seconds}s`;
              }
              return "0s";
            }
            
            if (stateEvents.length === 0) return "0s (no data)";
            
            return calculateStateDuration(stateEvents, jobHistory, label);
          })()}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ zIndex: 9999, position: 'relative' }}>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            {nodeContent}
          </TooltipTrigger>
        <TooltipContent 
          className="max-w-md border shadow-lg bg-popover text-popover-foreground" 
          side="right" 
          align="center"
          sideOffset={15}
          style={{
            animation: 'tooltipSlideIn 0.2s ease-out forwards',
            transformOrigin: 'left center',
            zIndex: 10000
          }}
        >
          <div className="space-y-3">
            <div>
              <strong className="text-lg">{label}</strong>
            </div>
            
            {/* Status */}
            <div>
              <span className="text-sm font-medium text-muted-foreground">Status: </span>
              {wasSkipped && <span className="text-green-600 font-medium">Skipped</span>}
              {isCurrentState && !wasSkipped && <span className="text-blue-600 font-medium">Currently Active</span>}
              {actuallyVisited && !isCurrentState && !wasSkipped && <span className="text-green-600 font-medium">Completed</span>}
              {!actuallyVisited && !isCurrentState && !wasSkipped && <span className="text-muted-foreground">Not Yet Reached</span>}
              {isTerminal && actuallyVisited && <span className="text-red-600 font-medium">Terminal State Reached</span>}
            </div>

            {/* Duration */}
            <div>
              <span className="text-sm font-medium text-muted-foreground">Duration: </span>
              <span className="font-medium">
                {(() => {
                  if (wasSkipped) return "0s (skipped)";
                  if (!actuallyVisited && !isCurrentState) return "0s"; // No time for unreached states
                  
                  const stateEvents = jobHistory.filter(event => event.status.state === label);
                  
                  if (isCurrentState && !isTerminal) {
                    // Calculate real-time duration for current state
                    if (stateEvents.length > 0) {
                      const startTime = new Date(stateEvents[0].mtime);
                      const durationSeconds = differenceInSeconds(currentTime, startTime);
                      
                      if (durationSeconds < 60) return `${durationSeconds}s`;
                      if (durationSeconds < 3600) return `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
                      
                      const hours = Math.floor(durationSeconds / 3600);
                      const minutes = Math.floor((durationSeconds % 3600) / 60);
                      const seconds = durationSeconds % 60;
                      
                      return `${hours}h ${minutes}m ${seconds}s`;
                    }
                    return "0s";
                  }
                  
                  if (stateEvents.length === 0) return "0s";
                  
                  return calculateStateDuration(stateEvents, jobHistory, label);
                })()}
              </span>
            </div>

            {/* Events Timeline */}
            {(() => {
              const stateEvents = jobHistory.filter(event => event.status.state === label);
              
              if (wasSkipped) {
                return (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">Events:</div>
                    <div className="text-sm text-green-600 italic">State was skipped in workflow execution</div>
                  </div>
                );
              }
              
              if (stateEvents.length === 0) {
                return (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">Events:</div>
                    <div className="text-sm text-muted-foreground italic">No events recorded yet</div>
                  </div>
                );
              }
              
              return (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Events ({stateEvents.length}):
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {stateEvents.map((event, index) => (
                      <div key={index} className="border-l-2 border-muted pl-3 py-1">
                        <div className="text-sm font-medium">
                          {format(parseISO(event.mtime), 'MMM d, yyyy HH:mm:ss')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          State: {event.status.state}
                        </div>
                        {event.status.message && (
                          <div className="text-xs mt-1 text-blue-600 bg-blue-50 dark:bg-blue-950 p-1 rounded">
                            <span className="font-medium">Message:</span> {event.status.message}
                          </div>
                        )}
                        {event.status.reason && (
                          <div className="text-xs mt-1 text-orange-600 bg-orange-50 dark:bg-orange-950 p-1 rounded">
                            <span className="font-medium">Reason:</span> {event.status.reason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    </div>
  );
};

// nodeTypes will be created dynamically with the click handler

interface JobWorkflowGraphProps {
  workflow: DeviceJobWorkflow;
  jobHistory?: JobHistoryEntry[];
  currentState?: string;
}

export const JobWorkflowGraph: React.FC<JobWorkflowGraphProps> = ({ workflow, jobHistory = [], currentState }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedState, setSelectedState] = useState<any>(null);

  const handleStateClick = (stateData: any) => {
    setSelectedState(stateData);
  };

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

    // Determine the actual current state from job history if currentState is not provided
    const mostRecentEvent = jobHistory.length > 0 ? jobHistory[jobHistory.length - 1] : null;
    const actualCurrentState = currentState || mostRecentEvent?.status?.state;
    
    // Dynamically determine the ideal path (main flow) from workflow structure
    const mainFlowStates = determineIdealPath(workflowDefinition);
    
    const initialNodes: Node[] = workflowDefinition.states.map((state: DeviceJobWorkflowState) => {
      const isVisited = historyStates.includes(state.name);
      const isTerminal = state.name === 'TERMINATED';
      const isCurrent = actualCurrentState === state.name;
      const Icon = isTerminal ? AlertTriangle : Play;
      const lastEvent = lastEventByState.get(state.name) || null;

      // Calculate if this state was skipped based on the ideal path
      const wasSkipped = isStateSkipped(state.name, mainFlowStates, historyStates, actualCurrentState);

      // Determine the eligible type for this state
      const eligibleType = getStateEligibleType(state.name, workflowDefinition);

      return {
        id: state.name.trim(),
        type: 'custom',
        data: { 
          label: state.name, 
          icon: Icon, 
          isVisited, 
          isTerminal, 
          isError: false, 
          isCurrent, 
          lastEvent, 
          currentState: actualCurrentState, 
          jobHistory, 
          wasSkipped,
          eligibleType,
          workflowDefinition
        },
        position: { x: 0, y: 0 },
        sourcePosition: 'bottom' as Position,
        targetPosition: 'top' as Position,
      };
    });

    const nodeIds = new Set(initialNodes.map((n) => n.id));
    const initialEdges: Edge[] = workflowDefinition.transitions
      .filter((t: DeviceJobWorkflowTransition) => 
        t.from && t.to && 
        nodeIds.has(t.from.trim()) && 
        nodeIds.has(t.to.trim()) &&
        t.from.trim() !== t.to.trim() // Exclude self-loops
      )
      .map((t: DeviceJobWorkflowTransition, index: number) => {
        const isToTerminated = t.to === 'TERMINATED';
        
        // Create different edge types to avoid overlapping
        let edgeType = 'step';
        if (isToTerminated) {
          edgeType = 'leftDown';
        } else if (index % 3 === 1) {
          edgeType = 'horizontal';
        } else if (index % 3 === 2) {
          edgeType = 'verticalSegment';
        }

        return {
          id: `e-${t.from}-${t.to}`,
          source: t.from.trim(),
          target: t.to.trim(),
          data: {
            sourceVisited: historyStates.includes(t.from),
            targetVisited: historyStates.includes(t.to),
            isCurrent: currentState === t.to,
          },
          type: edgeType,
        };
      });

    return getLayoutedElements(initialNodes, initialEdges, historyStates, jobHistory, mainFlowStates);
  }, [workflow, jobHistory, currentState]);

  useEffect(() => {
    setNodes(layoutElements.nodes);
    setEdges(layoutElements.edges);
  }, [layoutElements]);

  const handleNodesChange: OnNodesChange = (changes) => setNodes((nds) => applyNodeChanges(changes, nds));
  const handleEdgesChange: OnEdgesChange = (changes) => setEdges((eds) => applyEdgeChanges(changes, eds));

  const nodeTypes = useMemo(() => ({
    custom: (props: any) => <CustomNode {...props} onStateClick={handleStateClick} />
  }), []);

  const edgeTypes = useMemo(() => ({ 
    leftDown: LeftDownEdge, 
    horizontalOnly: HorizontalOnlyEdge, 
    verticalSegment: VerticalSegmentEdge,
    verticalConnection: VerticalConnectionEdge
  }), []);

  return (
    <div className="h-full w-full flex">
      {/* Info Panel */}
      {selectedState && (
        <div className="w-80 bg-card border-r border-border p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">{selectedState.label}</h3>
            <button 
              onClick={() => setSelectedState(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <span className="text-sm font-medium">Status:</span>
              <div className="mt-1">
                {selectedState.isCurrent && (
                  <span className="text-blue-600 font-medium">Currently Active</span>
                )}
                {selectedState.wasSkipped && (
                  <span className="text-green-600 font-medium">Skipped</span>
                )}
                {selectedState.isVisited && !selectedState.isCurrent && !selectedState.wasSkipped && (
                  <span className="text-green-600 font-medium">Completed</span>
                )}
                {!selectedState.isVisited && !selectedState.isCurrent && !selectedState.wasSkipped && (
                  <span className="text-muted-foreground">Not Reached</span>
                )}
                {selectedState.isTerminal && selectedState.isVisited && (
                  <span className="text-red-600 font-medium">Terminated</span>
                )}
              </div>
            </div>

            {selectedState.jobHistory.length > 0 && (
              <div>
                <span className="text-sm font-medium">Timeline:</span>
                <div className="mt-2 space-y-2">
                  {selectedState.jobHistory.map((event: JobHistoryEntry, index: number) => (
                    <div key={index} className="text-sm">
                      <div className="font-medium">{format(parseISO(event.mtime), 'PPpp')}</div>
                      <div className="text-muted-foreground">{event.status.state}</div>
                      {event.status.message && (
                        <div className="text-muted-foreground text-xs mt-1 italic">{event.status.message}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(selectedState.jobHistory.length > 0 || selectedState.isCurrent) && (
              <div>
                <span className="text-sm font-medium">Duration:</span>
                <div className="mt-1">
                  {(() => {
                    if (selectedState.wasSkipped) return "0s (skipped)";
                    if (selectedState.jobHistory.length === 0) return "0s (no data)";
                    
                    if (selectedState.isCurrent && !selectedState.isTerminal) {
                      const startTime = new Date(selectedState.jobHistory[0].mtime);
                      const durationSeconds = differenceInSeconds(selectedState.currentTime, startTime);
                      
                      if (durationSeconds < 60) return `${durationSeconds}s`;
                      if (durationSeconds < 3600) return `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
                      
                      const hours = Math.floor(durationSeconds / 3600);
                      const minutes = Math.floor((durationSeconds % 3600) / 60);
                      const seconds = durationSeconds % 60;
                      
                      return `${hours}h ${minutes}m ${seconds}s`;
                    }
                    
                    return calculateStateDuration(selectedState.jobHistory, selectedState.allJobHistory, selectedState.label);
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* ReactFlow */}
      <div className="flex-1">
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
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={true}
          selectNodesOnDrag={false}
          panOnDrag={true}
          onNodeClick={(event, node) => {
            handleStateClick({
              label: node.data.label,
              isVisited: node.data.isVisited,
              isTerminal: node.data.isTerminal,
              isCurrent: node.data.isCurrent,
              wasSkipped: node.data.wasSkipped || false,
              jobHistory: jobHistory.filter(event => event.status.state === node.data.label),
              allJobHistory: jobHistory,
              currentTime: new Date()
            });
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
};
