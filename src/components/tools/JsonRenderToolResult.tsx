'use client';

import type { Spec } from '@json-render/core';
import type { ComponentRenderProps } from '@json-render/react';
import { JSONUIProvider, Renderer, useBoundProp } from '@json-render/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface JsonRenderToolResultProps {
  title?: string;
  value: unknown;
}

type JsonRenderActionHandler = (params?: Record<string, unknown>) => unknown | Promise<unknown>;

export interface JsonRenderInteractivePayload {
  spec: Spec;
  initialState?: Record<string, unknown>;
  handlers?: Record<string, JsonRenderActionHandler>;
}

type ToolSpecElement = {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
};

type CardProps = {
  title?: string | null;
  description?: string | null;
};

type StackProps = {
  direction?: 'vertical' | 'horizontal' | null;
  gap?: 'sm' | 'md' | 'lg' | null;
};

type TextBlockProps = {
  text: string;
  tone?: 'default' | 'muted' | 'danger' | null;
};

type KeyValueListProps = {
  items: Array<{ label: string; value: string }>;
};

type BadgeRowProps = {
  items: Array<{ text: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }>;
};

type DataTableProps = {
  columns: string[];
  rows: string[][];
  caption?: string | null;
};

type CodeBlockProps = {
  code: string;
};

type InputFieldProps = {
  label?: string | null;
  value?: string;
  placeholder?: string | null;
  type?: string | null;
};

type TextareaFieldProps = {
  label?: string | null;
  value?: string;
  placeholder?: string | null;
  rows?: number | null;
};

type SelectFieldProps = {
  label?: string | null;
  value?: string | null;
  placeholder?: string | null;
  options: Array<{ label: string; value: string }>;
};

type ActionButtonProps = {
  label: string;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost' | null;
};

function readProps<T>(element: ComponentRenderProps['element']) {
  return (element.props ?? {}) as T;
}

