'use client';

import React from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const INDENT_PX = 22;

/** Renders `text` with the first case-insensitive occurrence of `query` highlighted. `query` must be lowercase. */
export function HighlightedText({ text, query }: Readonly<{ text: string; query: string }>) {
  const index = query ? text.toLowerCase().indexOf(query) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

interface TreeNodeCellProps {
  level: number;
  /** Accessible name of the row, used in the expand/collapse button label. */
  label: string;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  /** Disables collapsing, e.g. while searching (every branch is forced open). */
  toggleDisabled?: boolean;
  children: React.ReactNode;
}

/** First cell of a tree-table row: indentation, expand/collapse toggle or child connector, then content. */
export function TreeNodeCell({ level, label, hasChildren, isCollapsed, onToggle, toggleDisabled, children }: Readonly<TreeNodeCellProps>) {
  return (
    <div className="flex min-w-0 items-start gap-1.5" style={{ paddingLeft: `${level * INDENT_PX}px` }}>
      {hasChildren ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={(e) => {
            // Rows may be clickable (e.g. CA pickers); expanding must not also select the row.
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
          aria-expanded={!isCollapsed}
          disabled={toggleDisabled}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground/60">
          {level > 0 && <CornerDownRight className="h-3.5 w-3.5" />}
        </span>
      )}
      <div className="min-w-0 pt-0.5">{children}</div>
    </div>
  );
}

interface ExpandCollapseAllButtonProps {
  allCollapsed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function ExpandCollapseAllButton({ allCollapsed, onToggle, disabled }: Readonly<ExpandCollapseAllButtonProps>) {
  return (
    <Button variant="ghost" size="sm" disabled={disabled} onClick={onToggle}>
      {allCollapsed ? <ChevronsUpDown className="mr-1.5 h-4 w-4" /> : <ChevronsDownUp className="mr-1.5 h-4 w-4" />}
      {allCollapsed ? 'Expand all' : 'Collapse all'}
    </Button>
  );
}
