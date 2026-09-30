'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { format, formatDistanceStrict, parseISO } from 'date-fns';
import { AlertTriangle, Ban, Check, CircleHelp, Eye, FilePlus2, FileText, GitBranchPlus, HardDrive, Landmark, MoreVertical, ShieldAlert, UploadCloud } from 'lucide-react';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ColumnSelector } from '@/components/ui/column-selector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { SortableTableHead } from '@/components/shared/SortableTableHead';
import { ExpandCollapseAllButton, HighlightedText, TreeNodeCell } from '@/components/shared/TreeTable';
import { caMatchesFilters, getEffectiveCaStatus, hasActiveCaFilters, type CaFilterOptions } from '@/lib/ca-utils';
import { collectParentIds, flattenTree, type TreeAccessors, type TreeTableRow } from '@/lib/tree-table';
import { useColumnVisibility, type ColumnDefinition } from '@/hooks/useColumnVisibility';
import { useSortState } from '@/hooks/useSortState';
import { useTreeCollapse } from '@/hooks/useTreeCollapse';
import { cn } from '@/lib/utils';

type SortableColumn = 'name' | 'expires';
type ColumnId = 'name' | 'status' | 'type' | 'key' | 'expires' | 'parentExpiry';

const PAGE_COLUMNS: ColumnDefinition<ColumnId>[] = [
  { id: 'name', label: 'Certification Authority', alwaysVisible: true },
  { id: 'status', label: 'Status' },
  { id: 'type', label: 'Type' },
  { id: 'key', label: 'Key' },
  { id: 'expires', label: 'Expires' },
  { id: 'parentExpiry', label: 'Expires vs. parent' },
];

// Pickers live in dialogs and drawers, so they start with a narrower set of columns.
const PICKER_HIDDEN_BY_DEFAULT: ReadonlySet<ColumnId> = new Set(['type', 'parentExpiry']);
const PICKER_COLUMNS: ColumnDefinition<ColumnId>[] = PAGE_COLUMNS.map((column) => ({
  ...column,
  defaultVisible: !PICKER_HIDDEN_BY_DEFAULT.has(column.id),
}));

const CA_TREE: TreeAccessors<CA> = {
  getId: (ca) => ca.id,
  getChildren: (ca) => ca.children,
};

const CA_TYPES: Record<string, { label: string; icon: React.ElementType }> = {
  MANAGED: { label: 'Managed', icon: Landmark },
  IMPORTED_WITH_KEY: { label: 'Imported with key', icon: UploadCloud },
  IMPORTED_WITHOUT_KEY: { label: 'Imported without key', icon: UploadCloud },
  IMPORTED: { label: 'Imported', icon: UploadCloud },
  EXTERNAL_PUBLIC: { label: 'External public', icon: FileText },
};

interface CaTableViewProps {
  /** CA forest, already pruned by `filterCaList` (ancestors of matches are kept). */
  cas: CA[];
  allCryptoEngines: ApiCryptoEngine[];
  filters?: CaFilterOptions;
  /**
   * Turns the table into a single-select picker: clicking a row (or Enter/Space on it) selects it,
   * and the name links and actions menu are replaced so a picker never navigates away on its own.
   */
  onSelect?: (ca: CA) => void;
  selectedCaId?: string | null;
}

const NO_FILTERS: CaFilterOptions = {};

function countNodes(cas: readonly CA[]): number {
  return cas.reduce((total, ca) => total + 1 + countNodes(ca.children ?? []), 0);
}

/** Maps each CA id to its parent within the given forest. */
function buildParentMap(cas: readonly CA[]): Map<string, CA> {
  const parents = new Map<string, CA>();
  const walk = (ca: CA) => ca.children?.forEach((child) => {
    parents.set(child.id, ca);
    walk(child);
  });
  cas.forEach(walk);
  return parents;
}

type DisplayStatus = 'REVOKED' | 'EXPIRED' | 'UNKNOWN' | 'ACTIVE';

