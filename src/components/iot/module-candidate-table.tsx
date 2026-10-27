'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package } from 'lucide-react';
import { cn, truncateText } from '@/lib/utils';
import type { ReusableSoftwareModule } from '@/types/iot';

/** A candidate's stable row key: its id where the backend assigned one, else where it is defined. */
export function moduleCandidateId(c: ReusableSoftwareModule): string {
  return c.id || `${c.source_group_id}/${c.source_distribution_set_name}@${c.source_distribution_set_version}:${c.key}`;
}

interface ModuleCandidateTableProps {
  candidates: ReusableSoftwareModule[];
  // The group the picker is used from: a candidate's source group is only shown when it differs.
  groupId?: string;
  // Group id → display name. A candidate's source group is shown by name where one is known (the id
  // goes in the tooltip) and by its raw id otherwise.
  groupNames?: ReadonlyMap<string, string>;
  // Per-row action column (the set page's Link/Copy button).
  renderAction?: (candidate: ReusableSoftwareModule, id: string) => React.ReactNode;
  // Checklist mode (the create form): the whole row toggles its checkbox. checkDisabledReason greys
  // out an unchecked row the composition could not take, and the reason becomes its tooltip.
  checkedIds?: ReadonlySet<string>;
  onToggle?: (candidate: ReusableSoftwareModule) => void;
  checkDisabledReason?: (candidate: ReusableSoftwareModule) => string | undefined;
}

// The filterable module table shared by the set page's "Link a built software module" dialog and the
// create-set form's first-module field, so picking a module looks and works the same in both.
//
// Narrowed client-side because the endpoints offer no query of their own. Matching the SOURCE PACK
// as well as the module's own name/type matters: an operator usually remembers where a module came
// from ("the one from water-panel") rather than its exact name. The query lives here, so it starts
// empty every time the table mounts — a query left over from last time would silently hide most of
// the list.
export function ModuleCandidateTable({ candidates, groupId, groupNames, renderAction, checkedIds, onToggle, checkDisabledReason }: ModuleCandidateTableProps) {
  const [query, setQuery] = React.useState('');
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.name, c.type, c.version, c.source_distribution_set_name, c.source_distribution_set_version, c.source_group_id, groupNames?.get(c.source_group_id)]
        .some((f) => String(f ?? '').toLowerCase().includes(q))
    );
  }, [candidates, query, groupNames]);
  const selectable = Boolean(onToggle);
  const columns = (renderAction ? 1 : 0) + (selectable ? 1 : 0) + 3;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by module, type, version or source set…"
          aria-label="Filter software modules"
        />
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {visible.length === candidates.length ? `${candidates.length} available` : `${visible.length} of ${candidates.length}`}
        </span>
      </div>

      <div className="max-h-80 min-w-0 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && <TableHead className="w-px" />}
              {renderAction && <TableHead className="w-px">Action</TableHead>}
              <TableHead>Module</TableHead>
              <TableHead>Defined on</TableHead>
              <TableHead>Artifacts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns} className="h-20 text-center text-sm text-muted-foreground">
                  No module matches “{query}”.
                </TableCell>
              </TableRow>
            ) : null}
            {visible.map((c) => {
              const id = moduleCandidateId(c);
              const checked = selectable && Boolean(checkedIds?.has(id));
              // Only an unchecked row is ever blocked: unchecking is always allowed.
              const blockedReason = selectable && !checked ? checkDisabledReason?.(c) : undefined;
              const toggle = onToggle && !blockedReason ? () => onToggle(c) : undefined;
              return (
                <TableRow
                  key={id}
                  onClick={toggle}
                  onKeyDown={toggle ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
                  } : undefined}
                  tabIndex={selectable && !blockedReason ? 0 : undefined}
                  role={selectable ? 'checkbox' : undefined}
                  aria-checked={selectable ? checked : undefined}
                  aria-disabled={blockedReason ? true : undefined}
                  title={blockedReason}
                  data-state={checked ? 'selected' : undefined}
                  className={cn(selectable && (blockedReason ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'))}
                >
                  {selectable && (
                    <TableCell>
                      {/* Display only: the row owns the click, so the box must not toggle a second time. */}
                      <Checkbox checked={checked} disabled={Boolean(blockedReason)} tabIndex={-1} aria-hidden className="pointer-events-none" />
                    </TableCell>
                  )}
                  {renderAction && <TableCell className="whitespace-nowrap">{renderAction(c, id)}</TableCell>}
                  <TableCell className="whitespace-normal font-medium [overflow-wrap:anywhere]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{c.name}</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {c.type}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">v{c.version}</span>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-56 max-w-72 whitespace-normal [overflow-wrap:anywhere] text-sm">
                    {c.source_distribution_set_name || 'Module catalog'}
                    <span className="text-muted-foreground"> v{c.source_distribution_set_version || c.version}</span>
                    {/* The source group is only worth showing when it differs — otherwise it
                        is the group already in the page's own context. */}
                    {c.source_group_id && c.source_group_id !== groupId ? (
                      groupNames?.get(c.source_group_id) ? (
                        <div className="text-xs leading-tight text-muted-foreground" title={`${groupNames.get(c.source_group_id)} (${c.source_group_id})`}>
                          group {truncateText(groupNames.get(c.source_group_id), 48)}
                        </div>
                      ) : (
                        <div className="font-mono text-[11px] leading-tight text-muted-foreground">group {c.source_group_id}</div>
                      )
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(c.artifacts?.length ?? 0) === 0 ? <span className="text-muted-foreground">None</span> : c.artifacts.length}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
