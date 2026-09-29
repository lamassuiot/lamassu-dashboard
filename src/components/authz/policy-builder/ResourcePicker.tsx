'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { HTTPSchemaDefinition, SchemaDefinition } from '@/types/authz';
import { cn } from '@/lib/utils';
import { WILDCARD } from './rule-model';

export type ResourceValue =
  | { kind: 'entity'; schema_name: string; entity_type: string; namespace?: string }
  | { kind: 'http'; schema: string; group?: string };

interface ResourcePickerProps {
  schemas: SchemaDefinition[];
  /** When provided, HTTP service groups are listed after the entity types. */
  httpSchemas?: Record<string, HTTPSchemaDefinition>;
  value: ResourceValue | null;
  onSelectEntity: (schema_name: string, entity_type: string, namespace?: string) => void;
  onSelectHTTP?: (schema: string, group?: string) => void;
  /** Offer an "all entities" row per namespace. */
  includeWildcard?: boolean;
  placeholder?: string;
  loading?: boolean;
  invalid?: boolean;
  id?: string;
}

const matches = (query: string, ...fields: (string | undefined)[]) =>
  !query || fields.some((f) => f?.toLowerCase().includes(query));

export function ResourcePicker({
  schemas,
  httpSchemas,
  value,
  onSelectEntity,
  onSelectHTTP,
  includeWildcard = false,
  placeholder = 'Choose a resource',
  loading = false,
  invalid = false,
  id,
}: ResourcePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  const namespaces = new Map<string, SchemaDefinition[]>();
  [...schemas]
    .sort((a, b) => a.schema_name.localeCompare(b.schema_name) || a.entity_type.localeCompare(b.entity_type))
    .forEach((s) => {
      if (!matches(q, s.entity_type, s.schema_name, s.namespace)) return;
      const ns = s.namespace || 'other';
      namespaces.set(ns, [...(namespaces.get(ns) ?? []), s]);
    });
  const namespaceEntries = [...namespaces.entries()].sort(([a], [b]) => a.localeCompare(b));

  const httpEntries = Object.entries(httpSchemas ?? {})
    .map(([key, schema]) => ({
      key,
      schema,
      groups: schema.groups.filter((g) => matches(q, schema.name, g.name)),
    }))
    .filter((e) => e.groups.length > 0);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const moveFocus = (e: KeyboardEvent, from: 'search' | 'option') => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const options = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    if (options.length === 0) return;
    if (from === 'search') {
      options[0].focus();
      return;
    }
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? index + 1 : index - 1;
    options[Math.max(0, Math.min(options.length - 1, next))].focus();
  };

  const isEntitySelected = (s: { schema_name: string; entity_type: string }) =>
    value?.kind === 'entity' && value.schema_name === s.schema_name && value.entity_type === s.entity_type;

  let triggerLabel: ReactNode = (
    <span className="text-muted-foreground">{loading ? 'Loading schemas…' : placeholder}</span>
  );
  if (value?.kind === 'entity' && value.entity_type) {
    const isWildcard = value.entity_type === WILDCARD;
    triggerLabel = (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate">
          {isWildcard ? `All ${value.namespace ?? ''} entities` : value.entity_type}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[value.namespace, isWildcard ? null : value.schema_name].filter(Boolean).join(' · ')}
        </span>
      </span>
    );
  } else if (value?.kind === 'http' && value.schema) {
    triggerLabel = (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate">{value.group ?? value.schema}</span>
        <span className="truncate text-xs text-muted-foreground">HTTP · {value.schema}</span>
      </span>
    );
  }

  const option = (key: string, selected: boolean, onClick: () => void, label: ReactNode, detail?: ReactNode) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      onKeyDown={(e) => moveFocus(e, 'option')}
      className="relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-xl py-1.5 pl-2 pr-8 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>}
      {selected && (
        <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
          <CheckIcon className="size-4" />
        </span>
      )}
    </button>
  );

  const groupHeading = (label: string) => (
    <p className="px-2 py-1 text-xs text-muted-foreground">
      {label}
    </p>
  );

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          data-invalid={invalid || undefined}
          className={cn(
            'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-left text-sm whitespace-nowrap outline-none',
            'transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
            'data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:data-invalid:border-destructive/50 dark:data-invalid:ring-destructive/40'
          )}
        >
          <span className="min-w-0 flex-1">{triggerLabel}</span>
          <CaretDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="dark w-(--radix-popover-trigger-width) min-w-72 gap-0 overflow-hidden rounded-2xl p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => moveFocus(e, 'search')}
            placeholder="Search"
            aria-label="Search resources"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1">
          {namespaceEntries.length === 0 && httpEntries.length === 0 && (
            <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
              {q ? `Nothing matches “${query}”.` : 'No resources available.'}
            </p>
          )}

          {namespaceEntries.map(([ns, items]) => (
            <div key={ns}>
              {groupHeading(ns)}
              {includeWildcard &&
                option(
                  `${ns}-*`,
                  value?.kind === 'entity' && value.entity_type === WILDCARD && value.namespace === ns,
                  () => {
                    onSelectEntity(WILDCARD, WILDCARD, ns);
                    close();
                  },
                  <span className="text-muted-foreground">All {ns} entities</span>,
                  WILDCARD
                )}
              {items.map((s) =>
                option(
                  `${s.schema_name}.${s.entity_type}`,
                  isEntitySelected(s),
                  () => {
                    onSelectEntity(s.schema_name, s.entity_type, s.namespace);
                    close();
                  },
                  s.entity_type,
                  s.schema_name
                )
              )}
            </div>
          ))}

          {onSelectHTTP &&
            httpEntries.map(({ key, schema, groups }) => (
              <div key={`http-${key}`}>
                {groupHeading(`HTTP · ${schema.name}`)}
                {groups.map((g) =>
                  option(
                    `${key}-${g.name}`,
                    value?.kind === 'http' && value.schema === schema.name && value.group === g.name,
                    () => {
                      onSelectHTTP(schema.name, g.name);
                      close();
                    },
                    g.name,
                    `${g.routes.length} ${g.routes.length === 1 ? 'route' : 'routes'}`
                  )
                )}
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
