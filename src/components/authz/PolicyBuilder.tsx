'use client';

import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, FormInput } from 'lucide-react';
import { PolicyBuilderJSON } from './PolicyBuilderJSON';
import { PolicyBuilderForm } from './PolicyBuilderForm';
import type { Rule, HTTPRule } from '@/types/authz';
import { normalizePolicyRules } from '@/lib/policy-format';

interface PolicyBuilderProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  httpRules?: HTTPRule[];
  onHttpRulesChange?: (httpRules: HTTPRule[]) => void;
  error?: string | null;
}

export function PolicyBuilder({ rules, onChange, httpRules, onHttpRulesChange, error }: PolicyBuilderProps) {
  const [activeTab, setActiveTab] = useState<'form' | 'json'>('form');
  const normalizedRules = useMemo(() => normalizePolicyRules(rules), [rules]);

  const handleRulesChange = (updatedRules: Rule[]) => {
    onChange(normalizePolicyRules(updatedRules));
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'form' | 'json')}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="form" className="flex items-center gap-2">
          <FormInput className="h-4 w-4" />
          Form
        </TabsTrigger>
        <TabsTrigger value="json" className="flex items-center gap-2">
          <Code className="h-4 w-4" />
          JSON
        </TabsTrigger>
      </TabsList>

      <TabsContent value="form" className="mt-4">
        <PolicyBuilderForm
          rules={normalizedRules}
          onChange={handleRulesChange}
          httpRules={httpRules}
          onHttpRulesChange={onHttpRulesChange}
          error={error}
        />
      </TabsContent>

      <TabsContent value="json" className="mt-4">
        <PolicyBuilderJSON rules={normalizedRules} onChange={handleRulesChange} error={error} />
      </TabsContent>
    </Tabs>
  );
}