function ToolCard({ element, children }: ComponentRenderProps<CardProps>) {
  const props = readProps<CardProps>(element);

  return (
    <Card className="shadow-none">
      {props.title || props.description ? (
        <CardHeader className="px-4 py-3">
          {props.title ? <CardTitle className="text-sm">{props.title}</CardTitle> : null}
          {props.description ? (
            <CardDescription className="text-xs">{props.description}</CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn('px-4 py-3', props.title || props.description ? 'pt-0' : '')}>
        {children}
      </CardContent>
    </Card>
  );
}

function ToolStack({ element, children }: ComponentRenderProps<StackProps>) {
  const props = readProps<StackProps>(element);

  return (
    <div
      className={cn(
        'flex min-w-0',
        props.direction === 'horizontal' ? 'flex-row flex-wrap items-start' : 'flex-col',
        props.gap === 'sm' ? 'gap-2' : props.gap === 'lg' ? 'gap-4' : 'gap-3',
      )}
    >
      {children}
    </div>
  );
}

function ToolTextBlock({ element }: ComponentRenderProps<TextBlockProps>) {
  const props = readProps<TextBlockProps>(element);

  return (
    <p
      className={cn(
        'text-xs leading-5 whitespace-pre-wrap break-words',
        props.tone === 'muted'
          ? 'text-muted-foreground'
          : props.tone === 'danger'
            ? 'text-destructive'
            : 'text-foreground',
      )}
    >
      {props.text}
    </p>
  );
}

function ToolKeyValueList({ element }: ComponentRenderProps<KeyValueListProps>) {
  const props = readProps<KeyValueListProps>(element);

  return (
    <div className="grid gap-2">
      {props.items.map((item, index) => (
        <div
          className="grid gap-1 rounded-md border border-border/70 px-3 py-2 sm:grid-cols-[minmax(120px,160px)_1fr] sm:items-start sm:gap-3"
          key={`${item.label}-${index}`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="text-xs leading-5 text-foreground break-words">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function ToolBadgeRow({ element }: ComponentRenderProps<BadgeRowProps>) {
  const props = readProps<BadgeRowProps>(element);

  return (
    <div className="flex flex-wrap gap-2">
      {props.items.map((item, index) => (
        <Badge key={`${item.text}-${index}`} variant={item.variant}>
          {item.text}
        </Badge>
      ))}
    </div>
  );
}

function ToolDataTable({ element }: ComponentRenderProps<DataTableProps>) {
  const props = readProps<DataTableProps>(element);

  return (
    <Table>
      {props.caption ? <TableCaption>{props.caption}</TableCaption> : null}
      <TableHeader>
        <TableRow>
          {props.columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((row, rowIndex) => (
          <TableRow key={`row-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <TableCell className="align-top text-xs" key={`cell-${rowIndex}-${cellIndex}`}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ToolSeparator() {
  return <Separator />;
}

function ToolCodeBlock({ element }: ComponentRenderProps<CodeBlockProps>) {
  const props = readProps<CodeBlockProps>(element);

  return (
    <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-[11px] leading-5 text-foreground whitespace-pre-wrap break-words">
      {props.code}
    </pre>
  );
}

function FieldLabel({ children }: { children?: string | null }) {
  if (!children) {
    return null;
  }

  return <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function ToolInputField({ element, bindings }: ComponentRenderProps<InputFieldProps>) {
  const props = readProps<InputFieldProps>(element);
  const [value, setValue] = useBoundProp<string>(props.value ?? '', bindings?.value);

  return (
    <div className="grid gap-1.5">
      <FieldLabel>{props.label}</FieldLabel>
      <Input
        className="h-9"
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder={props.placeholder ?? undefined}
        type={props.type ?? 'text'}
        value={value ?? ''}
      />
    </div>
  );
}

function ToolTextareaField({ element, bindings }: ComponentRenderProps<TextareaFieldProps>) {
  const props = readProps<TextareaFieldProps>(element);
  const [value, setValue] = useBoundProp<string>(props.value ?? '', bindings?.value);

  return (
    <div className="grid gap-1.5">
      <FieldLabel>{props.label}</FieldLabel>
      <Textarea
        className="min-h-24"
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder={props.placeholder ?? undefined}
        rows={props.rows ?? undefined}
        value={value ?? ''}
      />
    </div>
  );
}

function ToolSelectField({ element, bindings }: ComponentRenderProps<SelectFieldProps>) {
  const props = readProps<SelectFieldProps>(element);
  const [value, setValue] = useBoundProp<string | null>(props.value ?? '', bindings?.value);

  return (
    <div className="grid gap-1.5">
      <FieldLabel>{props.label}</FieldLabel>
      <Select onValueChange={setValue} value={value ?? ''}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={props.placeholder ?? 'Select an option'} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToolActionButton({ element, on }: ComponentRenderProps<ActionButtonProps>) {
  const props = readProps<ActionButtonProps>(element);
  const press = on('press');

  return (
    <Button
      onClick={() => {
        void press.emit();
      }}
      type="button"
      variant={props.variant ?? 'default'}
    >
      {props.label}
    </Button>
  );
}

const registry = {
  Card: ToolCard,
  Stack: ToolStack,
  TextBlock: ToolTextBlock,
  KeyValueList: ToolKeyValueList,
  BadgeRow: ToolBadgeRow,
  DataTable: ToolDataTable,
  Separator: ToolSeparator,
  CodeBlock: ToolCodeBlock,
  InputField: ToolInputField,
  TextareaField: ToolTextareaField,
  SelectField: ToolSelectField,
  ActionButton: ToolActionButton,
};

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toDisplayString(value: unknown) {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isScalar(value: unknown) {
  return value === null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value);
}

function getBadgeVariant(key: string, value: string) {
  const normalizedKey = key.toLowerCase();
  const normalizedValue = value.toLowerCase();

  if (
    normalizedKey.includes('error') ||
    normalizedValue.includes('error') ||
    normalizedValue.includes('failed') ||
    normalizedValue.includes('revoked')
  ) {
    return 'destructive' as const;
  }

  if (
    normalizedKey === 'ok' ||
    normalizedValue === 'true' ||
    normalizedValue.includes('active') ||
    normalizedValue.includes('complete')
  ) {
    return 'default' as const;
  }

  return 'outline' as const;
}

function buildUniformTable(value: unknown[]) {
  if (value.length === 0 || !value.every(isPlainObject)) {
    return null;
  }

  const columns = [...new Set(value.flatMap((item) => Object.keys(item)))].slice(0, 6);
  if (columns.length === 0) {
    return null;
  }

  return {
    columns,
    rows: value.slice(0, 12).map((item) =>
      columns.map((column) => toDisplayString(item[column])),
    ),
    caption: value.length > 12 ? `Showing 12 of ${value.length} rows` : null,
  };
}

function buildToolResultSpec(title: string | undefined, value: unknown): Spec {
  let counter = 0;
  const elements: Record<string, ToolSpecElement> = {};

  const createElement = (
    type: ToolSpecElement['type'],
    props: ToolSpecElement['props'] = {},
    children: string[] = [],
  ) => {
    const id = `tool-spec-${++counter}`;
    elements[id] = {
      type,
      props,
      ...(children.length > 0 ? { children } : {}),
    };
    return id;
  };

  const buildNode = (nodeTitle: string | undefined, nodeValue: unknown, depth = 0): string => {
    if (isScalar(nodeValue)) {
      return createElement('Card', {
        title: nodeTitle ?? null,
        description: null,
      }, [
        createElement('TextBlock', {
          text: toDisplayString(nodeValue),
          tone: nodeValue === null ? 'muted' : 'default',
        }),
      ]);
    }

    if (Array.isArray(nodeValue)) {
      if (nodeValue.length === 0) {
        return createElement('Card', {
          title: nodeTitle ?? null,
          description: 'Empty list',
        }, [
          createElement('TextBlock', {
            text: 'No items were returned.',
            tone: 'muted',
          }),
        ]);
      }

      const table = buildUniformTable(nodeValue);
      if (table) {
        return createElement('Card', {
          title: nodeTitle ?? null,
          description: `${nodeValue.length} item${nodeValue.length === 1 ? '' : 's'}`,
        }, [
          createElement('DataTable', table),
        ]);
      }

      return createElement('Card', {
        title: nodeTitle ?? null,
        description: `${nodeValue.length} item${nodeValue.length === 1 ? '' : 's'}`,
      }, [
        createElement('KeyValueList', {
          items: nodeValue.slice(0, 12).map((item, index) => ({
            label: `Item ${index + 1}`,
            value: toDisplayString(item),
          })),
        }),
        ...(nodeValue.length > 12
          ? [
              createElement('TextBlock', {
                text: `Showing 12 of ${nodeValue.length} items.`,
                tone: 'muted',
              }),
            ]
          : []),
      ]);
    }

    if (!isPlainObject(nodeValue)) {
      return createElement('Card', {
        title: nodeTitle ?? null,
        description: null,
      }, [
        createElement('CodeBlock', {
          code: toDisplayString(nodeValue),
        }),
      ]);
    }

    const entries = Object.entries(nodeValue);
    const scalarEntries = entries.filter(([, entryValue]) => isScalar(entryValue));
    const nestedEntries = entries.filter(([, entryValue]) => !isScalar(entryValue));
    const badgeEntries = scalarEntries.filter(([entryKey, entryValue]) => {
      const normalizedKey = entryKey.toLowerCase();
      return normalizedKey === 'status' || normalizedKey === 'state' || normalizedKey === 'ok' || typeof entryValue === 'boolean';
    });

    const children: string[] = [];

    if (badgeEntries.length > 0) {
      children.push(createElement('BadgeRow', {
        items: badgeEntries.map(([entryKey, entryValue]) => ({
          text: `${toTitleCase(entryKey)}: ${toDisplayString(entryValue)}`,
          variant: getBadgeVariant(entryKey, toDisplayString(entryValue)),
        })),
      }));
    }

    const nonBadgeScalarEntries = scalarEntries.filter(([entryKey]) =>
      !badgeEntries.some(([badgeKey]) => badgeKey === entryKey),
    );

    if (nonBadgeScalarEntries.length > 0) {
      children.push(createElement('KeyValueList', {
        items: nonBadgeScalarEntries.map(([entryKey, entryValue]) => ({
          label: toTitleCase(entryKey),
          value: toDisplayString(entryValue),
        })),
      }));
    }

    if (nestedEntries.length > 0 && children.length > 0) {
      children.push(createElement('Separator'));
    }

    nestedEntries.slice(0, depth === 0 ? 8 : 4).forEach(([entryKey, entryValue], index) => {
      children.push(buildNode(toTitleCase(entryKey), entryValue, depth + 1));
      if (index < nestedEntries.length - 1) {
        children.push(createElement('Separator'));
      }
    });

    if (nestedEntries.length > (depth === 0 ? 8 : 4)) {
      children.push(createElement('TextBlock', {
        text: `Showing ${depth === 0 ? 8 : 4} of ${nestedEntries.length} nested section${nestedEntries.length === 1 ? '' : 's'}.`,
        tone: 'muted',
      }));
    }

    if (children.length === 0) {
      children.push(createElement('CodeBlock', {
        code: toDisplayString(nodeValue),
      }));
    }

    return createElement('Card', {
      title: nodeTitle ?? null,
      description: null,
    }, children);
  };

  const root = buildNode(title, value);
  return { root, elements: elements as Spec['elements'] };
}

function isSpec(value: unknown): value is Spec {
  return isPlainObject(value) && typeof value.root === 'string' && isPlainObject(value.elements);
}

function isInteractivePayload(value: unknown): value is JsonRenderInteractivePayload {
  return isPlainObject(value) && isSpec(value.spec);
}

function ToolFallback({ element }: ComponentRenderProps) {
  const label = element.type ? `Unknown renderer: ${element.type}` : 'Unknown renderer';
  return <p className="text-xs text-muted-foreground">{label}</p>;
}

export function JsonRenderToolResult({ title, value }: JsonRenderToolResultProps) {
  const payload = isInteractivePayload(value)
    ? value
    : isSpec(value)
      ? { spec: value, initialState: value.state }
      : {
          spec: buildToolResultSpec(title, value),
          initialState: {},
        };

  return (
    <JSONUIProvider
      handlers={payload.handlers}
      initialState={payload.initialState ?? {}}
      registry={registry}
    >
      <Renderer fallback={ToolFallback} registry={registry} spec={payload.spec} />
    </JSONUIProvider>
  );
}
