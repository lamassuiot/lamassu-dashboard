'use client';

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { CryptoEngineViewer } from './CryptoEngineViewer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const SECURITY_LEVEL_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: 'FIPS L1', cls: 'text-sky-600 dark:text-sky-400' },
  2: { label: 'FIPS L2', cls: 'text-emerald-600 dark:text-emerald-400' },
  3: { label: 'FIPS L3', cls: 'text-violet-600 dark:text-violet-400' },
  4: { label: 'FIPS L4', cls: 'text-rose-600 dark:text-rose-400' },
};

interface CryptoEngineMultiSelectorProps {
  engines: ApiCryptoEngine[];
  value: string[];
  onValueChange: (engineIds: string[]) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
}

export const CryptoEngineMultiSelector: React.FC<CryptoEngineMultiSelectorProps> = ({
  engines,
  value,
  onValueChange,
  disabled,
  className,
  id,
  placeholder = 'All Engines',
}) => {
  const validEngines = engines.filter(e => e.id && e.id.trim() !== '');
  const selectedEngines = validEngines.filter(e => value.includes(e.id));

  const handleToggle = (engineId: string) => {
    onValueChange(
      value.includes(engineId)
        ? value.filter(v => v !== engineId)
        : [...value, engineId]
    );
  };

  const handleSelectAll = () => onValueChange(validEngines.map(e => e.id));
  const handleClear = () => onValueChange([]);

  const selectedNames = selectedEngines.map(e => e.name);
  const summaryLabel = selectedNames.length <= 2
    ? selectedNames.join(', ')
    : `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="ghost"
          disabled={disabled}
          title={selectedNames.length > 0 ? selectedNames.join(', ') : placeholder}
          className={cn("h-8 w-full justify-between gap-2 bg-input/50 px-2.5 font-normal hover:bg-input/70", className)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {selectedEngines.length > 0 ? (
              <>
                {selectedEngines.length === 1 && (
                  <CryptoEngineViewer engine={selectedEngines[0]} iconOnly className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{summaryLabel}</span>
              </>
            ) : (
              <span className="truncate text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="min-w-[280px] p-1" align="start" sideOffset={4}>
        <DropdownMenuLabel>Select options</DropdownMenuLabel>
        <div className="flex justify-between px-2 py-1">
          <Button variant="link" className="p-0 h-auto text-xs" onClick={handleSelectAll}>Select All</Button>
          <Button variant="link" className="p-0 h-auto text-xs" onClick={handleClear}>Clear</Button>
        </div>
        <DropdownMenuSeparator />

        {validEngines.map(engine => {
          const isSelected = value.includes(engine.id);
          const secLevel = SECURITY_LEVEL_LABEL[engine.security_level];
          const provider = engine.provider || engine.type?.replace(/_/g, ' ');

          return (
            <DropdownMenuCheckboxItem
              key={engine.id}
              checked={isSelected}
              onCheckedChange={() => handleToggle(engine.id)}
              onSelect={(e) => e.preventDefault()}
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
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
