'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';

import { DateDisplay } from '@/components/shared/DateDisplay';
import { PolicyFilterBar, defaultPolicyDateFilterValue } from '@/components/shared/filters/PolicyFilterBar';
import type { GenericDateFilterValue } from '@/components/shared/filters/GenericFilterBar';
import { TableSkeleton } from '@/components/shared/PageSkeletons';
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listPolicies } from '@/lib/authz-api';
import { cn } from '@/lib/utils';
import type { DateFilterValue, Policy, PolicyFilters } from '@/types/authz';

interface PolicySelectorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Policies already held, left out of the list. */
  excludedPolicyIds: readonly string[];
  title: string;
  description: string;
  confirmLabel: (count: number) => string;
  /**
   * Called with the selection. Return the policies that could not be added: they stay selected so they can be
   * retried. Return nothing, or an empty list, to close the sheet.
   */
  onConfirm: (policies: Policy[]) => Promise<Policy[] | void> | Policy[] | void;
  /** Shown under the selection in the footer, e.g. a warning about a selected policy. */
  renderSelectionNotice?: (selected: Policy[]) => ReactNode;
}

function toApiDateFilter(filter: GenericDateFilterValue): DateFilterValue | undefined {
  if (!filter.date) return undefined;
  const date = filter.date instanceof Date ? filter.date : new Date(filter.date);
  if (Number.isNaN(date.getTime())) return undefined;
  const operator = filter.operator === 'before' ? 'before' : filter.operator === 'equal' ? 'equal' : 'after';
  return { operator, value: date.toISOString() };
}

/** Side sheet to search authz policies and pick one or more of them. */
export function PolicySelectorSheet({
  open,
  onOpenChange,
  excludedPolicyIds,
  title,
  description,
  confirmLabel,
  onConfirm,
  renderSelectionNotice,
}: PolicySelectorSheetProps) {
  const [results, setResults] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [idFilter, setIdFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [createdAtFilter, setCreatedAtFilter] = useState<GenericDateFilterValue>(defaultPolicyDateFilterValue);
  const [updatedAtFilter, setUpdatedAtFilter] = useState<GenericDateFilterValue>(defaultPolicyDateFilterValue);
  // Kept as policies, not IDs, so a selection survives a search that no longer lists it.
  const [selected, setSelected] = useState<Policy[]>([]);
  const [busy, setBusy] = useState(false);

  const filters = useMemo<PolicyFilters>(() => {
    const next: PolicyFilters = {};
    if (searchTerm.trim()) next.name = searchTerm.trim();
    if (idFilter.trim()) next.id = idFilter.trim();
    if (descriptionFilter.trim()) next.description = descriptionFilter.trim();
    const createdAt = toApiDateFilter(createdAtFilter);
    const updatedAt = toApiDateFilter(updatedAtFilter);
    if (createdAt) next.created_at = createdAt;
    if (updatedAt) next.updated_at = updatedAt;
    return next;
  }, [createdAtFilter, descriptionFilter, idFilter, searchTerm, updatedAtFilter]);

  const excludedKey = excludedPolicyIds.join('\n');
  const loadPolicies = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const result = await listPolicies({ sortBy: 'name', sortMode: 'asc', filters });
      const excluded = new Set(excludedKey ? excludedKey.split('\n') : []);
      setResults((result.list || []).filter(policy => !excluded.has(policy.id)));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [open, filters, excludedKey]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const reset = () => {
    setSearchTerm('');
    setIdFilter('');
    setDescriptionFilter('');
    setCreatedAtFilter(defaultPolicyDateFilterValue);
    setUpdatedAtFilter(defaultPolicyDateFilterValue);
    setSelected([]);
    setResults([]);
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) reset();
  };

  const toggle = (policy: Policy) =>
    setSelected(current => (current.some(p => p.id === policy.id) ? current.filter(p => p.id !== policy.id) : [...current, policy]));

  const confirm = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const failed = (await onConfirm(selected)) || [];
      if (failed.length > 0) setSelected(failed);
      else handleOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const selectedIds = new Set(selected.map(policy => policy.id));

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <ResizableSheetContent
        storageKey="assign-policy"
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-none"
      >
        <SheetHeader className="border-b px-6 py-5 shrink-0 text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="border-b px-6 py-4 shrink-0">
          <PolicyFilterBar
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            idFilter={idFilter}
            onIdFilterChange={setIdFilter}
            descriptionFilter={descriptionFilter}
            onDescriptionFilterChange={setDescriptionFilter}
            createdAtFilter={createdAtFilter}
            onCreatedAtFilterChange={setCreatedAtFilter}
            updatedAtFilter={updatedAtFilter}
            onUpdatedAtFilterChange={setUpdatedAtFilter}
            disabled={loading || busy}
          />
        </div>

        <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden px-6 py-4">
          {loading && results.length === 0 ? (
            <TableSkeleton label="Loading policies…" icon={false} columns={4} rows={4} pagination={false} />
          ) : results.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-medium">No policies found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {Object.keys(filters).length > 0 ? 'Try adjusting the filters.' : 'All available policies are already assigned or none exist yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><span className="sr-only">Selected</span></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(policy => {
                    const isSelected = selectedIds.has(policy.id);
                    return (
                      <TableRow
                        key={policy.id}
                        data-state={isSelected ? 'selected' : undefined}
                        className={cn('cursor-pointer', isSelected && 'bg-primary/5 data-[state=selected]:bg-primary/5')}
                        onClick={() => toggle(policy)}
                      >
                        <TableCell onClick={event => event.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggle(policy)}
                            aria-label={`Select ${policy.name}`}
                            disabled={busy}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className={cn('truncate', isSelected && 'text-primary')}>{policy.name}</div>
                          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{policy.id}</p>
                        </TableCell>
                        <TableCell>
                          {policy.description ? (
                            <p className="line-clamp-2 text-sm text-muted-foreground">{policy.description}</p>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DateDisplay date={policy.created_at} className="text-xs" highlightExpired={false} />
                        </TableCell>
                        <TableCell>
                          <DateDisplay date={policy.updated_at} className="text-xs" highlightExpired={false} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-4 shrink-0">
          <div className="mr-auto min-w-0 space-y-2">
            {selected.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
                <span className="font-medium">{selected.length} selected:</span>
                {selected.map(policy => (
                  <Badge key={policy.id} variant="secondary" className="max-w-[14rem]">
                    <span className="truncate">{policy.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(policy)}
                      disabled={busy}
                      aria-label={`Remove ${policy.name} from the selection`}
                      className="-mr-1 rounded-sm opacity-60 hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No policies selected.</p>
            )}
            {renderSelectionNotice?.(selected)}
          </div>
          <div className="flex shrink-0 gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={selected.length === 0 || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmLabel(selected.length)}
            </Button>
          </div>
        </SheetFooter>
      </ResizableSheetContent>
    </Sheet>
  );
}
