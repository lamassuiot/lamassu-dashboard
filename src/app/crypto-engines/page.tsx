'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { SortableTableHead } from '@/components/shared/SortableTableHead';
import { MetadataViewerModal } from '@/components/shared/MetadataViewerModal';
import {
  Cpu,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

type SortableColumn = 'name' | 'type' | 'provider' | 'security_level';
type SortDirection = 'asc' | 'desc';
interface SortConfig { column: SortableColumn; direction: SortDirection }

const MAX_VISIBLE_KEY_TYPES = 4;

const formatEngineType = (type: string) => type.replaceAll('_', ' ');

const getSecurityLevelBadgeVariant = (level: number): BadgeVariant => {
  if (level <= 1) return 'warning';
  if (level === 2) return 'info';
  return 'success';
};

const getKeyTypeChips = (engine: ApiCryptoEngine): string[] =>
  engine.supported_key_types?.flatMap(kt => kt.sizes.map(size => `${kt.type} ${size}`)) ?? [];

const getProviderLabel = (engine: ApiCryptoEngine): string =>
  engine.provider?.trim() || formatEngineType(engine.type);

const compareEngines = (a: ApiCryptoEngine, b: ApiCryptoEngine, { column, direction }: SortConfig): number => {
  let result: number;
  switch (column) {
    case 'security_level':
      result = a.security_level - b.security_level;
      break;
    case 'type':
      result = formatEngineType(a.type).localeCompare(formatEngineType(b.type));
      break;
    case 'provider':
      result = getProviderLabel(a).localeCompare(getProviderLabel(b));
      break;
    default:
      result = a.name.localeCompare(b.name);
  }
  if (result === 0) result = a.name.localeCompare(b.name);
  return direction === 'asc' ? result : -result;
};

const KeyTypeChips: React.FC<{ chips: string[] }> = ({ chips }) => {
  if (chips.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const visible = chips.slice(0, MAX_VISIBLE_KEY_TYPES);
  const hidden = chips.slice(MAX_VISIBLE_KEY_TYPES);
  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {visible.map(chip => (
        <Badge key={chip} variant="secondary" className="font-mono">
          {chip}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Badge variant="secondary" asChild>
              <button
                type="button"
                className="cursor-pointer hover:bg-muted/70"
                aria-label={`Show ${hidden.length} more key types`}
              >
                +{hidden.length}
              </button>
            </Badge>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-xs p-2">
            <div className="flex flex-wrap gap-1">
              {hidden.map(chip => (
                <Badge key={chip} variant="secondary" className="font-mono">
                  {chip}
                </Badge>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default function CryptoEnginesPage() {
  const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'name', direction: 'asc' });
  const [metadataEngine, setMetadataEngine] = useState<ApiCryptoEngine | null>(null);

  const fetchEngines = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setEngines(await fetchCryptoEngines());
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
      setEngines([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchEngines(); }, [fetchEngines]);

  const visibleEngines = useMemo(() => {
    // Default engine is always pinned to the top, regardless of sort
    return [...engines].sort((a, b) => {
      if (a.default !== b.default) return a.default ? -1 : 1;
      return compareEngines(a, b, sortConfig);
    });
  }, [engines, sortConfig]);

  const requestSort = (column: SortableColumn) => {
    setSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  if (isLoading && engines.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading crypto engines…
        </div>
      </div>
    );
  }

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Crypto Engines' }]} className="w-full space-y-6 pb-8">

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <Cpu className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-headline font-semibold">Crypto Engines</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configured engines for key management, signing operations, and PKI workflows.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={fetchEngines} disabled={isLoading} className="shrink-0">
          <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" onClick={fetchEngines} className="ml-1 h-auto p-0">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {!error && visibleEngines.length === 0 ? (
        <div className="mt-6 rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">No Crypto Engines Found</h3>
          <p className="text-sm text-muted-foreground">No cryptographic engines are currently configured.</p>
        </div>
      ) : !error && (
        <div className={cn('space-y-2', isLoading && 'pointer-events-none opacity-50')}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    column="name"
                    title="Engine"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                  />
                  <TableHead className="text-center">Default</TableHead>
                  <SortableTableHead
                    column="type"
                    title="Type"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                  />
                  <SortableTableHead
                    column="provider"
                    title="Provider"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                    className="hidden md:table-cell"
                  />
                  <SortableTableHead
                    column="security_level"
                    title="Security"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    isDateColumn // numeric sort icons
                  />
                  <TableHead>Supported Keys</TableHead>
                  <TableHead className="text-right">Metadata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEngines.map(engine => {
                  const metadataCount = Object.keys(engine.metadata ?? {}).length;
                  return (
                    <TableRow key={engine.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <CryptoEngineViewer engine={engine} iconOnly className="h-8 w-8 shrink-0" />
                          <div className="min-w-0">
                            <span className="block truncate font-medium">{engine.name}</span>
                            <code className="block max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={engine.id}>
                              {engine.id}
                            </code>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {engine.default ? (
                          <Badge>Default</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {formatEngineType(engine.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {getProviderLabel(engine)}
                      </TableCell>
                      <TableCell className="text-center">
                        {engine.security_level > 0 ? (
                          <Badge variant={getSecurityLevelBadgeVariant(engine.security_level)}>
                            FIPS L{engine.security_level}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <KeyTypeChips chips={getKeyTypeChips(engine)} />
                      </TableCell>
                      <TableCell className="text-right">
                        {metadataCount > 0 ? (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMetadataEngine(engine)}>
                            View ({metadataCount})
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {engines.length} engine{engines.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

      <MetadataViewerModal
        isOpen={metadataEngine !== null}
        onOpenChange={open => { if (!open) setMetadataEngine(null); }}
        title={`Metadata: ${metadataEngine?.name ?? ''}`}
        description="Engine-specific configuration reported by the KMS."
        data={metadataEngine?.metadata ?? null}
      />

    </BreadcrumbPage>
  );
}
