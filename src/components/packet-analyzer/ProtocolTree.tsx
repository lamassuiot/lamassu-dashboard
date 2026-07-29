'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  ProtocolNode,
  ProtocolSelection,
} from '@/lib/packet-analyzer/types';

interface ProtocolTreeProps {
  nodes: ProtocolNode[];
  selection: ProtocolSelection | null;
  onSelect: (selection: ProtocolSelection) => void;
  onApplyFilter: (filter: string) => void;
}

interface ProtocolBranchProps extends ProtocolTreeProps {
  depth: number;
  parentKey: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}

function ProtocolBranch({
  nodes,
  depth,
  parentKey,
  expanded,
  selection,
  onToggle,
  onSelect,
  onApplyFilter,
}: ProtocolBranchProps) {
  return (
    <div className={cn(depth > 0 && 'ml-3 border-l border-border/70 pl-2')}>
      {nodes.map((node, index) => {
        const key = `${parentKey}.${index}`;
        const hasChildren = node.tree.length > 0;
        const isExpanded = expanded.has(key);
        const isSelected = selection?.key === key;

        return (
          <div key={key}>
            <div
              className={cn(
                'group flex min-w-0 items-start gap-1 rounded-md px-1 py-0.5 text-xs',
                isSelected
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted/60',
              )}
            >
              <button
                type="button"
                aria-label={isExpanded ? 'Collapse protocol' : 'Expand protocol'}
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded hover:bg-muted',
                  !hasChildren && 'invisible',
                )}
                onClick={() => hasChildren && onToggle(key)}
              >
                <ChevronRight
                  className={cn(
                    'size-3 transition-transform',
                    isExpanded && 'rotate-90',
                  )}
                />
              </button>

              <button
                type="button"
                className="min-w-0 flex-1 break-words text-left font-mono leading-5"
                title={node.label}
                onClick={() =>
                  onSelect({
                    key,
                    label: node.label,
                    dataSourceIndex: Math.max(0, node.data_source_idx),
                    start: Math.max(0, node.start),
                    length: Math.max(0, node.length),
                  })
                }
                onDoubleClick={() => {
                  if (node.filter) {
                    onApplyFilter(node.filter);
                  }
                }}
              >
                {node.label}
              </button>

              {node.filter ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title={`Apply display filter: ${node.filter}`}
                  aria-label={`Apply display filter ${node.filter}`}
                  onClick={() => onApplyFilter(node.filter)}
                >
                  <Filter />
                </Button>
              ) : null}
            </div>

            {hasChildren && isExpanded ? (
              <ProtocolBranch
                nodes={node.tree}
                depth={depth + 1}
                parentKey={key}
                expanded={expanded}
                selection={selection}
                onToggle={onToggle}
                onSelect={onSelect}
                onApplyFilter={onApplyFilter}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ProtocolTree(props: ProtocolTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpanded(new Set(props.nodes.map((_, index) => `root.${index}`)));
  }, [props.nodes]);

  const handleToggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (props.nodes.length === 0) {
    return (
      <div className="grid h-full min-h-40 place-items-center text-sm text-muted-foreground">
        No protocol details are available for this packet.
      </div>
    );
  }

  return (
    <div className="min-w-0 py-1">
      <ProtocolBranch
        {...props}
        depth={0}
        parentKey="root"
        expanded={expanded}
        onToggle={handleToggle}
      />
    </div>
  );
}
