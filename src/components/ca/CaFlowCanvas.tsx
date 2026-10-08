'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { Download, Loader2, LocateFixed, Maximize, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const FIT_OPTIONS = { padding: 0.15, duration: 200 };

interface CaFlowCanvasProps<N extends Node> {
  nodes: N[];
  /** Edges before hover highlighting; the canvas fades the ones unrelated to the hovered node. */
  edges: Edge[];
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange<N>;
  /** Change this whenever a new layout has been applied so the view fits the result. */
  fitSignal: unknown;
  isLoading?: boolean;
  /** Prefix of the downloaded PNG file name. */
  downloadName: string;
  /** Extra toolbar content shown before the standard fit / download / fullscreen buttons. */
  toolbarLeading?: React.ReactNode;
  /** Content of the "how to read" panel. */
  legend: React.ReactNode;
}

/** Hovering a node highlights the edges attached to it and fades the rest. */
function highlightEdges(edges: Edge[], activeId: string | null): Edge[] {
  if (!activeId) return edges;
  return edges.map(edge => {
    const isActive = edge.source === activeId || edge.target === activeId;
    const strokeWidth = edge.style?.strokeWidth ?? (isActive ? 2 : 1);
    return { ...edge, zIndex: isActive ? 1 : 0, style: { ...edge.style, opacity: isActive ? 1 : 0.15, strokeWidth } };
  });
}

function CaFlowCanvasInner<N extends Node>({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  fitSignal,
  isLoading = false,
  downloadName,
  toolbarLeading,
  legend,
}: Readonly<CaFlowCanvasProps<N>>) {
  const { isDarkMode } = useTheme();
  const { fitView } = useReactFlow();
  const frameRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const shownEdges = useMemo(() => highlightEdges(edges, activeId), [edges, activeId]);

  useEffect(() => {
    if (fitSignal == null) return;
    const frame = window.requestAnimationFrame(() => fitView(FIT_OPTIONS));
    return () => window.cancelAnimationFrame(frame);
  }, [fitSignal, fitView]);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => fitView(FIT_OPTIONS), 100);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fitView]);

  const handleFullscreenToggle = useCallback(() => {
    if (!frameRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      frameRef.current.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`));
    }
  }, []);

  const handleDownloadImage = useCallback(async () => {
    const viewport = frameRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!frameRef.current || !viewport) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: getComputedStyle(frameRef.current).backgroundColor,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `${downloadName}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error downloading image:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [downloadName]);

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative w-full overflow-hidden rounded-lg border bg-background',
        '[--xy-edge-stroke:var(--color-muted-foreground)]',
        isFullscreen ? 'h-screen' : 'h-[calc(100vh-250px)]',
      )}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={shownEdges}
          onNodesChange={onNodesChange}
          onNodeMouseEnter={(_, node) => setActiveId(node.id)}
          onNodeMouseLeave={() => setActiveId(null)}
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
            {toolbarLeading}
            <Button variant="outline" size="icon-sm" onClick={() => fitView(FIT_OPTIONS)} title="Fit to view">
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
            {legend}
          </Panel>
        </ReactFlow>
      )}
    </div>
  );
}

/**
 * Shared frame of the CA graph and hierarchy views: pan/zoom canvas with a dotted
 * background, zoom controls, and a toolbar to fit, download as PNG and go fullscreen.
 */
export function CaFlowCanvas<N extends Node>(props: Readonly<CaFlowCanvasProps<N>>) {
  return (
    <ReactFlowProvider>
      <CaFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
