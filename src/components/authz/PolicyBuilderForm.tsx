'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import type { HTTPRule, HTTPSchemaDefinition, Rule, SchemaDefinition } from '@/types/authz';
import { sileo } from '@/lib/toast';
import { EntityRuleFields, HttpRuleFields } from './policy-builder/RuleItems';
import {
  emptyEntityRule,
  entityRuleIssues,
  entityRuleSummary,
  hasResource,
  httpRuleIssues,
  httpRuleSummary,
  type RuleIssues,
} from './policy-builder/rule-model';

interface PolicyBuilderFormProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  httpRules?: HTTPRule[];
  onHttpRulesChange?: (httpRules: HTTPRule[]) => void;
  schemas: SchemaDefinition[];
  httpSchemas: Record<string, HTTPSchemaDefinition>;
  loadingSchemas: boolean;
  disabled?: boolean;
}

type Kind = 'entity' | 'http';
const itemKey = (kind: Kind, index: number) => `${kind}-${index}`;

/** Re-index open item keys of one kind after removing (delta -1) or inserting (delta +1) at `index`. */
const shiftKeys = (keys: string[], kind: Kind, index: number, delta: 1 | -1) =>
  keys.flatMap((key) => {
    const [k, raw] = key.split('-');
    const i = Number(raw);
    if (k !== kind || i < index) return [key];
    if (delta === -1 && i === index) return [];
    return [itemKey(kind, i + delta)];
  });

