'use client';

import React, { useMemo } from 'react';
import Link from '@/components/shared/RouterLink';
import { Edit, Eye, FolderPlus, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { SortableTableHead } from '@/components/shared/SortableTableHead';
import { HighlightedText, TreeNodeCell } from '@/components/shared/TreeTable';
import { cn } from '@/lib/utils';
import { buildDeviceGroupTree, formatFilterCriteria, normalizeFilterCriteria, type DeviceGroupNode } from '@/lib/device-groups-utils';
import { flattenTree } from '@/lib/tree-table';
import { useDeviceGroupStats } from '@/hooks/useDeviceGroupStats';
import { useSortState } from '@/hooks/useSortState';
import type { DeviceGroup } from '@/types/device-group';
import { DeviceGroupStatusBar } from './DeviceGroupStatusBar';

type SortableColumn = 'name' | 'updated_at';

interface DeviceGroupsListProps {
  groups: DeviceGroup[];
  searchQuery: string;
  /** Group IDs whose children are hidden. */
  collapsedIds: ReadonlySet<string>;
  onToggleCollapsed: (groupId: string) => void;
  onDelete: (group: DeviceGroup) => void;
  statsRefreshKey: number;
}

function matchesQuery(group: DeviceGroup, query: string): boolean {
  return group.name.toLowerCase().includes(query) || (group.description ?? '').toLowerCase().includes(query);
}

function RulesCell({ group }: Readonly<{ group: DeviceGroup }>) {
  const rules = normalizeFilterCriteria(group.criteria ?? []);
  if (rules.length === 0) {
    return <span className="text-xs text-muted-foreground">{group.parent_id ? 'Inherits parent rules' : 'All devices'}</span>;
  }
  const [first, ...rest] = rules;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 truncate rounded-sm border bg-muted/50 px-1.5 py-0.5 text-xs" title={formatFilterCriteria(first.field, first.operand, first.value)}>
        {formatFilterCriteria(first.field, first.operand, first.value)}
      </span>
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span><Badge variant="secondary" className="cursor-default">+{rest.length}</Badge></span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <ul className="space-y-0.5">
              {rest.map((rule, i) => (
                <li key={`${rule.field}-${i}`}>AND {formatFilterCriteria(rule.field, rule.operand, rule.value)}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function DeviceCountCell({ groupId, refreshKey }: Readonly<{ groupId: string; refreshKey: number }>) {
  const { stats, isLoading, error } = useDeviceGroupStats(groupId, refreshKey);
  if (isLoading) return <Skeleton className="ml-auto h-8 w-24" />;
  if (error || !stats) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="ml-auto w-24 space-y-1 text-right">
      <p className="text-sm font-medium tabular-nums">{stats.total.toLocaleString()}</p>
      <DeviceGroupStatusBar stats={stats} />
    </div>
  );
}

export function DeviceGroupsList({
  groups,
  searchQuery,
  collapsedIds,
  onToggleCollapsed,
  onDelete,
  statsRefreshKey,
}: Readonly<DeviceGroupsListProps>) {
  const { sortColumn, sortDirection, requestSort } = useSortState<SortableColumn>('name', ['updated_at']);
  const query = searchQuery.trim().toLowerCase();

  const rows = useMemo(() => {
    const factor = sortDirection === 'asc' ? 1 : -1;
    return flattenTree(buildDeviceGroupTree(groups), {
      getId: (node) => node.id,
      getChildren: (node) => node.children,
      collapsedIds,
      isMatch: query ? (node: DeviceGroupNode) => matchesQuery(node, query) : undefined,
      compare: (a, b) =>
        sortColumn === 'updated_at'
          ? (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * factor
          : a.name.localeCompare(b.name) * factor,
    });
  }, [groups, query, collapsedIds, sortColumn, sortDirection]);

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead column="name" title="Group" activeColumn={sortColumn} direction={sortDirection} onSort={requestSort} align="left" className="min-w-[280px]" />
            <TableHead className="w-[32%]">Membership rules</TableHead>
            <TableHead className="w-[140px] text-right">Devices</TableHead>
            <SortableTableHead column="updated_at" title="Last updated" activeColumn={sortColumn} direction={sortDirection} onSort={requestSort} align="left" isDateColumn className="w-[160px]" />
            <TableHead className="w-[60px] text-right"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                No groups match &quot;{searchQuery.trim()}&quot;.
              </TableCell>
            </TableRow>
          ) : (
            rows.map(({ node, level, matches, hasVisibleChildren }) => {
              const childCount = node.children.length;
              const isCollapsed = !query && collapsedIds.has(node.id);
              return (
                <TableRow key={node.id} className={cn('has-aria-expanded:bg-transparent', !matches && 'opacity-60')}>
                  <TableCell>
                    <TreeNodeCell
                      level={level}
                      label={node.name}
                      hasChildren={hasVisibleChildren}
                      isCollapsed={isCollapsed}
                      onToggle={() => onToggleCollapsed(node.id)}
                      toggleDisabled={Boolean(query)}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link href={`/device-groups/details?groupId=${node.id}`} className="truncate font-medium hover:underline">
                          <HighlightedText text={node.name} query={query} />
                        </Link>
                        {childCount > 0 && (
                          <Badge variant="secondary">{childCount} subgroup{childCount === 1 ? '' : 's'}</Badge>
                        )}
                      </div>
                      {node.description && (
                        <p className="mt-0.5 line-clamp-1 max-w-xl text-xs text-muted-foreground" title={node.description}>
                          <HighlightedText text={node.description} query={query} />
                        </p>
                      )}
                    </TreeNodeCell>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <RulesCell group={node} />
                  </TableCell>
                  <TableCell>
                    <DeviceCountCell groupId={node.id} refreshKey={statsRefreshKey} />
                  </TableCell>
                  <TableCell>
                    <DateDisplay date={node.updated_at} className="text-xs" relativeClassName="text-xs" />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${node.name}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link href={`/device-groups/details?groupId=${node.id}`}>
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/device-groups/edit?groupId=${node.id}`}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/device-groups/new?parentId=${node.id}`}>
                            <FolderPlus className="mr-2 h-4 w-4" /> Add Subgroup
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(node)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
