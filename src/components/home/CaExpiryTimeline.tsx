
'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { CA } from '@/lib/ca-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { DataSet } from "vis-data/esnext";
import { Timeline } from "vis-timeline/esnext";
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import { addMonths, isPast, parseISO, subMonths } from 'date-fns';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaExpiryTimelineProps {
  cas: CA[];
  allCryptoEngines: ApiCryptoEngine[];
}

const ZOOM_RANGES = ['3m', '1y', '5y', '10y', '25y', '50y'] as const;
type ZoomRange = typeof ZOOM_RANGES[number];

const legend = [
  { label: 'Active',  color: 'bg-primary' },
  { label: 'Expired', color: 'bg-orange-400' },
  { label: 'Revoked', color: 'bg-destructive' },
];

export const CaExpiryTimeline: React.FC<CaExpiryTimelineProps> = ({ cas, allCryptoEngines }) => {
  const timelineRef  = useRef<HTMLDivElement>(null);
  const cardRef      = useRef<HTMLDivElement>(null);
  const hiddenRef    = useRef<Map<string, HTMLDivElement>>(new Map());
  const instance     = useRef<Timeline | null>(null);
  const router       = useRouter();

  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [activeZoom,     setActiveZoom]     = useState<ZoomRange>('5y');
  const [isReady,        setIsReady]        = useState(false);

  /* ── Hidden off-screen render of each card ── */
  const hiddenElements = useMemo(() => (
    <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', zIndex: -1, pointerEvents: 'none' }}>
      {cas.map(ca => (
        <div
          key={ca.id}
          style={{ width: '200px' }}
          ref={el => { el ? hiddenRef.current.set(ca.id, el) : hiddenRef.current.delete(ca.id); }}
        >
          <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} className="!shadow-none" />
        </div>
      ))}
    </div>
  ), [cas, allCryptoEngines]);

  /* ── Readiness check (runs every render, very cheap) ── */
  useEffect(() => {
    const ready = cas.length > 0 && hiddenRef.current.size === cas.length;
    setIsReady(prev => prev !== ready ? ready : prev);
  });

  /* ── Fullscreen listener ── */
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ── Redraw after fullscreen toggle ── */
  useEffect(() => {
    const t = setTimeout(() => { instance.current?.redraw(); instance.current?.fit(); }, 60);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  /* ── Initialise vis-timeline once ── */
  useEffect(() => {
    if (!timelineRef.current) return;
    instance.current = new Timeline(timelineRef.current, new DataSet(), {
      type:   'box',
      stack:  true,
      width:  '100%',
      height: '100%',
      margin: { item: { vertical: 8, horizontal: 4 }, axis: 16 },
      start:  subMonths(new Date(), 30),
      end:    addMonths(new Date(), 30),
      zoomMin: 1000 * 60 * 60 * 24,
      zoomMax: 1000 * 60 * 60 * 24 * 365 * 100,
      showCurrentTime: false,
    });
    instance.current.addCustomTime(new Date(), 'now-marker');
    instance.current.on('select', ({ items }) => {
      if (items.length > 0) router.push(`/certificate-authorities/details?caId=${items[0]}`);
    });
    return () => { instance.current?.destroy(); };
  }, [router]);

  /* ── Push items whenever data is ready ── */
  useEffect(() => {
    if (!isReady || !instance.current) return;

    const items = [...cas]
      .sort((a, b) => parseISO(a.expires).getTime() - parseISO(b.expires).getTime())
      .map(ca => {
        const el = hiddenRef.current.get(ca.id);
        if (!el) return null;
        const expired = isPast(parseISO(ca.expires));
        const cls = ca.status === 'revoked' ? 'item-revoked' : expired ? 'item-expired' : 'item-active';
        return { id: ca.id, content: el, start: parseISO(ca.expires), className: cls };
      })
      .filter(Boolean);
    instance.current.setItems(items as any);
    instance.current.fit();

    const container = timelineRef.current;
    if (!container) return;

    const paintLines = () => {
      container.querySelectorAll<HTMLElement>('.vis-line, .vis-dot').forEach(el => {
        const color = el.classList.contains('item-active')  ? 'var(--color-primary)'
                    : el.classList.contains('item-expired') ? '#fb923c'
                    : el.classList.contains('item-revoked') ? 'var(--color-destructive)'
                    : null;
        if (!color) return;
        const prop = el.classList.contains('vis-dot') ? 'border-color' : 'border-left-color';
        el.style.setProperty(prop, color, 'important');
      });
    };

    requestAnimationFrame(paintLines);
    instance.current.on('rangechanged', paintLines);
    return () => { instance.current?.off('rangechanged', paintLines); };
  }, [isReady, cas, allCryptoEngines]);

  /* ── Zoom helper ── */
  const handleZoom = (range: ZoomRange) => {
    if (!instance.current) return;
    setActiveZoom(range);
    const now = new Date();
    const months: Record<ZoomRange, number> = { '3m': 2, '1y': 6, '5y': 30, '10y': 60, '25y': 150, '50y': 300 };
    const m = months[range];
    instance.current.setWindow(subMonths(now, m), addMonths(now, m), { animation: true });
  };

  const handleFullscreen = () => {
    if (!cardRef.current) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : cardRef.current.requestFullscreen();
  };

  return (
    <>
      {hiddenElements}
      <Card ref={cardRef} className={cn('flex h-full w-full flex-col', isFullscreen && 'fixed inset-0 z-50 rounded-none')}>

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">

            {/* Left: title + description + legend */}
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-base font-semibold">Certification Authority Expiry Timeline</CardTitle>
              <CardDescription>Visual timeline of CA expiry dates. Click an item to view details.</CardDescription>
              <div className="flex items-center gap-3 pt-0.5">
                {legend.map(({ label, color }) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', color)} />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Right: zoom + fullscreen */}
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="hidden sm:flex items-center gap-px rounded-md border border-border bg-muted/40 p-0.5">
                {ZOOM_RANGES.map(z => (
                  <button
                    key={z}
                    onClick={() => handleZoom(z)}
                    className={cn(
                      'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                      activeZoom === z
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {z}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon" onClick={handleFullscreen} className="h-7 w-7 text-muted-foreground hover:text-foreground">
                {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
              </Button>
            </div>

          </div>
        </CardHeader>

        <CardContent className={cn('flex-1 p-0', isFullscreen && 'min-h-0')}>
          <div ref={timelineRef} className={cn('w-full', isFullscreen ? 'h-full' : 'h-[340px]')} />
        </CardContent>

      </Card>
    </>
  );
};