const caDetailsHref = (ca: CA) => `/certificate-authorities/details?caId=${ca.id}`;

// Same effective status the filters use, so a row never shows one status and filters as another.
function getDisplayStatus(ca: CA): DisplayStatus {
  return getEffectiveCaStatus(ca).toUpperCase() as DisplayStatus;
}

function CaIcon({ status, engine }: Readonly<{ status: DisplayStatus; engine?: ApiCryptoEngine }>) {
  if (status === 'REVOKED') return <Ban className="h-4 w-4 shrink-0 text-destructive" />;
  if (status === 'EXPIRED') return <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />;
  if (status === 'UNKNOWN') return <CircleHelp className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (engine) return <CryptoEngineViewer engine={engine} iconOnly className="h-4 w-4 shrink-0" />;
  return <HardDrive className="h-4 w-4 shrink-0 text-primary" />;
}

function TypeCell({ caType }: Readonly<{ caType?: string }>) {
  const type = caType ? CA_TYPES[caType] : undefined;
  if (!type) return <span className="text-xs text-muted-foreground">{caType ?? '—'}</span>;
  const Icon = type.icon;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {type.label}
    </span>
  );
}

/**
 * How long before its parent a CA expires. A CA that outlives its parent is flagged: once the
 * parent expires the chain no longer validates, so the extra validity is unusable.
 */
function ParentExpiryCell({ ca, parent }: Readonly<{ ca: CA; parent?: CA }>) {
  if (!parent) {
    return ca.issuer === 'Self-signed'
      ? <span className="text-xs text-muted-foreground">Root</span>
      : <span className="text-xs text-muted-foreground" title="The parent CA is not part of this list.">—</span>;
  }

  const childExpiry = parseISO(ca.expires);
  const parentExpiry = parseISO(parent.expires);
  const diffMs = parentExpiry.getTime() - childExpiry.getTime();
  const distance = formatDistanceStrict(childExpiry, parentExpiry);

  let content: React.ReactNode;
  if (diffMs > 0) {
    content = <span className="text-xs text-muted-foreground">{distance} before parent</span>;
  } else if (diffMs < 0) {
    content = (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {distance} after parent
      </span>
    );
  } else {
    content = <span className="text-xs text-muted-foreground">Same as parent</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{content}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>Parent {parent.name} expires {format(parentExpiry, 'PP')}.</p>
        {diffMs < 0 && <p className="mt-1">This CA outlives its parent. Its chain stops validating when the parent expires.</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function KeyCell({ keyAlgorithm, engine }: Readonly<{ keyAlgorithm?: string; engine?: ApiCryptoEngine }>) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="truncate text-sm">{keyAlgorithm || '—'}</p>
      {engine && (
        <p className="truncate text-xs text-muted-foreground">{engine.name || engine.type}</p>
      )}
    </div>
  );
}

function CaActionsMenu({ ca, status }: Readonly<{ ca: CA; status: DisplayStatus }>) {
  const canIssue = status !== 'REVOKED' && ca.caType !== 'EXTERNAL_PUBLIC';
  // Mirrors the parent checks on the create CA page.
  const canCreateSubCa = status === 'ACTIVE' && ca.caType !== 'EXTERNAL_PUBLIC';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${ca.name}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={caDetailsHref(ca)}>
            <Eye className="mr-2 h-4 w-4" /> View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!canIssue}>
          <Link href={`/certificate-authorities/issue-certificate?caId=${ca.id}`}>
            <FilePlus2 className="mr-2 h-4 w-4" /> Issue Certificate
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!canCreateSubCa}>
          <Link href={`/certificate-authorities/new/generate?parentCaId=${ca.id}`}>
            <GitBranchPlus className="mr-2 h-4 w-4" /> Create Sub-CA
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CaNameProps {
  ca: CA;
  status: DisplayStatus;
  engine?: ApiCryptoEngine;
  query: string;
  /** Pickers render plain text so selecting a CA never navigates away. */
  asLink: boolean;
  isSelected: boolean;
}

