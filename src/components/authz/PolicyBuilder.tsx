'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, FormInput, Workflow } from 'lucide-react';
import { PolicyBuilderJSON } from './PolicyBuilderJSON';
import { PolicyBuilderForm } from './PolicyBuilderForm';
import { PolicyBuilderFlow } from './PolicyBuilderFlow';
import type { Rule } from '@/types/authz';

interface PolicyBuilderProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

export function PolicyBuilder({ rules, onChange, error }: PolicyBuilderProps) {
  const [activeTab, setActiveTab] = useState<'json' | 'form' | 'flow'>('form');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Policy Rules</CardTitle>
        <CardDescription>
          Define access rules using JSON, a form builder, or visual flow diagram
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            <PolicyBuilderForm rules={rules} onChange={onChange} error={error} />
          </TabsContent>

          <TabsContent value="json" className="mt-4">
            <PolicyBuilderJSON rules={rules} onChange={onChange} error={error} />
          </TabsContent>

          <TabsContent value="flow" className="mt-4">
            <PolicyBuilderFlow rules={rules} onChange={onChange} error={error} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
