'use client';

import { useEffect, useMemo, useState } from 'react';
import { Network, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getGroupedSchemas } from '@/lib/authz-api';
import type { GroupedSchemas } from '@/types/authz';
import { SchemaFlowView } from '@/components/authz/SchemaFlowView';

export default function SchemaPage() {
  const [grouped, setGrouped] = useState<GroupedSchemas>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await getGroupedSchemas();
        setGrouped(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load schemas');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const namespaces = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const defaultNamespace = namespaces[0] ?? '';

  return (
    <div className="space-y-6 w-full pb-8">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <Network className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-headline font-semibold">Schema</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Visual map of authorization entity types and their relationships, grouped by namespace.
      </p>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading schemas...
        </div>
      )}

      {/* Namespace tabs + flow */}
      {!loading && namespaces.length > 0 && (
        <Tabs defaultValue={defaultNamespace} className="w-full">
          <div className="border-b">
            <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
              {namespaces.map((ns) => (
                <TabsTrigger
                  key={ns}
                  value={ns}
                  className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <Network className="h-4 w-4" />
                  {ns}
                  <span className="ml-1 text-xs text-muted-foreground">({grouped[ns].length})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-6">
            {namespaces.map((ns) => (
              <TabsContent key={ns} value={ns} className="mt-0">
                <SchemaFlowView schemas={grouped[ns]} error={null} />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      )}

      {!loading && namespaces.length === 0 && !error && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          No schemas available
        </div>
      )}
    </div>
  );
}