function CaName({ ca, status, engine, query, asLink, isSelected }: Readonly<CaNameProps>) {
  const childCount = ca.children?.length ?? 0;
  const subject = [ca.subjectDN?.common_name, ca.subjectDN?.organization].filter(Boolean).join(' · ');
  const nameClassName = cn('truncate font-medium', status !== 'ACTIVE' && 'text-muted-foreground', isSelected && 'text-primary');
  const name = <HighlightedText text={ca.name} query={query} />;

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <CaIcon status={status} engine={engine} />
        {asLink ? (
          <Link href={caDetailsHref(ca)} className={cn(nameClassName, 'hover:underline')}>{name}</Link>
        ) : (
          <span className={nameClassName}>{name}</span>
        )}
        {childCount > 0 && (
          <Badge variant="secondary">{childCount} sub-CA{childCount === 1 ? '' : 's'}</Badge>
        )}
      </div>
      {subject && (
        <p className="mt-0.5 line-clamp-1 max-w-xl text-xs text-muted-foreground" title={subject}>
          {subject}
        </p>
      )}
    </>
  );
}

interface CaTableRowProps {
  row: TreeTableRow<CA>;
  engine?: ApiCryptoEngine;
  parent?: CA;
  isVisible: (column: ColumnId) => boolean;
  query: string;
  isFiltering: boolean;
  isCollapsed: boolean;
  onToggle: (caId: string) => void;
  onSelect?: (ca: CA) => void;
  isSelected: boolean;
}

function CaTableRow({ row, engine, parent, isVisible, query, isFiltering, isCollapsed, onToggle, onSelect, isSelected }: Readonly<CaTableRowProps>) {
  const { node: ca, level, matches, hasVisibleChildren } = row;
  const status = getDisplayStatus(ca);
  const isPicker = Boolean(onSelect);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (onSelect && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect(ca);
    }
  };

  let lastCell: React.ReactNode = <CaActionsMenu ca={ca} status={status} />;
  if (isPicker) {
    lastCell = isSelected ? <Check className="ml-auto h-4 w-4 text-primary" aria-label="Selected" /> : null;
  }

  return (
    <TableRow
      // Expand toggles carry aria-expanded, which would otherwise keep every parent row highlighted.
      className={cn(
        'has-aria-expanded:bg-transparent',
        !matches && 'opacity-60',
        isPicker && 'cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none',
        isSelected && 'bg-primary/10 hover:bg-primary/15 has-aria-expanded:bg-primary/10',
      )}
      onClick={onSelect ? () => onSelect(ca) : undefined}
      onKeyDown={isPicker ? handleKeyDown : undefined}
      tabIndex={isPicker ? 0 : undefined}
      aria-selected={isPicker ? isSelected : undefined}
    >
      <TableCell>
        <TreeNodeCell
          level={level}
          label={ca.name}
          hasChildren={hasVisibleChildren}
          isCollapsed={isCollapsed}
          onToggle={() => onToggle(ca.id)}
          toggleDisabled={isFiltering}
        >
          <CaName ca={ca} status={status} engine={engine} query={query} asLink={!isPicker} isSelected={isSelected} />
        </TreeNodeCell>
      </TableCell>
      {isVisible('status') && (
        <TableCell>
          <ApiStatusBadge status={status} />
        </TableCell>
      )}
      {isVisible('type') && (
        <TableCell>
          <TypeCell caType={ca.caType} />
        </TableCell>
      )}
      {isVisible('key') && (
        <TableCell className="max-w-0">
          <KeyCell keyAlgorithm={ca.keyAlgorithm} engine={engine} />
        </TableCell>
      )}
      {isVisible('expires') && (
        <TableCell>
          <DateDisplay date={ca.expires} className="text-xs" relativeClassName="text-xs" />
        </TableCell>
      )}
      {isVisible('parentExpiry') && (
        <TableCell>
          <ParentExpiryCell ca={ca} parent={parent} />
        </TableCell>
      )}
      <TableCell className="text-right">{lastCell}</TableCell>
    </TableRow>
  );
}

