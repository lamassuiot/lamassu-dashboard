'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchAllDevicePackInventory } from '@/lib/iot-api';
import type { DevicePackWithArtifacts } from '@/types/iot';

function PackChip({ pack }: { pack: DevicePackWithArtifacts }) {
  return (
    <Badge variant="secondary" className="font-mono text-xs" title={`${pack.pack_name} v${pack.version}`}>
      {pack.pack_name} v{pack.version}
    </Badge>
  );
}

// InstalledPacksSummary is a compact, at-a-glance list of the packs a device currently has installed.
// It shows up to `inlineLimit` chips inline and collapses the rest behind a hover ("+N"). It is a
// summary (the full table lives in the device's Package Inventory tab), so it fails quietly.
export function InstalledPacksSummary({ deviceId, inlineLimit = 1 }: { deviceId: string; inlineLimit?: number }) {
  const [packs, setPacks] = useState<DevicePackWithArtifacts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError(false);
    fetchAllDevicePackInventory({ deviceId }, { signal: controller.signal })
      .then((list) => {
        if (!cancelled) setPacks(list);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deviceId]);

  if (isLoading) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  if (error) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (packs.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const inline = packs.slice(0, inlineLimit);
  const overflow = packs.slice(inlineLimit);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {inline.map((p) => (
        <PackChip key={p.id} pack={p} />
      ))}
      {overflow.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default rounded-md border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                +{overflow.length}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="mb-1 text-xs font-semibold">All installed packs ({packs.length})</p>
              <div className="flex flex-col gap-0.5">
                {packs.map((p) => (
                  <span key={p.id} className="font-mono text-xs">{p.pack_name} v{p.version}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
