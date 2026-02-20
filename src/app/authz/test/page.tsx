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
import { Textarea } from '@/components/ui/textarea';
import { authorize, getFilter, matchAndAuthorize, matchAndGetFilter, getCapabilities, matchAndGetCapabilities, listPrincipals, getSchemas } from '@/lib/authz-api';
import type { Principal, SchemaDefinition, AuthorizeResponse, FilterResponse, MatchAndAuthorizeResponse, MatchAndGetFilterResponse, CapabilitiesResponse, MatchAndGetCapabilitiesResponse } from '@/types/authz';

export default function AuthorizationTestPage() {
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuthorizeResponse | null>(null);
  const [filterResult, setFilterResult] = useState<FilterResponse | null>(null);
  const [formData, setFormData] = useState({
    principalId: '',
    namespace: '',
    schemaName: '',
    action: '',
    entityType: '',
    entityId: '',
  });
  const [filterFormData, setFilterFormData] = useState({
    principalId: '',
    namespace: '',
    schemaName: '',
    entityType: '',
  });
  const [matchAuthorizeFormData, setMatchAuthorizeFormData] = useState({
    authType: 'x509' as 'api_key' | 'oidc' | 'x509',
    authMaterial: '',
    namespace: '',
    schemaName: '',
    action: '',
    entityType: '',
    entityId: '',
  });
  const [matchFilterFormData, setMatchFilterFormData] = useState({
    authType: 'x509' as 'api_key' | 'oidc' | 'x509',
    authMaterial: '',
    namespace: '',
    schemaName: '',
    entityType: '',
  });
  const [matchAuthorizeResult, setMatchAuthorizeResult] = useState<MatchAndAuthorizeResponse | null>(null);
  const [matchFilterResult, setMatchFilterResult] = useState<MatchAndGetFilterResponse | null>(null);
  const [capabilitiesFormData, setCapabilitiesFormData] = useState({
    principalId: '',
  });
  const [matchCapabilitiesFormData, setMatchCapabilitiesFormData] = useState({
    authType: 'x509' as 'api_key' | 'oidc' | 'x509',
    authMaterial: '',
  });
  const [capabilitiesResult, setCapabilitiesResult] = useState<CapabilitiesResponse | null>(null);
  const [matchCapabilitiesResult, setMatchCapabilitiesResult] = useState<MatchAndGetCapabilitiesResponse | null>(null);

  const validateEntityTarget = (namespace: string, schemaName: string, entityType: string): string | null => {
    const normalizedEntityType = entityType.trim();
    if (!namespace.trim()) return 'namespace is required';
    if (!schemaName.trim()) return 'schemaName is required';
    if (!normalizedEntityType) return 'entityType is required';
    if (normalizedEntityType.includes('.')) {
      return 'entityType must be unqualified and must not contain a dot. Use schemaName separately.';
    }
    return null;
  };

  const setEntityTargetValidationErrorIfNeeded = (
    namespace: string,
    schemaName: string,
    entityType: string
  ): boolean => {
    const validationError = validateEntityTarget(namespace, schemaName, entityType);
    if (!validationError) {
      return false;
    }

    const trimmedEntityType = entityType.trim();
    if (trimmedEntityType.includes('.')) {
      setError(`Invalid entityType \"${trimmedEntityType}\": ${validationError}`);
    } else {
      setError(validationError);
    }
    return true;
  };

  const getSchemaOptionsForNamespace = (namespace: string) =>
    Array.from(
      new Set(
        schemas
          .filter((schema) => (schema.namespace || '').trim() === namespace)
          .map((schema) => schema.schemaName)
      )
    ).sort();

  const getEntityTypeOptions = (namespace: string, schemaName: string) =>
    schemas
      .filter(
        (schema) => (schema.namespace || '').trim() === namespace && schema.schemaName === schemaName
      )
      .map((schema) => schema.entityType)
      .sort();

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
    if (!formData.principalId || !formData.action || !formData.entityId) {
      setError('All fields are required');
      return;
    }

    if (setEntityTargetValidationErrorIfNeeded(formData.namespace, formData.schemaName, formData.entityType)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await authorize({
        principalId: formData.principalId,
        namespace: formData.namespace,
        schemaName: formData.schemaName,
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
      namespace: '',
      schemaName: '',
      action: '',
      entityType: '',
      entityId: '',
    });
    setResult(null);
    setError(null);
  };

  const handleTestFilter = async () => {
    if (!filterFormData.principalId) {
      setError('All fields are required');
      return;
    }

    if (setEntityTargetValidationErrorIfNeeded(filterFormData.namespace, filterFormData.schemaName, filterFormData.entityType)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getFilter({
        principalId: filterFormData.principalId,
        namespace: filterFormData.namespace,
        schemaName: filterFormData.schemaName,
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
      namespace: '',
      schemaName: '',
      entityType: '',
    });
    setFilterResult(null);
    setError(null);
  };

  const handleMatchAndAuthorize = async () => {
    if (!matchAuthorizeFormData.authMaterial || !matchAuthorizeFormData.authType || !matchAuthorizeFormData.action) {
      setError('Auth Material, Auth Type, Action, and Entity Type are required');
      return;
    }

    if (setEntityTargetValidationErrorIfNeeded(matchAuthorizeFormData.namespace, matchAuthorizeFormData.schemaName, matchAuthorizeFormData.entityType)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await matchAndAuthorize({
        authMaterial: matchAuthorizeFormData.authMaterial,
        authType: matchAuthorizeFormData.authType,
        namespace: matchAuthorizeFormData.namespace,
        schemaName: matchAuthorizeFormData.schemaName,
        action: matchAuthorizeFormData.action,
        entityType: matchAuthorizeFormData.entityType,
        entityId: matchAuthorizeFormData.entityId || undefined,
      });
      setMatchAuthorizeResult(response);
    } catch (err: any) {
      setError(err.message || 'Match and authorize test failed');
      setMatchAuthorizeResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetMatchAuthorize = () => {
    setMatchAuthorizeFormData({
      authType: 'x509',
      authMaterial: '',
      namespace: '',
      schemaName: '',
      action: '',
      entityType: '',
      entityId: '',
    });
    setMatchAuthorizeResult(null);
    setError(null);
  };

  const handleMatchAndGetFilter = async () => {
    if (!matchFilterFormData.authMaterial || !matchFilterFormData.authType) {
      setError('Auth Material, Auth Type, and Entity Type are required');
      return;
    }

    if (setEntityTargetValidationErrorIfNeeded(matchFilterFormData.namespace, matchFilterFormData.schemaName, matchFilterFormData.entityType)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await matchAndGetFilter({
        authMaterial: matchFilterFormData.authMaterial,
        authType: matchFilterFormData.authType,
        namespace: matchFilterFormData.namespace,
        schemaName: matchFilterFormData.schemaName,
        entityType: matchFilterFormData.entityType,
      });
      setMatchFilterResult(response);
    } catch (err: any) {
      setError(err.message || 'Match and get filter test failed');
      setMatchFilterResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetMatchFilter = () => {
    setMatchFilterFormData({
      authType: 'x509',
      authMaterial: '',
      namespace: '',
      schemaName: '',
      entityType: '',
    });
    setMatchFilterResult(null);
    setError(null);
  };

  const handleGetCapabilities = async () => {
    if (!capabilitiesFormData.principalId) {
      setError('Principal ID is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getCapabilities({
        principal_id: capabilitiesFormData.principalId,
      });
      setCapabilitiesResult(response);
    } catch (err: any) {
      setError(err.message || 'Get capabilities test failed');
      setCapabilitiesResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetCapabilities = () => {
    setCapabilitiesFormData({
      principalId: '',
    });
    setCapabilitiesResult(null);
    setError(null);
  };

  const handleMatchAndGetCapabilities = async () => {
    if (!matchCapabilitiesFormData.authMaterial || !matchCapabilitiesFormData.authType) {
      setError('Auth Material and Auth Type are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await matchAndGetCapabilities({
        authMaterial: matchCapabilitiesFormData.authMaterial,
        authType: matchCapabilitiesFormData.authType,
      });
      setMatchCapabilitiesResult(response);
    } catch (err: any) {
      setError(err.message || 'Match and get capabilities test failed');
      setMatchCapabilitiesResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleResetMatchCapabilities = () => {
    setMatchCapabilitiesFormData({
      authType: 'x509',
      authMaterial: '',
    });
    setMatchCapabilitiesResult(null);
    setError(null);
  };

  const getAvailableActions = (): string[] => {
    if (!formData.namespace || !formData.schemaName || !formData.entityType) return [];
    const schema = schemas.find(
      (s) =>
        (s.namespace || '').trim() === formData.namespace &&
        s.schemaName === formData.schemaName &&
        s.entityType === formData.entityType
    );
    if (!schema) return [];
    return [...(schema.atomicActions || []), ...(schema.globalActions || [])];
  };

  const getAvailableActionsForMatch = (): string[] => {
    if (!matchAuthorizeFormData.namespace || !matchAuthorizeFormData.schemaName || !matchAuthorizeFormData.entityType) return [];
    const schema = schemas.find(
      (s) =>
        (s.namespace || '').trim() === matchAuthorizeFormData.namespace &&
        s.schemaName === matchAuthorizeFormData.schemaName &&
        s.entityType === matchAuthorizeFormData.entityType
    );
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

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Use separate fields for authz entity targeting: namespace, schemaName, and unqualified entityType.{' '}
          entityType must not contain a dot.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="authorize" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="authorize">Authorize</TabsTrigger>
          <TabsTrigger value="filter">Get Filter</TabsTrigger>
          <TabsTrigger value="match-authorize">Match & Authorize</TabsTrigger>
          <TabsTrigger value="match-filter">Match & Filter</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="match-capabilities">Match & Capabilities</TabsTrigger>
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
                  <Label htmlFor="namespace">Namespace</Label>
                  <Select
                    value={formData.namespace}
                    onValueChange={(value) =>
                      setFormData({ ...formData, namespace: value, schemaName: '', entityType: '', action: '' })
                    }
                  >
                    <SelectTrigger id="namespace">
                      <SelectValue placeholder="Select namespace" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(schemas.map((schema) => (schema.namespace || '').trim()).filter(Boolean))).sort().map((namespace) => (
                        <SelectItem key={namespace} value={namespace}>
                          {namespace}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schemaName">Schema Name</Label>
                  <Select
                    value={formData.schemaName}
                    onValueChange={(value) =>
                      setFormData({ ...formData, schemaName: value, entityType: '', action: '' })
                    }
                    disabled={!formData.namespace}
                  >
                    <SelectTrigger id="schemaName">
                      <SelectValue placeholder="Select schema name" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSchemaOptionsForNamespace(formData.namespace).map((schemaName) => (
                        <SelectItem key={schemaName} value={schemaName}>
                          {schemaName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entityType">Entity Type</Label>
                  <Select
                    value={formData.entityType}
                    onValueChange={(value) => setFormData({ ...formData, entityType: value, action: '' })}
                    disabled={!formData.namespace || !formData.schemaName}
                  >
                    <SelectTrigger id="entityType">
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {getEntityTypeOptions(formData.namespace, formData.schemaName).map((entityType) => (
                        <SelectItem key={entityType} value={entityType}>
                          {entityType}
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
                        <p className="font-medium text-muted-foreground">Namespace</p>
                        <Badge variant="secondary">{result.namespace}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Schema Name</p>
                        <Badge variant="secondary">{result.schemaName}</Badge>
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
                  <Label htmlFor="filter-namespace">Namespace</Label>
                  <Select
                    value={filterFormData.namespace}
                    onValueChange={(value) =>
                      setFilterFormData({ ...filterFormData, namespace: value, schemaName: '', entityType: '' })
                    }
                  >
                    <SelectTrigger id="filter-namespace">
                      <SelectValue placeholder="Select namespace" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(schemas.map((schema) => (schema.namespace || '').trim()).filter(Boolean))).sort().map((namespace) => (
                        <SelectItem key={namespace} value={namespace}>
                          {namespace}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter-schemaName">Schema Name</Label>
                  <Select
                    value={filterFormData.schemaName}
                    onValueChange={(value) =>
                      setFilterFormData({ ...filterFormData, schemaName: value, entityType: '' })
                    }
                    disabled={!filterFormData.namespace}
                  >
                    <SelectTrigger id="filter-schemaName">
                      <SelectValue placeholder="Select schema name" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSchemaOptionsForNamespace(filterFormData.namespace).map((schemaName) => (
                        <SelectItem key={schemaName} value={schemaName}>
                          {schemaName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter-entityType">Entity Type</Label>
                  <Select
                    value={filterFormData.entityType}
                    onValueChange={(value) => setFilterFormData({ ...filterFormData, entityType: value })}
                    disabled={!filterFormData.namespace || !filterFormData.schemaName}
                  >
                    <SelectTrigger id="filter-entityType">
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {getEntityTypeOptions(filterFormData.namespace, filterFormData.schemaName).map((entityType) => (
                        <SelectItem key={entityType} value={entityType}>
                          {entityType}
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
                        <p className="font-medium text-muted-foreground">Namespace</p>
                        <Badge variant="secondary">{filterResult.namespace}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Schema Name</p>
                        <Badge variant="secondary">{filterResult.schemaName}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Entity Type</p>
                        <Badge variant="outline">{filterResult.entityType}</Badge>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-muted-foreground mb-2">Filter Query</p>
                        <pre className="bg-muted p-3 rounded-lg overflow-auto text-xs font-mono">
                          {filterResult.filterQuery || '(no filter - full access)'}
                        </pre>
                      </div>
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
        </TabsContent>

        <TabsContent value="match-authorize" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Match & Authorize Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Match & Authorize Parameters</CardTitle>
                <CardDescription>
                  Provide authentication credentials to match principals and test authorization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="match-auth-type">Authentication Type</Label>
                  <Select
                    value={matchAuthorizeFormData.authType}
                    onValueChange={(value: 'api_key' | 'oidc' | 'x509') =>
                      setMatchAuthorizeFormData({ ...matchAuthorizeFormData, authType: value, authMaterial: '' })
                    }
                  >
                    <SelectTrigger id="match-auth-type">
                      <SelectValue placeholder="Select auth type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="x509">X.509 Certificate</SelectItem>
                      <SelectItem value="oidc">OIDC / JWT Token</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-auth-material">
                    {matchAuthorizeFormData.authType === 'x509' && 'X.509 Certificate (PEM)'}
                    {matchAuthorizeFormData.authType === 'oidc' && 'JWT Token'}
                    {matchAuthorizeFormData.authType === 'api_key' && 'API Key'}
                  </Label>
                  <Textarea
                    id="match-auth-material"
                    placeholder={
                      matchAuthorizeFormData.authType === 'x509'
                        ? '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----'
                        : matchAuthorizeFormData.authType === 'oidc'
                        ? 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
                        : 'your-api-key-here'
                    }
                    value={matchAuthorizeFormData.authMaterial}
                    onChange={(e) =>
                      setMatchAuthorizeFormData({ ...matchAuthorizeFormData, authMaterial: e.target.value })
                    }
                    className="font-mono text-xs min-h-[120px]"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="match-namespace">Namespace</Label>
                  <Select
                    value={matchAuthorizeFormData.namespace}
                    onValueChange={(value) =>
                      setMatchAuthorizeFormData({
                        ...matchAuthorizeFormData,
                        namespace: value,
                        schemaName: '',
                        entityType: '',
                        action: '',
                      })
                    }
                  >
                    <SelectTrigger id="match-namespace">
                      <SelectValue placeholder="Select namespace" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(schemas.map((schema) => (schema.namespace || '').trim()).filter(Boolean))).sort().map((namespace) => (
                        <SelectItem key={namespace} value={namespace}>
                          {namespace}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-schemaName">Schema Name</Label>
                  <Select
                    value={matchAuthorizeFormData.schemaName}
                    onValueChange={(value) =>
                      setMatchAuthorizeFormData({ ...matchAuthorizeFormData, schemaName: value, entityType: '', action: '' })
                    }
                    disabled={!matchAuthorizeFormData.namespace}
                  >
                    <SelectTrigger id="match-schemaName">
                      <SelectValue placeholder="Select schema name" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSchemaOptionsForNamespace(matchAuthorizeFormData.namespace).map((schemaName) => (
                        <SelectItem key={schemaName} value={schemaName}>
                          {schemaName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-entityType">Entity Type</Label>
                  <Select
                    value={matchAuthorizeFormData.entityType}
                    onValueChange={(value) => setMatchAuthorizeFormData({ ...matchAuthorizeFormData, entityType: value, action: '' })}
                    disabled={!matchAuthorizeFormData.namespace || !matchAuthorizeFormData.schemaName}
                  >
                    <SelectTrigger id="match-entityType">
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {getEntityTypeOptions(matchAuthorizeFormData.namespace, matchAuthorizeFormData.schemaName).map((entityType) => (
                        <SelectItem key={entityType} value={entityType}>
                          {entityType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-action">Action</Label>
                  <Select
                    value={matchAuthorizeFormData.action}
                    onValueChange={(value) =>
                      setMatchAuthorizeFormData({ ...matchAuthorizeFormData, action: value })
                    }
                    disabled={!matchAuthorizeFormData.entityType}
                  >
                    <SelectTrigger id="match-action">
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableActionsForMatch().map((action) => (
                        <SelectItem key={action} value={action}>
                          {action}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-entityId">Entity ID (Optional)</Label>
                  <Input
                    id="match-entityId"
                    placeholder="Enter entity ID"
                    value={matchAuthorizeFormData.entityId}
                    onChange={(e) =>
                      setMatchAuthorizeFormData({ ...matchAuthorizeFormData, entityId: e.target.value })
                    }
                  />
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button onClick={handleMatchAndAuthorize} disabled={loading} className="flex-1">
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Test Authorization
                  </Button>
                  <Button variant="outline" onClick={handleResetMatchAuthorize}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Match & Authorize Result Display */}
            <Card>
              <CardHeader>
                <CardTitle>Match & Authorize Result</CardTitle>
                <CardDescription>
                  Matched principals and authorization decision
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!matchAuthorizeResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    Run a test to see results
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center py-6">
                      {matchAuthorizeResult.allowed ? (
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
                        <p className="font-medium text-muted-foreground">Matched Principals</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {matchAuthorizeResult.matchedPrincipals.length > 0 ? (
                            matchAuthorizeResult.matchedPrincipals.map((principalId) => (
                              <Badge key={principalId} variant="secondary">
                                {principalId}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">No principals matched</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Action</p>
                        <Badge>{matchAuthorizeResult.action}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Namespace</p>
                        <Badge variant="secondary">{matchAuthorizeResult.namespace}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Schema Name</p>
                        <Badge variant="secondary">{matchAuthorizeResult.schemaName}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Entity Type</p>
                        <Badge variant="outline">{matchAuthorizeResult.entityType}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Entity ID</p>
                        <p className="font-mono">{matchAuthorizeResult.entityId}</p>
                      </div>
                    </div>

                    <Separator />

                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">
                        View Full Response
                      </summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">
                        {JSON.stringify(matchAuthorizeResult, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="match-filter" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Match & Filter Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Match & Filter Parameters</CardTitle>
                <CardDescription>
                  Provide authentication credentials to match principals and get filter
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="match-filter-auth-type">Authentication Type</Label>
                  <Select
                    value={matchFilterFormData.authType}
                    onValueChange={(value: 'api_key' | 'oidc' | 'x509') =>
                      setMatchFilterFormData({ ...matchFilterFormData, authType: value, authMaterial: '' })
                    }
                  >
                    <SelectTrigger id="match-filter-auth-type">
                      <SelectValue placeholder="Select auth type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="x509">X.509 Certificate</SelectItem>
                      <SelectItem value="oidc">OIDC / JWT Token</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-filter-auth-material">
                    {matchFilterFormData.authType === 'x509' && 'X.509 Certificate (PEM)'}
                    {matchFilterFormData.authType === 'oidc' && 'JWT Token'}
                    {matchFilterFormData.authType === 'api_key' && 'API Key'}
                  </Label>
                  <Textarea
                    id="match-filter-auth-material"
                    placeholder={
                      matchFilterFormData.authType === 'x509'
                        ? '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----'
                        : matchFilterFormData.authType === 'oidc'
                        ? 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
                        : 'your-api-key-here'
                    }
                    value={matchFilterFormData.authMaterial}
                    onChange={(e) =>
                      setMatchFilterFormData({ ...matchFilterFormData, authMaterial: e.target.value })
                    }
                    className="font-mono text-xs min-h-[120px]"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="match-filter-namespace">Namespace</Label>
                  <Select
                    value={matchFilterFormData.namespace}
                    onValueChange={(value) =>
                      setMatchFilterFormData({ ...matchFilterFormData, namespace: value, schemaName: '', entityType: '' })
                    }
                  >
                    <SelectTrigger id="match-filter-namespace">
                      <SelectValue placeholder="Select namespace" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(schemas.map((schema) => (schema.namespace || '').trim()).filter(Boolean))).sort().map((namespace) => (
                        <SelectItem key={namespace} value={namespace}>
                          {namespace}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-filter-schemaName">Schema Name</Label>
                  <Select
                    value={matchFilterFormData.schemaName}
                    onValueChange={(value) =>
                      setMatchFilterFormData({ ...matchFilterFormData, schemaName: value, entityType: '' })
                    }
                    disabled={!matchFilterFormData.namespace}
                  >
                    <SelectTrigger id="match-filter-schemaName">
                      <SelectValue placeholder="Select schema name" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSchemaOptionsForNamespace(matchFilterFormData.namespace).map((schemaName) => (
                        <SelectItem key={schemaName} value={schemaName}>
                          {schemaName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-filter-entityType">Entity Type</Label>
                  <Select
                    value={matchFilterFormData.entityType}
                    onValueChange={(value) => setMatchFilterFormData({ ...matchFilterFormData, entityType: value })}
                    disabled={!matchFilterFormData.namespace || !matchFilterFormData.schemaName}
                  >
                    <SelectTrigger id="match-filter-entityType">
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {getEntityTypeOptions(matchFilterFormData.namespace, matchFilterFormData.schemaName).map((entityType) => (
                        <SelectItem key={entityType} value={entityType}>
                          {entityType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button onClick={handleMatchAndGetFilter} disabled={loading} className="flex-1">
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Filter className="mr-2 h-4 w-4" />
                    )}
                    Get Filter
                  </Button>
                  <Button variant="outline" onClick={handleResetMatchFilter}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Match & Filter Result Display */}
            <Card>
              <CardHeader>
                <CardTitle>Match & Filter Result</CardTitle>
                <CardDescription>
                  Matched principals and SQL WHERE clause
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!matchFilterResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    Run a test to see results
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="font-medium text-muted-foreground">Matched Principals</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {matchFilterResult.matchedPrincipals.length > 0 ? (
                            matchFilterResult.matchedPrincipals.map((principalId) => (
                              <Badge key={principalId} variant="secondary">
                                {principalId}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">No principals matched</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Namespace</p>
                        <Badge variant="secondary">{matchFilterResult.namespace}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Schema Name</p>
                        <Badge variant="secondary">{matchFilterResult.schemaName}</Badge>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Entity Type</p>
                        <Badge variant="outline">{matchFilterResult.entityType}</Badge>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-muted-foreground mb-2">Filter Query</p>
                        <pre className="bg-muted p-3 rounded-lg overflow-auto text-xs font-mono">
                          {matchFilterResult.filterQuery || '(no filter - full access)'}
                        </pre>
                      </div>
                    </div>

                    <Separator />

                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">
                        View Full Response
                      </summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">
                        {JSON.stringify(matchFilterResult, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="capabilities" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Capabilities Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Capabilities Parameters</CardTitle>
                <CardDescription>
                  Get all capabilities for a principal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="capabilities-principal">Principal</Label>
                  <Select
                    value={capabilitiesFormData.principalId}
                    onValueChange={(value) =>
                      setCapabilitiesFormData({ ...capabilitiesFormData, principalId: value })
                    }
                  >
                    <SelectTrigger id="capabilities-principal">
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

                <Separator />

                <div className="flex gap-2">
                  <Button onClick={handleGetCapabilities} disabled={loading} className="flex-1">
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Get Capabilities
                  </Button>
                  <Button variant="outline" onClick={handleResetCapabilities}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Capabilities Result Display */}
            <Card>
              <CardHeader>
                <CardTitle>Capabilities Result</CardTitle>
                <CardDescription>
                  Principal permissions across entity types
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!capabilitiesResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    Run a test to see results
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(capabilitiesResult.entity_types).map(([entityType, capabilities]) => (
                      <div key={entityType} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-base">
                            {entityType}
                          </Badge>
                          {capabilities.truncated && (
                            <Badge variant="secondary">
                              Truncated ({capabilities.total_count} total)
                            </Badge>
                          )}
                        </div>

                        {capabilities.global_actions && capabilities.global_actions.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Global Actions</p>
                            <div className="flex flex-wrap gap-1">
                              {capabilities.global_actions.map((action) => (
                                <Badge key={action} variant="default" className="text-xs">
                                  {action}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {capabilities.entities && capabilities.entities.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">
                              Entity-Specific Permissions ({capabilities.entities.length})
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-2">
                              {capabilities.entities.map((entity) => (
                                <div
                                  key={entity.entity_id}
                                  className="bg-muted p-2 rounded text-xs space-y-1"
                                >
                                  <p className="font-mono font-medium">{entity.entity_id}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {entity.actions.map((action) => (
                                      <Badge key={action} variant="secondary" className="text-xs">
                                        {action}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <Separator />

                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">
                        View Full Response
                      </summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">
                        {JSON.stringify(capabilitiesResult, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="match-capabilities" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Match & Capabilities Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Match & Capabilities Parameters</CardTitle>
                <CardDescription>
                  Provide authentication credentials to match principals and get capabilities
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="match-cap-auth-type">Authentication Type</Label>
                  <Select
                    value={matchCapabilitiesFormData.authType}
                    onValueChange={(value: 'api_key' | 'oidc' | 'x509') =>
                      setMatchCapabilitiesFormData({ ...matchCapabilitiesFormData, authType: value, authMaterial: '' })
                    }
                  >
                    <SelectTrigger id="match-cap-auth-type">
                      <SelectValue placeholder="Select auth type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="x509">X.509 Certificate</SelectItem>
                      <SelectItem value="oidc">OIDC / JWT Token</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match-cap-auth-material">
                    {matchCapabilitiesFormData.authType === 'x509' && 'X.509 Certificate (PEM)'}
                    {matchCapabilitiesFormData.authType === 'oidc' && 'JWT Token'}
                    {matchCapabilitiesFormData.authType === 'api_key' && 'API Key'}
                  </Label>
                  <Textarea
                    id="match-cap-auth-material"
                    placeholder={
                      matchCapabilitiesFormData.authType === 'x509'
                        ? '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----'
                        : matchCapabilitiesFormData.authType === 'oidc'
                        ? 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
                        : 'your-api-key-here'
                    }
                    value={matchCapabilitiesFormData.authMaterial}
                    onChange={(e) =>
                      setMatchCapabilitiesFormData({ ...matchCapabilitiesFormData, authMaterial: e.target.value })
                    }
                    className="font-mono text-xs min-h-[120px]"
                  />
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button onClick={handleMatchAndGetCapabilities} disabled={loading} className="flex-1">
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Get Capabilities
                  </Button>
                  <Button variant="outline" onClick={handleResetMatchCapabilities}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Match & Capabilities Result Display */}
            <Card>
              <CardHeader>
                <CardTitle>Match & Capabilities Result</CardTitle>
                <CardDescription>
                  Matched principals and their capabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!matchCapabilitiesResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    Run a test to see results
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="font-medium text-muted-foreground">Matched Principals</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {matchCapabilitiesResult.matched_principals.length > 0 ? (
                            matchCapabilitiesResult.matched_principals.map((principalId) => (
                              <Badge key={principalId} variant="secondary">
                                {principalId}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">No principals matched</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {Object.entries(matchCapabilitiesResult.entity_types).map(([entityType, capabilities]) => (
                      <div key={entityType} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-base">
                            {entityType}
                          </Badge>
                          {capabilities.truncated && (
                            <Badge variant="secondary">
                              Truncated ({capabilities.total_count} total)
                            </Badge>
                          )}
                        </div>

                        {capabilities.global_actions && capabilities.global_actions.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Global Actions</p>
                            <div className="flex flex-wrap gap-1">
                              {capabilities.global_actions.map((action) => (
                                <Badge key={action} variant="default" className="text-xs">
                                  {action}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {capabilities.entities && capabilities.entities.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">
                              Entity-Specific Permissions ({capabilities.entities.length})
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-2">
                              {capabilities.entities.map((entity) => (
                                <div
                                  key={entity.entity_id}
                                  className="bg-muted p-2 rounded text-xs space-y-1"
                                >
                                  <p className="font-mono font-medium">{entity.entity_id}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {entity.actions.map((action) => (
                                      <Badge key={action} variant="secondary" className="text-xs">
                                        {action}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <Separator />

                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">
                        View Full Response
                      </summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">
                        {JSON.stringify(matchCapabilitiesResult, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
