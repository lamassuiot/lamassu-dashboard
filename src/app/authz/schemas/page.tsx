'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Database, Key, Link as LinkIcon, Grid3x3, Workflow } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSchemas } from '@/lib/authz-api';
import type { SchemaDefinition } from '@/types/authz';
import { SchemaFlowView } from '@/components/authz/SchemaFlowView';

export default function SchemasPage() {
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'flow'>('grid');

  useEffect(() => {
    loadSchemas();
  }, []);

  const loadSchemas = async () => {
    try {
      setLoading(true);
      const data = await getSchemas();
      setSchemas(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load schemas');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Database Schemas</h1>
          <p className="text-muted-foreground mt-2">
            Entity schemas and relationship definitions for authorization
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="grid" className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4" />
            Grid View
          </TabsTrigger>
          <TabsTrigger value="flow" className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Flow Diagram
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {schemas.length === 0 ? (
              <Card className="col-span-2">
                <CardContent className="py-12">
                  <p className="text-muted-foreground text-center">
                    No schemas configured
                  </p>
                </CardContent>
              </Card>
            ) : (
              schemas.map((schema) => (
                <Card key={schema.entityType} className="col-span-1">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        {schema.entityType}
                      </CardTitle>
                      <Badge variant="outline">{schema.tableName}</Badge>
                    </div>
                    <CardDescription>
                      Primary Key: <code className="text-xs">{schema.primaryKey}</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Atomic Actions */}
                    {schema.atomicActions && schema.atomicActions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          Atomic Actions
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {schema.atomicActions.map((action, index) => (
                            <Badge key={index} variant="secondary">
                              {action}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Actions requiring entity ID
                        </p>
                      </div>
                    )}

                    {/* Global Actions */}
                    {schema.globalActions && schema.globalActions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Global Actions</h4>
                        <div className="flex flex-wrap gap-2">
                          {schema.globalActions.map((action, index) => (
                            <Badge key={index} variant="outline">
                              {action}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Actions not requiring entity ID
                        </p>
                      </div>
                    )}

                    {/* Relations */}
                    {Object.keys(schema.relations).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          Relations
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(schema.relations).map(([key, relation]) => (
                            <div
                              key={key}
                              className="border rounded-lg p-3 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{relation.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {relation.targetEntity}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                FK: {relation.foreignKey}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Schema JSON Preview */}
                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">
                        View Full Schema
                      </summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">
                        {JSON.stringify(schema, null, 2)}
                      </pre>
                    </details>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="flow" className="mt-6">
          <SchemaFlowView schemas={schemas} error={error} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
