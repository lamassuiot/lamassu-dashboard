'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { CA } from '@/lib/ca-data';
import { useRouter } from '@/lib/router';
import { DataSet } from "vis-data/esnext";
import { Timeline } from "vis-timeline/esnext";
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import { addMonths, format, formatDistanceToNowStrict, isPast, subMonths } from 'date-fns';
import { CaCard } from '@/components/ca/CaCard';
import { parseCaExpiry } from '@/lib/ca-utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaExpiryTimelineProps {
  cas: CA[];
  allCryptoEngines: ApiCryptoEngine[];
}

// vis-timeline implements setCustomTimeMarker on Timeline but its typings only declare it on Graph2d.
type TimelineWithMarker = Timeline & {
  setCustomTimeMarker: (title: string, id?: string, editable?: boolean) => void;
};

interface Expiry {
  time: number;
  name: string;
}

/** CAs outside the visible window: how many on each side, and the nearest one beyond each edge. */
interface Offscreen {
  before: number;
  after: number;
  nextBefore: Expiry | null;
  nextAfter: Expiry | null;
}

const NO_OFFSCREEN: Offscreen = { before: 0, after: 0, nextBefore: null, nextAfter: null };

const ZOOM_RANGES = ['3m', '1y', '5y', '10y', '25y', '50y'] as const;
type ZoomRange = typeof ZOOM_RANGES[number];

const legend = [
  { label: 'Active',  color: 'bg-primary' },
  { label: 'Expired', color: 'bg-orange-400' },
  { label: 'Revoked', color: 'bg-destructive' },
];

/** Edge button shown when CAs lie outside the visible range; jumps to the nearest one. */
function OffscreenButton({ side, count, next, onClick }: Readonly<{
  side: 'before' | 'after'; count: number; next: Expiry | null; onClick: () => void;
}>) {
  const Icon = side === 'before' ? ChevronLeft : ChevronRight;
  const label = `${count} more ${count === 1 ? 'CA' : 'CAs'} ${side} this range`;
  const distance = next ? formatDistanceToNowStrict(next.time, { addSuffix: true }) : null;
  const title = next
    ? `${label}. Nearest: ${next.name}, expires ${format(next.time, 'yyyy-MM-dd')} (${distance}). Click to jump to it.`
    : label;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      title={title}
      aria-label={next ? `${label}; nearest expires ${distance}` : label}
      className={cn(
        'absolute top-1/2 z-20 h-8 -translate-y-1/2 gap-1 rounded-full border-primary/40 bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))] text-xs tabular-nums text-primary shadow-sm hover:border-primary hover:bg-primary hover:text-primary-foreground dark:bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))] dark:hover:bg-primary',
        side === 'before' ? 'left-2 pl-1.5 pr-3' : 'right-2 pl-3 pr-1.5',
      )}
    >
      {side === 'before' ? (
        <>
          <Icon className="h-4 w-4 shrink-0" />
          <span className="font-semibold">{count}</span>
          {distance && <span className="font-normal opacity-80">· {distance}</span>}
        </>
      ) : (
        <>
          {distance && <span className="font-normal opacity-80">{distance} ·</span>}
          <span className="font-semibold">{count}</span>
          <Icon className="h-4 w-4 shrink-0" />
        </>
      )}
    </Button>
  );
}

