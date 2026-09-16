
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CryptoEngineViewer } from './CryptoEngineViewer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { ChevronsUpDown, Loader2, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fetchCryptoEngines } from '@/lib/kms-data';

const SECURITY_LEVEL_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: 'FIPS L1', cls: 'text-sky-600 dark:text-sky-400' },
  2: { label: 'FIPS L2', cls: 'text-emerald-600 dark:text-emerald-400' },
  3: { label: 'FIPS L3', cls: 'text-violet-600 dark:text-violet-400' },
  4: { label: 'FIPS L4', cls: 'text-rose-600 dark:text-rose-400' },
};

interface CryptoEngineSelectorProps {
  value: string | undefined;
  onValueChange: (engineId: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  autoSelectDefault?: boolean;
  placeholder?: string;
  variant?: 'default' | 'compact';
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export const CryptoEngineSelector: React.FC<CryptoEngineSelectorProps> = ({
  value,
  onValueChange,
  disabled,
  className,
  id,
  autoSelectDefault = true,
  placeholder = 'Select a crypto engine…',
  variant = 'default',
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}) => {
  const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const isCompact = variant === 'compact';

  const fetchEngines = useCallback(async () => {
    setIsLoadingEngines(true);
    setErrorEngines(null);
    try {
      const data = await fetchCryptoEngines();
      setEngines(data);
      if (autoSelectDefault && !value && data.length > 0) {
        const defaultEngine = data.find(e => e.default && e.id);
        if (defaultEngine) onValueChange(defaultEngine.id);
      }
    } catch (err: any) {
      setErrorEngines(err.message || 'An unknown error occurred.');
      setEngines([]);
    } finally {
      setIsLoadingEngines(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectDefault]);

  useEffect(() => { fetchEngines(); }, [fetchEngines]);

  const selectedEngine = engines.find(e => e.id === value);
  const validEngines = engines.filter(e => e.id && e.id.trim() !== '');

  if (isLoadingEngines) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border border-transparent bg-input/50 text-sm text-muted-foreground",
          isCompact ? "h-8 px-2.5" : "h-10 px-3 py-2",
          className
        )}
      >
        <Loader2 className={cn("animate-spin", isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        <span>Loading engines…</span>
      </div>
    );
  }

  if (errorEngines) {
    if (isCompact) {
      return (
        <Button
          variant="ghost"
          onClick={fetchEngines}
          title={`${errorEngines} — click to retry`}
          className={cn(
            "h-8 w-full justify-between gap-2 bg-input/50 px-2.5 font-normal text-destructive hover:bg-input/70",
            className
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Error loading engines — retry</span>
          </span>
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        </Button>
      );
    }
    return (
      <div className={cn("flex flex-col gap-1 p-2 border rounded-2xl text-destructive border-destructive bg-destructive/10", className)}>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Error loading engines</span>
        </div>
        <p className="text-xs">{errorEngines}</p>
        <Button onClick={fetchEngines} variant="link" className="p-0 h-auto text-destructive">Try again</Button>
      </div>
    );
  }

  if (validEngines.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-transparent bg-input/50 text-sm text-muted-foreground",
          isCompact ? "h-8 px-2.5" : "h-10 px-3 py-2",
          className
        )}
      >
        No crypto engines available.
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={disabled ? undefined : setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 text-sm",
            "outline-none transition-[color,box-shadow] duration-200",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            isCompact ? "h-8 px-2.5" : "px-3 py-2",
            className
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {selectedEngine ? (
              <>
                <CryptoEngineViewer engine={selectedEngine} iconOnly className={cn("shrink-0", isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} />
                <span className="truncate font-medium">{selectedEngine.name}</span>
              </>
            ) : (
              <span className="truncate text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="pointer-events-none size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="min-w-[280px] p-1"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Select Engine
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {validEngines.map(engine => {
          const isSelected = value === engine.id;
          const secLevel = SECURITY_LEVEL_LABEL[engine.security_level];
          const provider = engine.provider || engine.type?.replace(/_/g, ' ');

          return (
            <DropdownMenuItem
              key={engine.id}
              onSelect={() => { onValueChange(engine.id); setOpen(false); }}
              className="rounded-xl px-2 py-2"
            >
              <CryptoEngineViewer engine={engine} iconOnly className="h-5 w-5 shrink-0" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium leading-none">{engine.name}</span>
                  {engine.default && (
                    <span className="inline-flex h-4 shrink-0 items-center rounded-sm bg-primary/10 px-1 text-[9px] font-bold text-primary">
                      DEFAULT
                    </span>
                  )}
                </div>
                {(provider || secLevel) && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {provider && <span className="truncate">{provider}</span>}
                    {secLevel && (
                      <>
                        <span className="opacity-30">·</span>
                        <span className={cn('shrink-0 font-medium', secLevel.cls)}>{secLevel.label}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
