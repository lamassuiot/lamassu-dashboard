'use client';

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';

interface BubbleItem {
  id: string;
  label: string;
  value: number;
  group: string;
  color: string;
}

type TooltipState = {
  x: number;
  y: number;
  item: BubbleItem;
} | null;

interface CBOMBubbleChartProps {
  assets: Array<{
    name?: string;
    type?: string;
    'bom-ref'?: string;
    cryptoProperties?: {
      assetType?: string;
      algorithmProperties?: {
        primitive?: string;
      };
    };
    evidence?: {
      occurrences?: Array<unknown>;
    };
  }>;
  /** Width of the SVG. Defaults to container width. */
  width?: number;
  /** Height of the SVG. */
  height?: number;
}

// 24-color palette – visually well-separated
const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#499894', '#86bcb6', '#e9c39b', '#d37295', '#fabfd2',
  '#b6992d', '#f1ce63', '#a0cbe8', '#8cd17d', '#d4a6c8',
  '#9d7660', '#cfb69a', '#6f9dc8', '#79706e',
];

function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export function CBOMBubbleChart({ assets, width: propWidth, height = 380 }: CBOMBubbleChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [showLegend, setShowLegend] = useState(false);
  // Stable ref so D3 handlers don't re-bind on every render
  const setTooltipRef = useRef(setTooltip);
  setTooltipRef.current = setTooltip;

  const data = useMemo<BubbleItem[]>(() => {
    const map = new Map<string, { value: number; group: string }>();

    for (const asset of assets) {
      const name = asset.name?.trim() || '(unknown)';
      const group = asset.cryptoProperties?.assetType || asset.type || 'other';
      const occurrences = asset.evidence?.occurrences?.length ?? 1;
      const key = `${group}::${name}`;
      const existing = map.get(key);
      if (existing) {
        existing.value += occurrences;
      } else {
        map.set(key, { value: occurrences, group });
      }
    }

    // Sort descending so the largest bubbles get the first (most vibrant) palette colors
    const entries = Array.from(map.entries()).sort((a, b) => b[1].value - a[1].value);
    return entries.map(([key, { value, group }], i) => ({
      id: key,
      label: key.split('::')[1],
      value,
      group,
      color: pickColor(i),
    }));
  }, [assets]);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container || data.length === 0) return;

    const width = propWidth ?? (container.getBoundingClientRect().width || 600);
    const margin = 2;

    // Remove previous render
    d3.select(svg).selectAll('*').remove();

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Pack layout
    const pack = d3
      .pack<BubbleItem>()
      .size([width - margin * 2, height - margin * 2])
      .padding(3);

    interface PackDatum extends BubbleItem { children?: PackDatum[] }
    const hierarchy = d3
      .hierarchy<PackDatum>({ id: 'root', label: '', value: 0, group: '', color: '', children: data as PackDatum[] })
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const root = pack(hierarchy as d3.HierarchyNode<BubbleItem>);

    const g = d3
      .select(svg)
      .append('g')
      .attr('transform', `translate(${margin},${margin})`);

    const leaf = g
      .selectAll<SVGGElement, d3.HierarchyCircularNode<BubbleItem>>('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d) => `translate(${d.x},${d.y})`);

    // Circle – per-bubble color
    leaf
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => {
        const c = d3.color(d.data.color);
        if (!c) return d.data.color;
        c.opacity = 0.22;
        return c.toString();
      })
      .attr('stroke', (d) => d.data.color)
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event: MouseEvent, d) {
        d3.select(this)
          .attr('fill', () => {
            const c = d3.color(d.data.color);
            if (!c) return d.data.color;
            c.opacity = 0.5;
            return c.toString();
          })
          .attr('stroke-width', 2.5);
        const svgEl = svgRef.current;
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        setTooltipRef.current({ x: event.clientX - rect.left, y: event.clientY - rect.top, item: d.data });
      })
      .on('mousemove', function (event: MouseEvent) {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        setTooltipRef.current((prev) =>
          prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : prev,
        );
      })
      .on('mouseleave', function (_event, d) {
        d3.select(this)
          .attr('fill', () => {
            const c = d3.color(d.data.color);
            if (!c) return d.data.color;
            c.opacity = 0.22;
            return c.toString();
          })
          .attr('stroke-width', 1.5);
        setTooltipRef.current(null);
      });

    // Clip path
    leaf
      .append('clipPath')
      .attr('id', (_, i) => `bubble-clip-${i}`)
      .append('circle')
      .attr('r', (d) => d.r);

    // Labels
    leaf
      .append('text')
      .attr('clip-path', (_, i) => `url(#bubble-clip-${i})`)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .style('pointer-events', 'none')
      .style('font-family', 'inherit')
      .each(function (d) {
        const el = d3.select(this);
        const r = d.r;
        if (r < 14) return; // too small – skip

        // Break label into words that fit
        const words = d.data.label.split(/\s+|(?=[A-Z][a-z])|-/g).filter(Boolean);
        const fontSize = Math.min(12, Math.max(8, r / 4));
        el.style('font-size', `${fontSize}px`);

        if (r < 22) {
          const abbrev = words.map((w) => w[0]).join('').toUpperCase().slice(0, 4);
          el.append('tspan').attr('x', 0).attr('dy', 0).attr('fill', d.data.color).text(abbrev);
        } else {
          const maxChars = Math.floor((r * 1.6) / (fontSize * 0.6));
          const lines: string[] = [];
          let current = '';
          for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= maxChars) {
              current = candidate;
            } else {
              if (current) lines.push(current);
              current = word.slice(0, maxChars);
            }
          }
          if (current) lines.push(current);

          const lineHeight = fontSize * 1.2;
          const totalHeight = lines.length * lineHeight;
          lines.forEach((line, i) => {
            el.append('tspan')
              .attr('x', 0)
              .attr('dy', i === 0 ? -totalHeight / 2 + lineHeight / 2 : lineHeight)
              .attr('fill', d.data.color)
              .text(line);
          });

          if (r > 30) {
            el.append('tspan')
              .attr('x', 0)
              .attr('dy', lineHeight)
              .attr('fill', d.data.color)
              .attr('opacity', 0.7)
              .style('font-size', `${Math.max(7, fontSize - 2)}px`)
              .text(String(d.data.value));
          }
        }
      });
  }, [data, propWidth, height]);

  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No cryptographic assets to display.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Chart */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-md"
        onMouseLeave={hideTooltip}
      >
        <svg ref={svgRef} className="w-full" style={{ height }} />

        {/* React tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-50 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 8,
              transform:
                tooltip.x > (containerRef.current?.getBoundingClientRect().width ?? 0) / 2
                  ? 'translateX(-110%)'
                  : 'none',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: tooltip.item.color }}
              />
              <span className="font-semibold text-foreground">{tooltip.item.label}</span>
            </div>
            <div className="space-y-0.5 text-muted-foreground">
              <div>
                <span className="font-medium text-foreground/70">Type: </span>
                {tooltip.item.group.replace(/-/g, ' ')}
              </div>
              <div>
                <span className="font-medium text-foreground/70">Occurrences: </span>
                {tooltip.item.value}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend toggle + collapsible legend */}
      <div>
        <button
          onClick={() => setShowLegend((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors select-none"
        >
          <svg
            className={`h-3 w-3 transition-transform ${showLegend ? 'rotate-90' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {showLegend ? 'Hide legend' : 'Show legend'}
        </button>
        {showLegend && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1">
            {data.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ background: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