export const CaExpiryTimeline: React.FC<CaExpiryTimelineProps> = ({ cas, allCryptoEngines }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const cardRef     = useRef<HTMLDivElement>(null);
  const instance    = useRef<Timeline | null>(null);
  const router      = useRouter();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeZoom,   setActiveZoom]   = useState<ZoomRange>('5y');
  const [offscreen, setOffscreen] = useState<Offscreen>(NO_OFFSCREEN);
  const expiriesRef = useRef<Expiry[]>([]); // sorted by time

  const updateOffscreen = useCallback(() => {
    const tl = instance.current;
    if (!tl) return;
    const { start, end } = tl.getWindow();
    const next: Offscreen = { ...NO_OFFSCREEN };
    for (const expiry of expiriesRef.current) {
      if (expiry.time < start.getTime()) {
        next.before++;
        next.nextBefore = expiry; // sorted ascending, so the last one is the nearest to the window
      } else if (expiry.time > end.getTime()) {
        next.after++;
        next.nextAfter ??= expiry;
      }
    }
    setOffscreen(prev => (
      prev.before === next.before && prev.after === next.after
      && prev.nextBefore === next.nextBefore && prev.nextAfter === next.nextAfter
        ? prev
        : next
    ));
  }, []);

  /* ── Fullscreen listener ── */
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ── Redraw after fullscreen toggle ── */
  useEffect(() => {
    const t = setTimeout(() => {
      const tl = instance.current;
      const el = timelineRef.current;
      if (!tl || !el) return;
      const h = el.parentElement?.clientHeight ?? 0;
      if (h > 0) tl.setOptions({ height: `${h}px` });
      tl.redraw();
    }, 80);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  /* ── Initialise vis-timeline once ── */
  useEffect(() => {
    if (!timelineRef.current) return;
    instance.current = new Timeline(timelineRef.current, new DataSet(), {
      type:            'box',
      stack:           true,
      width:           '100%',
      height:          '340px',
      autoResize:      true,
      margin:          { item: { vertical: 8, horizontal: 4 }, axis: 16 },
      start:           subMonths(new Date(), 30),
      end:             addMonths(new Date(), 30),
      zoomMin:         1000 * 60 * 60 * 24,
      zoomMax:         1000 * 60 * 60 * 24 * 365 * 100,
      showCurrentTime: false,
    });
    const now = new Date();
    const timeline = instance.current as TimelineWithMarker;
    timeline.addCustomTime(now, 'now-marker');
    timeline.setCustomTimeMarker('Today', 'now-marker', false);
    timeline.setCustomTimeTitle(`Today · ${format(now, 'yyyy-MM-dd')}`, 'now-marker');
    instance.current.on('rangechange', updateOffscreen);
    instance.current.on('rangechanged', updateOffscreen);
    instance.current.on('select', ({ items }: { items: string[] }) => {
      if (items.length > 0) router.push(`/certificate-authorities/details?caId=${items[0]}`);
    });
    return () => { instance.current?.destroy(); };
  }, [router, updateOffscreen]);

  /* ── Push items whenever cas or engines change ── */
  useEffect(() => {
    const tl = instance.current;
    const container = timelineRef.current;
    if (!tl || !container || cas.length === 0) return;

    const roots: Root[] = [];
    const enginesById = new Map(allCryptoEngines.map(engine => [engine.id, engine]));

    const items = cas.map((ca) => {
      const expiry = parseCaExpiry(ca.expires);
      const expired = isPast(expiry);
      const cls = ca.status === 'revoked' ? 'item-revoked' : expired ? 'item-expired' : 'item-active';
      const div = document.createElement('div');
      const root = createRoot(div);
      // React renders asynchronously via the scheduler (MessageChannel).
      // vis-timeline will pick up the populated div when tl.redraw() fires below.
      root.render(
        <CaCard
          ca={ca}
          engine={ca.kmsKeyId ? enginesById.get(ca.kmsKeyId) : undefined}
          className="!shadow-none"
        />
      );
      roots.push(root);
      return { id: ca.id, content: div, start: expiry, className: cls };
    });

    expiriesRef.current = items
      .map((item, index) => ({ time: item.start.getTime(), name: cas[index].name }))
      .filter(expiry => Number.isFinite(expiry.time))
      .sort((a, b) => a.time - b.time);
    // The window is kept as is (no fit): CAs outside it are reached with the edge buttons.
    tl.setItems(new DataSet(items) as any);
    updateOffscreen();

    // After React's scheduler flushes the card renders into the divs
    // (which are now in the timeline DOM), force a full redraw so vis-timeline
    // re-measures item heights and recomputes stacking positions.
    const restackTimer = setTimeout(() => tl.redraw(), 60);

    const paintLines = () => {
      container.querySelectorAll<HTMLElement>('.vis-line, .vis-dot').forEach(el => {
        const color = el.classList.contains('item-active')  ? 'var(--color-primary)'
                    : el.classList.contains('item-expired') ? 'hsl(var(--ca-node-expired-icon-bg))'
                    : el.classList.contains('item-revoked') ? 'var(--color-destructive)'
                    : null;
        if (!color) return;
        const prop = el.classList.contains('vis-dot') ? 'border-color' : 'border-left-color';
        el.style.setProperty(prop, color, 'important');
      });
    };

    const rafId = requestAnimationFrame(paintLines);
    tl.on('rangechanged', paintLines);

    return () => {
      roots.forEach(r => r.unmount());
      clearTimeout(restackTimer);
      cancelAnimationFrame(rafId);
      tl.off('rangechanged', paintLines);
    };
  }, [cas, allCryptoEngines, updateOffscreen]);

  /* ── Zoom helper ── */
  const handleZoom = (range: ZoomRange) => {
    if (!instance.current) return;
    setActiveZoom(range);
    const now = new Date();
    const months: Record<ZoomRange, number> = { '3m': 2, '1y': 6, '5y': 30, '10y': 60, '25y': 150, '50y': 300 };
    const m = months[range];
    instance.current.setWindow(subMonths(now, m), addMonths(now, m), { animation: true });
  };

  /** Centers the nearest CA beyond the window edge, keeping the current scale. */
  const handleJump = (direction: 'before' | 'after') => {
    const tl = instance.current;
    if (!tl) return;
    const target = direction === 'after' ? offscreen.nextAfter : offscreen.nextBefore;
    if (target) tl.moveTo(new Date(target.time), { animation: true });
  };

  const handleFullscreen = () => {
    if (!cardRef.current) return;
    const fullscreenAction = document.fullscreenElement
      ? document.exitFullscreen()
      : cardRef.current.requestFullscreen();
    void fullscreenAction.catch(error => console.error('Failed to toggle fullscreen:', error));
  };

  return (
    <section ref={cardRef} className={cn('flex h-full w-full flex-col space-y-1.5', isFullscreen && 'fixed inset-0 z-50 bg-background p-4')}>

      <div className="min-w-0 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Timeline</p>
        <h2 className="text-sm font-semibold text-foreground">Certification Authority Expiry Timeline</h2>
        <p className="text-[11px] text-muted-foreground">Visual timeline of CA expiry dates. Select an item to view details.</p>
      </div>

      <div className={cn('relative overflow-hidden border-y border-border/80 bg-background', isFullscreen ? 'flex-1 min-h-0' : 'h-[340px]')}>
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col items-end gap-1.5">
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="hidden sm:flex items-center gap-px rounded-sm border border-border/80 bg-background/95 p-0.5 backdrop-blur-sm">
              {ZOOM_RANGES.map(z => (
                <button
                  key={z}
                  onClick={() => handleZoom(z)}
                  className={cn(
                    'h-6 rounded-sm px-2 text-[11px] font-medium transition-colors',
                    activeZoom === z
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {z}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" onClick={handleFullscreen} className="h-7 w-7 border border-border/80 bg-background/95 text-muted-foreground backdrop-blur-sm hover:text-foreground">
              {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
            </Button>
          </div>

          <div className="pointer-events-auto flex items-center gap-3 rounded-sm border border-border/80 bg-background/95 px-2 py-1 backdrop-blur-sm">
            {legend.map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', color)} />
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </span>
            ))}
          </div>
        </div>

        {offscreen.before > 0 && (
          <OffscreenButton side="before" count={offscreen.before} next={offscreen.nextBefore} onClick={() => handleJump('before')} />
        )}
        {offscreen.after > 0 && (
          <OffscreenButton side="after" count={offscreen.after} next={offscreen.nextAfter} onClick={() => handleJump('after')} />
        )}

        <div ref={timelineRef} className="h-full w-full" />
      </div>

    </section>
  );
};
