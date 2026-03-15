'use client';

import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, FormInput, Workflow, ListChecks } from 'lucide-react';
import { PolicyBuilderJSON } from './PolicyBuilderJSON';
import { PolicyBuilderForm } from './PolicyBuilderForm';
import { PolicyBuilderFlow } from './PolicyBuilderFlow';
import type { Rule } from '@/types/authz';
import { normalizePolicyRules } from '@/lib/policy-format';

interface PolicyBuilderProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

export function PolicyBuilder({ rules, onChange, error }: PolicyBuilderProps) {
  const [activeTab, setActiveTab] = useState<'json' | 'form' | 'flow'>('form');
  const normalizedRules = useMemo(() => normalizePolicyRules(rules), [rules]);

  const handleRulesChange = (updatedRules: Rule[]) => {
    onChange(normalizePolicyRules(updatedRules));
  };

  return (
    <Card className="overflow-hidden rounded-xl shadow-sm">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center text-lg">
          <ListChecks className="mr-3 h-5 w-5 text-primary" />
          Policy Rules
        </CardTitle>
        <CardDescription>
          Define access rules using the form builder, JSON editor, or visual flow diagram
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="form" className="flex items-center gap-2">
              <FormInput className="h-4 w-4" />
              Form
            </TabsTrigger>
            <TabsTrigger value="json" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              JSON
            </TabsTrigger>
            <TabsTrigger value="flow" className="flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              Flow
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="mt-4">
            <PolicyBuilderForm rules={normalizedRules} onChange={handleRulesChange} error={error} />
          </TabsContent>

          <TabsContent value="json" className="mt-4">
            <PolicyBuilderJSON rules={normalizedRules} onChange={handleRulesChange} error={error} />
          </TabsContent>

          <TabsContent value="flow" className="mt-4">
            <PolicyBuilderFlow rules={normalizedRules} onChange={handleRulesChange} error={error} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