export function CaTableView({ cas, allCryptoEngines, filters = NO_FILTERS, onSelect, selectedCaId }: Readonly<CaTableViewProps>) {
  const isPicker = Boolean(onSelect);
  const { sortColumn, sortDirection, requestSort } = useSortState<SortableColumn>('name', ['expires']);
  const parentIds = useMemo(() => collectParentIds(cas, CA_TREE), [cas]);
  const { collapsedIds, toggle, allCollapsed, toggleAll } = useTreeCollapse(parentIds);
  const { isVisible, toggle: toggleColumn, columns } = useColumnVisibility(
    isPicker ? PICKER_COLUMNS : PAGE_COLUMNS,
    isPicker ? 'lamassu.caPicker.columns' : 'lamassu.caTable.columns',
  );

  const isFiltering = hasActiveCaFilters(filters);
  const query = (filters.filterText ?? '').trim().toLowerCase();
  const parentById = useMemo(() => buildParentMap(cas), [cas]);
  const enginesById = useMemo(() => new Map(allCryptoEngines.map((engine) => [engine.id, engine])), [allCryptoEngines]);

  const rows = useMemo(() => {
    const factor = sortDirection === 'asc' ? 1 : -1;
    return flattenTree(cas, {
      ...CA_TREE,
      collapsedIds,
      isMatch: isFiltering ? (ca: CA) => caMatchesFilters(ca, filters) : undefined,
      compare: (a, b) =>
        sortColumn === 'expires'
          ? (parseISO(a.expires).getTime() - parseISO(b.expires).getTime()) * factor
          : a.name.localeCompare(b.name) * factor,
    });
  }, [cas, collapsedIds, isFiltering, filters, sortColumn, sortDirection]);

  const total = countNodes(cas);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground">
          {total} CA{total === 1 ? '' : 's'}
          {cas.length !== total && <> · {cas.length} top-level</>}
        </p>
        {parentIds.size > 0 && (
          <ExpandCollapseAllButton allCollapsed={allCollapsed} onToggle={toggleAll} disabled={isFiltering} />
        )}
        <ColumnSelector columns={columns} onColumnToggle={toggleColumn} />
      </div>

      <TooltipProvider>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="name" title="Certification Authority" activeColumn={sortColumn} direction={sortDirection} onSort={requestSort} align="left" className="min-w-[300px]" />
              {isVisible('status') && <TableHead className="w-[110px]">Status</TableHead>}
              {isVisible('type') && <TableHead className="w-[170px]">Type</TableHead>}
              {isVisible('key') && <TableHead className="w-[180px]">Key</TableHead>}
              {isVisible('expires') && (
                <SortableTableHead column="expires" title="Expires" activeColumn={sortColumn} direction={sortDirection} onSort={requestSort} align="left" isDateColumn className="w-[160px]" />
              )}
              {isVisible('parentExpiry') && <TableHead className="w-[190px]">Expires vs. parent</TableHead>}
              <TableHead className="w-[60px] text-right"><span className="sr-only">{isPicker ? 'Selected' : 'Actions'}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <CaTableRow
                key={row.node.id}
                row={row}
                engine={row.node.kmsKeyId ? enginesById.get(row.node.kmsKeyId) : undefined}
                parent={parentById.get(row.node.id)}
                isVisible={isVisible}
                query={query}
                isFiltering={isFiltering}
                isCollapsed={!isFiltering && collapsedIds.has(row.node.id)}
                onToggle={toggle}
                onSelect={onSelect}
                isSelected={isPicker && row.node.id === selectedCaId}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>
    </div>
  );
}
