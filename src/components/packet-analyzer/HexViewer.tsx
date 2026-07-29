'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildHexRows, decodeBase64 } from '@/lib/packet-analyzer/format';
import type {
  FrameDataSource,
  ProtocolSelection,
} from '@/lib/packet-analyzer/types';
import { cn } from '@/lib/utils';

interface HexViewerProps {
  dataSources: FrameDataSource[];
  selection: ProtocolSelection | null;
}

export function HexViewer({ dataSources, selection }: HexViewerProps) {
  const [activeSource, setActiveSource] = useState(0);

  useEffect(() => {
    if (
      selection &&
      selection.dataSourceIndex >= 0 &&
      selection.dataSourceIndex < dataSources.length
    ) {
      setActiveSource(selection.dataSourceIndex);
    }
  }, [dataSources.length, selection]);

  useEffect(() => {
    if (activeSource >= dataSources.length) {
      setActiveSource(0);
    }
  }, [activeSource, dataSources.length]);

  const decoded = useMemo(() => {
    const source = dataSources[activeSource];
    if (!source) {
      return { rows: [], error: null };
    }

    try {
      return { rows: buildHexRows(decodeBase64(source.data)), error: null };
    } catch {
      return {
        rows: [],
        error: 'The packet data source could not be decoded.',
      };
    }
  }, [activeSource, dataSources]);

  const isHighlighted = (offset: number) =>
    !!selection &&
    selection.dataSourceIndex === activeSource &&
    selection.length > 0 &&
    offset >= selection.start &&
    offset < selection.start + selection.length;

  if (dataSources.length === 0) {
    return (
      <div className="grid h-full min-h-40 place-items-center text-sm text-muted-foreground">
        No raw packet bytes are available.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">Data source</span>
          <select
            value={activeSource}
            onChange={(event) => setActiveSource(Number(event.target.value))}
            className="h-7 min-w-0 max-w-60 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {dataSources.map((source, index) => (
              <option key={`${source.name}-${index}`} value={index}>
                {source.name || `Source ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        {selection?.length ? (
          <span
            className="truncate text-xs text-muted-foreground"
            title={selection.label}
          >
            bytes {selection.start}–
            {selection.start + selection.length - 1}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-5">
        {decoded.error ? (
          <p className="text-destructive">{decoded.error}</p>
        ) : (
          <div className="min-w-[650px]">
            {decoded.rows.map((row) => (
              <div key={row.offset} className="flex">
                <span className="mr-4 w-16 shrink-0 select-none text-muted-foreground">
                  {row.offset.toString(16).padStart(8, '0')}
                </span>
                <span className="mr-5 flex w-[390px] shrink-0">
                  {row.bytes.map((byte, index) => {
                    const absoluteOffset = row.offset + index;
                    return (
                      <span
                        key={absoluteOffset}
                        className={cn(
                          'inline-block w-[23px] text-center',
                          index === 8 && 'ml-2',
                          isHighlighted(absoluteOffset) &&
                            'rounded-sm bg-primary text-primary-foreground',
                        )}
                      >
                        {byte.toString(16).padStart(2, '0')}
                      </span>
                    );
                  })}
                </span>
                <span className="shrink-0">
                  {row.ascii.map((character, index) => {
                    const absoluteOffset = row.offset + index;
                    return (
                      <span
                        key={absoluteOffset}
                        className={cn(
                          isHighlighted(absoluteOffset) &&
                            'bg-primary text-primary-foreground',
                        )}
                      >
                        {character}
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
