
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

export const CaExpiryTimeline: React.FC<CaExpiryTimelineProps> = ({ cas, allCryptoEngines }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hiddenItemsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const timelineInstance = useRef<Timeline | null>(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReadyForTimeline, setIsReadyForTimeline] = useState(false);
  const router = useRouter();
  
  const hiddenItemElements = useMemo(() => {
    // This memoized component will re-render only when `cas` or `allCryptoEngines` changes.
    // It populates the hiddenItemsRef with the rendered DOM nodes.
    return (
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', zIndex: -1 }}>
        {cas.map(ca => (
          <div
            key={`vis-item-for-${ca.id}`}
            ref={el => {
              if (el) {
                hiddenItemsRef.current.set(ca.id, el);
              } else {
                hiddenItemsRef.current.delete(ca.id);
              }
            }}
          >
            <CaVisualizerCard ca={ca} allCryptoEngines={allCryptoEngines} />
          </div>
        ))}
      </div>
    );
  }, [cas, allCryptoEngines]);

  // This effect runs after every render to check if our refs are ready.
  // It's lightweight and safer than the previous `setRenderedCount` approach.
  useEffect(() => {
    if (cas.length > 0 && hiddenItemsRef.current.size === cas.length) {
      if (!isReadyForTimeline) setIsReadyForTimeline(true);
    } else {
      if (isReadyForTimeline) setIsReadyForTimeline(false);
    }
  });


  const handleFullscreenToggle = () => {
    if (!cardRef.current) return;
    if (!document.fullscreenElement) {
      cardRef.current.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };
  
  const handleZoom = (range: '3m' | '1y' | '5y' | '10y' | '25y' | '50y') => {
    if (!timelineInstance.current) return;
    const now = new Date();
    let start: Date, end: Date;
    switch (range) {
      case '3m': start = subMonths(now, 1); end = addMonths(now, 2); break;
      case '1y': start = subMonths(now, 6); end = addMonths(now, 6); break;
      case '5y': start = subMonths(now, 30); end = addMonths(now, 30); break;
      case '10y': start = subMonths(now, 60); end = addMonths(now, 60); break;
      case '25y': start = subMonths(now, 150); end = addMonths(now, 150); break;
      case '50y': start = subMonths(now, 300); end = addMonths(now, 300); break;
    }
    timelineInstance.current.setWindow(start, end, { animation: true });
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    setTimeout(() => {
      if (timelineInstance.current) {
        timelineInstance.current.redraw();
        timelineInstance.current.fit();
      }
    }, 50); // Small delay to allow layout to settle
  }, [isFullscreen]);


  useEffect(() => {
    if (timelineRef.current) {
      const options = {
        stack: true, // Changed for better layout
        width: '100%',
        height: '100%',
        margin: { item: { vertical: 10, horizontal: 5 }, axis: 20 },
        start: subMonths(new Date(), 1),
        end: addMonths(new Date(), 3),
        zoomMin: 1000 * 60 * 60 * 24,
        zoomMax: 1000 * 60 * 60 * 24 * 365 * 50,
      };
      
      timelineInstance.current = new Timeline(timelineRef.current, new DataSet(), options);
      timelineInstance.current.addCustomTime(new Date(), 'now-marker');
      timelineInstance.current.on('select', properties => {
        if (properties.items.length > 0) router.push(`/certificate-authorities/details?caId=${properties.items[0]}`);
      });
    }
    return () => {
      timelineInstance.current?.destroy();
    };
  }, [router]);


  useEffect(() => {
    if (isReadyForTimeline && timelineInstance.current) {
      const sortedCAs = [...cas].sort((a, b) => parseISO(a.expires).getTime() - parseISO(b.expires).getTime());
      
      const itemsData = sortedCAs.map(ca => {
        const expiryDate = parseISO(ca.expires);
        const isEventExpired = isPast(expiryDate);
        let className = isEventExpired ? 'item-expired' : 'item-active';
        if (ca.status === 'revoked') className = 'item-revoked';

        const contentElement = hiddenItemsRef.current.get(ca.id);
        if (!contentElement) return null;
        
        return { id: ca.id, content: contentElement, start: expiryDate, className };
      }).filter(Boolean);

      timelineInstance.current.setItems(itemsData as any);
      timelineInstance.current.fit();
    }
  }, [isReadyForTimeline, cas, allCryptoEngines, router]);

  return (
    <>
      {hiddenItemElements}
      <Card ref={cardRef} className={cn("shadow-lg w-full bg-[--homepage-card-background] text-primary-foreground", isFullscreen && "fixed inset-0 z-50 flex flex-col")}>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl font-semibold">Certification Authority Expiry Timeline</CardTitle>
            <CardDescription className="text-primary-foreground/80">
              Visual timeline of Certification Authority expiry dates. Click an item to view details.
            </CardDescription>
          </div>
           <div className="flex items-center space-x-2">
            <div className="hidden sm:flex items-center space-x-1 rounded-md bg-primary-foreground/10 p-1">
                <Button size="sm" variant="ghost" onClick={() => handleZoom('3m')} className="h-7 px-2 text-xs text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground">3m</Button>
                <Button size="sm" variant="ghost" onClick={() => handleZoom('1y')} className="h-7 px-2 text-xs text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground">1y</Button>
                <Button size="sm" variant="ghost" onClick={() => handleZoom('5y')} className="h-7 px-2 text-xs text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground">5y</Button>
                <Button size="sm" variant="ghost" onClick={() => handleZoom('10y')} className="h-7 px-2 text-xs text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground">10y</Button>
                <Button size="sm" variant="ghost" onClick={() => handleZoom('25y')} className="h-7 px-2 text-xs text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground">25y</Button>
                <Button size="sm" variant="ghost" onClick={() => handleZoom('50y')} className="h-7 px-2 text-xs text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground">50y</Button>
            </div>
            <Button variant="ghost" size="icon" onClick={handleFullscreenToggle} className="text-primary-foreground hover:bg-primary-foreground/20 focus-visible:ring-primary-foreground">
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                <span className="sr-only">Toggle Fullscreen</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className={cn(isFullscreen && "flex-grow")}>
          <div ref={timelineRef} className={cn("w-full", isFullscreen ? "h-full" : "h-[300px]")} />
        </CardContent>
      </Card>
    </>
  );
};
