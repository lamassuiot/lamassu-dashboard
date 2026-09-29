'use client';

import { useMemo, useState } from 'react';
import { Code, FormInput } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { HTTPRule, HTTPSchemaDefinition, Rule, SchemaDefinition } from '@/types/authz';
import { normalizePolicyRules } from '@/lib/policy-format';
import { PolicyBuilderJSON } from './PolicyBuilderJSON';
import { PolicyBuilderForm } from './PolicyBuilderForm';

interface PolicyBuilderProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  httpRules?: HTTPRule[];
  onHttpRulesChange?: (httpRules: HTTPRule[]) => void;
  schemas: SchemaDefinition[];
  httpSchemas: Record<string, HTTPSchemaDefinition>;
  loadingSchemas: boolean;
  disabled?: boolean;
}

type Mode = 'form' | 'json';

export function PolicyBuilder({
  rules,
  onChange,
  httpRules = [],
  onHttpRulesChange,
  schemas,
  httpSchemas,
  loadingSchemas,
  disabled,
}: PolicyBuilderProps) {
  const [mode, setMode] = useState<Mode>('form');
  const normalizedRules = useMemo(() => normalizePolicyRules(rules), [rules]);

  const handleRulesChange = (updatedRules: Rule[]) => {
    onChange(normalizePolicyRules(updatedRules));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Each rule grants actions on an entity type or on the routes of an HTTP service.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="form" className="px-2.5">
                <FormInput className="h-4 w-4" />
                Form
              </TabsTrigger>
              <TabsTrigger value="json" className="px-2.5">
                <Code className="h-4 w-4" />
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {mode === 'form' ? (
        <PolicyBuilderForm
          rules={normalizedRules}
          onChange={handleRulesChange}
          httpRules={httpRules}
          onHttpRulesChange={onHttpRulesChange}
          schemas={schemas}
          httpSchemas={httpSchemas}
          loadingSchemas={loadingSchemas}
          disabled={disabled}
        />
      ) : (
        <PolicyBuilderJSON
          rules={normalizedRules}
          onChange={handleRulesChange}
          note={httpRules.length > 0 ? 'HTTP rules can only be edited in the form view.' : undefined}
        />
      )}
    </div>
  );
}
