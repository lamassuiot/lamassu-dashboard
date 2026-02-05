'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, CheckCircle, XCircle, Play, Filter } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authorize, getFilter, listPrincipals, getSchemas } from '@/lib/authz-api';
import type { Principal, SchemaDefinition, AuthorizeResponse, FilterResponse } from '@/types/authz';

export default function AuthorizationTestPage() {
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuthorizeResponse | null>(null);
  const [filterResult, setFilterResult] = useState<FilterResponse | null>(null);
  const [formData, setFormData] = useState({
    principalId: '',
    action: '',
    entityType: '',
    entityId: '',
  });
  const [filterFormData, setFilterFormData] = useState({
    principalId: '',
    entityType: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [principalsData, schemasData] = await Promise.all([
        listPrincipals(),
        getSchemas(),
      ]);
      setPrincipals(principalsData.principals);
      setSchemas(schemasData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    }
  };

  const handleTest = async () => {
    if (!formData.principalId || !formData.action || !formData.entityType || !formData.entityId) {
      setError('All fields are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await authorize({
        principalId: formData.principalId,
        action: formData.action,
        entityType: formData.entityType,
        entityId: formData.entityId,
      });
      setResult(response);
    } catch (err: any) {
      setError(err.message || 'Authorization test failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      principalId: '',
      action: '',
      entityType: '',
      entityId: '',
    });
    setResult(null);
    setError(null);
  };

  const handleTestFilter = async () => {
    if (!filterFormData.principalId || !filterFormData.entityType) {
      setError('All fields are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getFilter({
        principalId: filterFormData.principalId,
        entityType: filterFormData.entityType,
      });
      setFilterResult(response);
    } catch (err: any) {
      setError(err.message || 'Filter test failed');
      setFilterResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilter = () => {
    setFilterFormData({
      principalId: '',
      entityType: '',
    });
    setFilterResult(null);
    setError(null);
  };

  const getAvailableActions = (): string[] => {
    if (!formData.entityType) return [];
    const schema = schemas.find((s) => s.entityType === formData.entityType);
    if (!schema) return [];
    return [...(schema.atomicActions || []), ...(schema.globalActions || [])];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Authorization Test</h1>
        <p className="text-muted-foreground mt-2">
          Test authorization rules and policies
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="authorize" className="space-y-6">
        <TabsList>
          <TabsTrigger value="authorize">Authorize Test</TabsTrigger>
          <TabsTrigger value="filter">Get Filter Test</TabsTrigger>
        </TabsList>

        <TabsContent value="authorize" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle>Test Parameters</CardTitle>
            <CardDescription>
              Configure the authorization test parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="principal">Principal</Label>
              <Select
                value={formData.principalId}
                onValueChange={(value) =>
                  setFormData({ ...formData, principalId: value })
                }
              >
                <SelectTrigger id="principal">
                  <SelectValue placeholder="Select principal" />
                </SelectTrigger>
                <SelectContent>
                  {principals.map((principal) => (
                    <SelectItem key={principal.id} value={principal.id}>
                      {principal.name}
                      <Badge variant="secondary" className="ml-2">
                        {principal.type}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entityType">Entity Type</Label>
              <Select
                value={formData.entityType}
                onValueChange={(value) =>
                  setFormData({ ...formData, entityType: value, action: '' })
                }
              >
                <SelectTrigger id="entityType">
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {schemas.map((schema) => (
                    <SelectItem key={schema.entityType} value={schema.entityType}>
                      {schema.entityType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <Select
                value={formData.action}
                onValueChange={(value) =>
                  setFormData({ ...formData, action: value })
                }
                disabled={!formData.entityType}
              >
                <SelectTrigger id="action">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableActions().map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entityId">Entity ID</Label>
              <Input
                id="entityId"
                placeholder="Enter entity ID"
                value={formData.entityId}
                onChange={(e) =>
                  setFormData({ ...formData, entityId: e.target.value })
                }
              />
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button onClick={handleTest} disabled={loading} className="flex-1">
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Test Authorization
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Result Display */}
        <Card>
          <CardHeader>
            <CardTitle>Test Result</CardTitle>
            <CardDescription>
              Authorization decision and details
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Run a test to see results
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center py-6">
                  {result.allowed ? (
                    <div className="text-center">
                      <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-green-600">Allowed</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Authorization successful
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <XCircle className="h-16 w-16 text-red-600 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-red-600">Denied</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Authorization failed
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">Principal ID</p>
                    <p className="font-mono">{result.principalId}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Action</p>
                    <Badge>{result.action}</Badge>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Entity Type</p>
                    <Badge variant="outline">{result.entityType}</Badge>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Entity ID</p>
                    <p className="font-mono">{result.entityId}</p>
                  </div>
                </div>

                <Separator />

                <details className="border rounded-lg">
                  <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">
                    View Full Response
                  </summary>
                  <pre className="bg-muted p-4 overflow-auto text-xs">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Request Summary */}
      {formData.principalId && formData.action && formData.entityType && formData.entityId && (
        <Card>
          <CardHeader>
            <CardTitle>Request Summary</CardTitle>
            <CardDescription>Current test configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(
                {
                  principalId: formData.principalId,
                  action: formData.action,
                  entityType: formData.entityType,
                  entityId: formData.entityId,
                },
                null,
                2
              )}
            </pre>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="filter" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Filter Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Filter Parameters</CardTitle>
                <CardDescription>
                  Configure the filter test parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="filter-principal">Principal</Label>
                  <Select
                    value={filterFormData.principalId}
                    onValueChange={(value) =>
                      setFilterFormData({ ...filterFormData, principalId: value })
                    }
                  >
                    <SelectTrigger id="filter-principal">
                      <SelectValue placeholder="Select principal" />
                    </SelectTrigger>
                    <SelectContent>
                      {principals.map((principal) => (
                        <SelectItem key={principal.id} value={principal.id}>
                          {principal.name}
                          <Badge variant="secondary" className="ml-2">
                            {principal.type}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter-entityType">Entity Type</Label>
                  <Select
                    value={filterFormData.entityType}
                    onValueChange={(value) =>
                      setFilterFormData({ ...filterFormData, entityType: value })
                    }
                  >
                    <SelectTrigger id="filter-entityType">
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {schemas.map((schema) => (
                        <SelectItem key={schema.entityType} value={schema.entityType}>
                          {schema.entityType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button onClick={handleTestFilter} disabled={loading} className="flex-1">
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Filter className="mr-2 h-4 w-4" />
                    )}
                    Get Filter
                  </Button>
                  <Button variant="outline" onClick={handleResetFilter}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Filter Result Display */}
            <Card>
              <CardHeader>
                <CardTitle>Filter Result</CardTitle>
                <CardDescription>
                  SQL WHERE clause and arguments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!filterResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    Run a test to see results
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="font-medium text-muted-foreground">Principal ID</p>
                        <p className="font-mono">{filterResult.principalId}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Entity Type</p>
                        <Badge variant="outline">{filterResult.entityType}</Badge>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-muted-foreground mb-2">WHERE Clause</p>
                        <pre className="bg-muted p-3 rounded-lg overflow-auto text-xs font-mono">
                          {filterResult.whereClause || '(no filter - full access)'}
                        </pre>
                      </div>

                      {filterResult.args && filterResult.args.length > 0 && (
                        <div>
                          <p className="font-medium text-muted-foreground mb-2">Arguments</p>
                          <pre className="bg-muted p-3 rounded-lg overflow-auto text-xs font-mono">
                            {JSON.stringify(filterResult.args, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">
                        View Full Response
                      </summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">
                        {JSON.stringify(filterResult, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Filter Request Summary */}
          {filterFormData.principalId && filterFormData.entityType && (
            <Card>
              <CardHeader>
                <CardTitle>Request Summary</CardTitle>
                <CardDescription>Current filter test configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                  {JSON.stringify(
                    {
                      principalId: filterFormData.principalId,
                      entityType: filterFormData.entityType,
                    },
                    null,
                    2
                  )}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
