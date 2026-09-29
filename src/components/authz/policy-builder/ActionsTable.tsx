'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EditorTable, headRowClass } from './EditorTable';
import { WILDCARD } from './rule-model';

export type ActionType = 'Atomic' | 'Global' | 'Other';

interface ActionsTableProps {
  actions: { name: string; type: ActionType }[];
  selected: string[];
  onChange: (actions: string[]) => void;
  /** Offer the `*` action, which replaces every other selection. */
  allowWildcard?: boolean;
  disabled?: boolean;
}

const TYPE_HINT: Record<ActionType, string> = {
  Atomic: 'Per instance',
  Global: 'Whole entity type',
  Other: 'Not in schema',
};

export function ActionsTable({ actions, selected, onChange, allowWildcard = false, disabled }: ActionsTableProps) {
  const isWildcard = selected.includes(WILDCARD);
  const names = actions.map((a) => a.name);
  const allSelected = names.length > 0 && names.every((n) => selected.includes(n));

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((a) => a !== name) : [...selected, name]);

  const row = (key: string, label: ReactNode, type: ReactNode, checked: boolean, onToggle: () => void, rowDisabled?: boolean) => (
    <TableRow
      key={key}
      onClick={rowDisabled ? undefined : onToggle}
      className={cn(rowDisabled ? 'opacity-50 hover:bg-transparent' : 'cursor-pointer')}
    >
      <TableCell className="font-mono">{label}</TableCell>
      <TableCell className="text-muted-foreground">{type}</TableCell>
      <TableCell className="w-12 text-right">
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          disabled={rowDisabled}
          aria-label={`Allow ${key}`}
        />
      </TableCell>
    </TableRow>
  );

  return (
    <EditorTable>
      <TableHeader>
        <TableRow className={headRowClass}>
          <TableHead>Action</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="w-12 text-right">
            {names.length > 1 && (
              <Checkbox
                checked={isWildcard || allSelected}
                onCheckedChange={(checked) =>
                  onChange(checked ? [...new Set([...selected, ...names])] : selected.filter((a) => !names.includes(a)))
                }
                disabled={disabled || isWildcard}
                aria-label="Allow all listed actions"
              />
            )}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allowWildcard &&
          row(
            WILDCARD,
            '*',
            <span className="text-xs">All actions, including future ones</span>,
            isWildcard,
            () => onChange(isWildcard ? [] : [WILDCARD]),
            disabled
          )}
        {actions.map((a) =>
          row(
            a.name,
            a.name,
            <>
              <span className="text-foreground">{a.type}</span>
              <span className="ml-2 text-xs">{TYPE_HINT[a.type]}</span>
            </>,
            isWildcard || selected.includes(a.name),
            () => toggle(a.name),
            disabled || isWildcard
          )
        )}
      </TableBody>
    </EditorTable>
  );
}
