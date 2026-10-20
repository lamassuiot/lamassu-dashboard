import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CryptoEngineViewer, getEngineIconStyle } from '@/components/shared/CryptoEngineViewer';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

/**
 * Square icon at the start of a CA or key card. A known crypto engine's own icon fills the
 * square (no inner padding or second frame); otherwise a neutral framed fallback icon is shown.
 */
export function EngineIconBox({ engine, fallback: Fallback }: Readonly<{ engine?: ApiCryptoEngine; fallback: LucideIcon }>) {
  if (engine) {
    return (
      <CryptoEngineViewer
        engine={engine}
        iconOnly
        className={cn('size-8 rounded-md border', getEngineIconStyle(engine.type).border)}
      />
    );
  }

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <Fallback className="size-4" />
    </div>
  );
}