function RuleAccordionItem({
  value,
  index,
  kind,
  summary,
  issues,
  onDelete,
  disabled,
  children,
}: {
  value: string;
  index: number;
  kind: string;
  summary: string | null;
  issues: RuleIssues;
  onDelete: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const status = issues.errors.length > 0 ? 'error' : issues.warnings.length > 0 ? 'warning' : null;

  return (
    <AccordionItem value={value} className="data-open:bg-transparent **:data-[slot=accordion-content]:px-0">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="items-center gap-3 px-0 py-4 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0">Rule {index}</span>
              <span className="shrink-0 font-normal text-muted-foreground">{kind}</span>
              {summary && <span className="min-w-0 truncate font-normal text-muted-foreground">· {summary}</span>}
            </span>
            {status && (
              <span
                className={
                  status === 'error'
                    ? 'shrink-0 text-xs font-normal text-destructive'
                    : 'shrink-0 text-xs font-normal text-amber-700 dark:text-amber-400'
                }
                title={[...issues.errors, ...issues.warnings].join('\n')}
              >
                {status === 'error' ? 'Incomplete' : 'Review'}
              </span>
            )}
          </AccordionTrigger>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove rule ${index}`}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <AccordionContent className="pb-5 [&_p:not(:last-child)]:mb-0">{children}</AccordionContent>
    </AccordionItem>
  );
}

export function PolicyBuilderForm({
  rules,
  onChange,
  httpRules = [],
  onHttpRulesChange,
  schemas,
  httpSchemas,
  loadingSchemas,
  disabled,
}: PolicyBuilderFormProps) {
  const [open, setOpen] = useState<string[]>(() =>
    rules.length + httpRules.length === 1 ? [itemKey(rules.length ? 'entity' : 'http', 0)] : []
  );

  // Undo reinserts into the lists as they are when clicked, not as they were when the rule was removed.
  const latest = useRef({ rules, httpRules });
  const previousCount = useRef(rules.length);
  useEffect(() => {
    latest.current = { rules, httpRules };
    // "Add Rule" lives in the section header and appends an empty rule; open it.
    const last = rules[rules.length - 1];
    if (rules.length === previousCount.current + 1 && last && !hasResource(last)) {
      setOpen((prev) => [...prev, itemKey('entity', rules.length - 1)]);
    }
    previousCount.current = rules.length;
  }, [rules, httpRules]);

  const setHttpRules = (next: HTTPRule[]) => onHttpRulesChange?.(next);

  const offerUndo = (restore: () => void) =>
    sileo.action({ title: 'Rule removed', button: { title: 'Undo', onClick: restore } });

  const removeEntity = (index: number, undoable = true) => {
    const removed = rules[index];
    onChange(rules.filter((_, i) => i !== index));
    setOpen((prev) => shiftKeys(prev, 'entity', index, -1));
    if (!undoable) return;
    offerUndo(() => {
      const current = latest.current.rules;
      onChange([...current.slice(0, index), removed, ...current.slice(index)]);
      setOpen((prev) => shiftKeys(prev, 'entity', index, 1));
    });
  };

  const removeHttp = (index: number, undoable = true) => {
    const removed = httpRules[index];
    setHttpRules(httpRules.filter((_, i) => i !== index));
    setOpen((prev) => shiftKeys(prev, 'http', index, -1));
    if (!undoable) return;
    offerUndo(() => {
      const current = latest.current.httpRules;
      setHttpRules([...current.slice(0, index), removed, ...current.slice(index)]);
      setOpen((prev) => shiftKeys(prev, 'http', index, 1));
    });
  };

  const convertToHTTP = (index: number, http_schema_name: string, http_group_name?: string) => {
    removeEntity(index, false);
    setHttpRules([...httpRules, { http_schema_name, http_group_name, actions: [] }]);
    setOpen((prev) => [...prev, itemKey('http', httpRules.length)]);
  };

  const convertToEntity = (index: number, schema_name: string, entity_type: string, namespace?: string) => {
    removeHttp(index, false);
    onChange([...rules, { ...emptyEntityRule(), namespace: namespace ?? '', schema_name, entity_type }]);
    setOpen((prev) => [...prev, itemKey('entity', rules.length)]);
  };

  const hasRules = rules.length + httpRules.length > 0;
  const addRuleButton = (
    <Button
      type="button"
      variant="outline"
      onClick={() => onChange([...rules, emptyEntityRule()])}
      disabled={disabled}
      className="h-auto w-full flex-col gap-2 border-dashed py-6"
    >
      <Plus className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{hasRules ? 'Add another rule' : 'Add your first rule'}</span>
      <span className="text-xs text-muted-foreground">
        {hasRules
          ? 'Grant actions on another entity type or HTTP service'
          : 'A policy grants nothing until it has at least one rule'}
      </span>
    </Button>
  );

  if (!hasRules) return addRuleButton;

  return (
    <div className="space-y-4">
      <Accordion type="multiple" value={open} onValueChange={setOpen} className="overflow-visible rounded-none border-x-0">
        {rules.map((rule, index) => (
          <RuleAccordionItem
            key={itemKey('entity', index)}
            value={itemKey('entity', index)}
            index={index + 1}
            kind="Entity"
            summary={entityRuleSummary(rule)}
            issues={entityRuleIssues(rule, schemas)}
            onDelete={() => removeEntity(index)}
            disabled={disabled}
          >
            <EntityRuleFields
              rule={rule}
              onChange={(updated) => onChange(rules.map((r, i) => (i === index ? updated : r)))}
              onConvertToHTTP={(schema, group) => convertToHTTP(index, schema, group)}
              schemas={schemas}
              httpSchemas={httpSchemas}
              loadingSchemas={loadingSchemas}
              disabled={disabled}
            />
          </RuleAccordionItem>
        ))}
        {httpRules.map((rule, index) => (
          <RuleAccordionItem
            key={itemKey('http', index)}
            value={itemKey('http', index)}
            index={rules.length + index + 1}
            kind="HTTP"
            summary={httpRuleSummary(rule)}
            issues={httpRuleIssues(rule)}
            onDelete={() => removeHttp(index)}
            disabled={disabled}
          >
            <HttpRuleFields
              rule={rule}
              onChange={(updated) => setHttpRules(httpRules.map((r, i) => (i === index ? updated : r)))}
              onConvertToEntity={(sn, et, ns) => convertToEntity(index, sn, et, ns)}
              schemas={schemas}
              httpSchemas={httpSchemas}
              disabled={disabled}
            />
          </RuleAccordionItem>
        ))}
      </Accordion>
      {addRuleButton}
    </div>
  );
}
