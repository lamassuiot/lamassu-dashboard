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
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertCircle, CheckCircle, XCircle, Play, Filter, ShieldCheck, Globe, Database, TestTube2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  authorize, getFilter, matchAndAuthorize, matchAndGetFilter,
  getGlobalCapabilities, matchAndGetGlobalCapabilities,
  getEntityCapabilities, matchAndGetEntityCapabilities,
  listPrincipals, getSchemas,
} from '@/lib/authz-api';
import type {
  Principal, SchemaDefinition,
  AuthorizeResponse, FilterResponse,
  MatchAndAuthorizeResponse, MatchAndGetFilterResponse,
  GlobalCapabilitiesResponse, MatchGlobalCapabilitiesResponse,
  EntityCapabilitiesResponse, MatchEntityCapabilitiesResponse,
  FlexEntityKey,
} from '@/types/authz';


export default function AuthorizationTestPage() {
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Global match mode toggle + shared auth credentials
  const [matchMode, setMatchMode] = useState(false);
  const [authCreds, setAuthCreds] = useState({ authType: 'x509' as 'api_key' | 'oidc' | 'x509', value: '' });

  // Authorize
  const [authorizeForm, setAuthorizeForm] = useState({ principalId: '', namespace: '', schemaName: '', action: '', entityType: '', entityKey: '' });
  const [authorizeResult, setAuthorizeResult] = useState<AuthorizeResponse | MatchAndAuthorizeResponse | null>(null);

  // Filter
  const [filterForm, setFilterForm] = useState({ principalId: '', namespace: '', schemaName: '', entityType: '' });
  const [filterResult, setFilterResult] = useState<FilterResponse | MatchAndGetFilterResponse | null>(null);

  // Global Capabilities
  const [globalCapsForm, setGlobalCapsForm] = useState({ principalId: '' });
  const [globalCapsResult, setGlobalCapsResult] = useState<GlobalCapabilitiesResponse | MatchGlobalCapabilitiesResponse | null>(null);

  // Entity Capabilities
  const [entityCapsForm, setEntityCapsForm] = useState({ principalId: '' });
  const [entityCapsQuery, setEntityCapsQuery] = useState({ namespace: '', schemaName: '', entityType: '', entityKey: '' });
  const [entityCapsResult, setEntityCapsResult] = useState<EntityCapabilitiesResponse | MatchEntityCapabilitiesResponse | null>(null);

  // ─── Helpers ─────────────────────────────────────────────────

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

  const setEntityTargetValidationErrorIfNeeded = (namespace: string, schemaName: string, entityType: string): boolean => {
    const validationError = validateEntityTarget(namespace, schemaName, entityType);
    if (!validationError) return false;
    const trimmedEntityType = entityType.trim();
    setError(trimmedEntityType.includes('.') ? `Invalid entityType "${trimmedEntityType}": ${validationError}` : validationError);
    return true;
  };

  const getSchemaOptionsForNamespace = (namespace: string) =>
    Array.from(new Set(schemas.filter((s) => (s.namespace || '').trim() === namespace).map((s) => s.schemaName))).sort();

  const getEntityTypeOptions = (namespace: string, schemaName: string) =>
    schemas.filter((s) => (s.namespace || '').trim() === namespace && s.schemaName === schemaName).map((s) => s.entityType).sort();

  const getAvailableActions = (namespace: string, schemaName: string, entityType: string): string[] => {
    const schema = schemas.find((s) => (s.namespace || '').trim() === namespace && s.schemaName === schemaName && s.entityType === entityType);
    if (!schema) return [];
    return [...(schema.atomicActions || []), ...(schema.globalActions || [])];
  };

  const allNamespaces = Array.from(new Set(schemas.map((s) => (s.namespace || '').trim()).filter(Boolean))).sort();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [principalsData, schemasData] = await Promise.all([listPrincipals(), getSchemas()]);
      setPrincipals(principalsData.principals);
      setSchemas(schemasData);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    }
  };

  const handleToggleMatchMode = (enabled: boolean) => {
    setMatchMode(enabled);
    setAuthorizeResult(null);
    setFilterResult(null);
    setGlobalCapsResult(null);
    setEntityCapsResult(null);
    setError(null);
  };

  // ─── Handlers ────────────────────────────────────────────────

  /** Parse a user-supplied entityKey string as FlexEntityKey.
   * Plain string (e.g. "device-42") → passes through as-is.
   * JSON object (e.g. '{"device_id":"device-42"}') → parsed to Record.
   * Anything else (array, number…) throws with a helpful message.
   */
  const parseFlexEntityKey = (input: string): FlexEntityKey => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('{')) return trimmed; // plain string shorthand
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, string>;
      throw new Error('Entity key JSON must be an object, e.g. {"device_id": "device-42"}');
    } catch (e: any) {
      throw new Error(e.message ?? 'Entity key is not valid JSON — use a plain ID or a JSON object');
    }
  };

  const handleAuthorize = async () => {
    if (matchMode) {
      if (!authCreds.value || !authorizeForm.action) { setError('Auth material and action are required'); return; }
    } else {
      if (!authorizeForm.principalId || !authorizeForm.action) { setError('Principal and action are required'); return; }
    }
    if (setEntityTargetValidationErrorIfNeeded(authorizeForm.namespace, authorizeForm.schemaName, authorizeForm.entityType)) return;
    try {
      setLoading(true);
      setError(null);
      if (matchMode) {
        const entityKey = authorizeForm.entityKey ? parseFlexEntityKey(authorizeForm.entityKey) : undefined;
        setAuthorizeResult(await matchAndAuthorize({
          authMaterial: authCreds.value,
          authType: authCreds.authType,
          namespace: authorizeForm.namespace,
          schemaName: authorizeForm.schemaName,
          action: authorizeForm.action,
          entityType: authorizeForm.entityType,
          ...(entityKey !== undefined ? { entityKey } : {}),
        }));
      } else {
        setAuthorizeResult(await authorize({
          principalId: authorizeForm.principalId,
          namespace: authorizeForm.namespace,
          schemaName: authorizeForm.schemaName,
          action: authorizeForm.action,
          entityType: authorizeForm.entityType,
          ...(authorizeForm.entityKey ? { entityKey: parseFlexEntityKey(authorizeForm.entityKey) } : {}),
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Authorization test failed');
      setAuthorizeResult(null);
    } finally { setLoading(false); }
  };

  const handleFilter = async () => {
    if (matchMode) {
      if (!authCreds.value) { setError('Auth material is required'); return; }
    } else {
      if (!filterForm.principalId) { setError('Principal is required'); return; }
    }
    if (setEntityTargetValidationErrorIfNeeded(filterForm.namespace, filterForm.schemaName, filterForm.entityType)) return;
    try {
      setLoading(true);
      setError(null);
      if (matchMode) {
        setFilterResult(await matchAndGetFilter({ authMaterial: authCreds.value, authType: authCreds.authType, namespace: filterForm.namespace, schemaName: filterForm.schemaName, entityType: filterForm.entityType }));
      } else {
        setFilterResult(await getFilter({ principalId: filterForm.principalId, namespace: filterForm.namespace, schemaName: filterForm.schemaName, entityType: filterForm.entityType }));
      }
    } catch (err: any) {
      setError(err.message || 'Filter test failed');
      setFilterResult(null);
    } finally { setLoading(false); }
  };

  const handleGlobalCaps = async () => {
    if (matchMode) {
      if (!authCreds.value) { setError('Auth material is required'); return; }
    } else {
      if (!globalCapsForm.principalId) { setError('Principal ID is required'); return; }
    }
    try {
      setLoading(true);
      setError(null);
      if (matchMode) {
        setGlobalCapsResult(await matchAndGetGlobalCapabilities({ auth_type: authCreds.authType, auth_material: authCreds.value }));
      } else {
        setGlobalCapsResult(await getGlobalCapabilities({ principal_id: globalCapsForm.principalId }));
      }
    } catch (err: any) {
      setError(err.message || 'Get global capabilities failed');
      setGlobalCapsResult(null);
    } finally { setLoading(false); }
  };

  const handleEntityCaps = async () => {
    if (matchMode) {
      if (!authCreds.value) { setError('Auth material is required'); return; }
    } else {
      if (!entityCapsForm.principalId) { setError('Principal ID is required'); return; }
    }
    if (!entityCapsQuery.namespace || !entityCapsQuery.schemaName || !entityCapsQuery.entityType || !entityCapsQuery.entityKey) {
      setError('Namespace, schema name, entity type, and entity key are all required');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const q = { namespace: entityCapsQuery.namespace, schema_name: entityCapsQuery.schemaName, entity_type: entityCapsQuery.entityType, entity_key: parseFlexEntityKey(entityCapsQuery.entityKey) };
      if (matchMode) {
        setEntityCapsResult(await matchAndGetEntityCapabilities({ auth_type: authCreds.authType, auth_material: authCreds.value, queries: [q] }));
      } else {
        setEntityCapsResult(await getEntityCapabilities({ principal_id: entityCapsForm.principalId, queries: [q] }));
      }
    } catch (err: any) {
      setError(err.message || 'Get entity capabilities failed');
      setEntityCapsResult(null);
    } finally { setLoading(false); }
  };

  // ─── Shared render helpers ────────────────────────────────────

  const renderIdentitySection = (principalId: string, onPrincipalChange: (v: string) => void, idPrefix: string) => {
    if (matchMode) {
      return (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-auth-type`}>Authentication Type</Label>
            <Select
              value={authCreds.authType}
              onValueChange={(v: 'api_key' | 'oidc' | 'x509') => setAuthCreds({ ...authCreds, authType: v, value: '' })}
            >
              <SelectTrigger id={`${idPrefix}-auth-type`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="x509">X.509 Certificate</SelectItem>
                <SelectItem value="oidc">OIDC / JWT Token</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-auth-value`}>
              {authCreds.authType === 'x509' ? 'X.509 Certificate (PEM)' : authCreds.authType === 'oidc' ? 'JWT Token' : 'API Key'}
            </Label>
            <Textarea
              id={`${idPrefix}-auth-value`}
              placeholder={
                authCreds.authType === 'x509'
                  ? '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----'
                  : authCreds.authType === 'oidc'
                  ? 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
                  : 'your-api-key-here'
              }
              value={authCreds.value}
              onChange={(e) => setAuthCreds({ ...authCreds, value: e.target.value })}
              className="font-mono text-xs min-h-[120px]"
            />
          </div>
        </>
      );
    }
    return (
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-principal`}>Principal</Label>
        <Select value={principalId} onValueChange={onPrincipalChange}>
          <SelectTrigger id={`${idPrefix}-principal`}><SelectValue placeholder="Select principal" /></SelectTrigger>
          <SelectContent>
            {principals.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                <Badge variant="secondary" className="ml-2">{p.type}</Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const renderMatchedPrincipals = (ids: string[]) => (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-2">Matched Principals</p>
      <div className="flex flex-wrap gap-2">
        {ids.length > 0
          ? ids.map((p) => <Badge key={p} variant="secondary">{p}</Badge>)
          : <span className="text-sm text-muted-foreground">No principals matched</span>}
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <TestTube2 className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Authorization Test</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${!matchMode ? 'text-foreground' : 'text-muted-foreground'}`}>Principal</span>
          <Switch checked={matchMode} onCheckedChange={handleToggleMatchMode} id="match-mode-toggle" />
          <span className={`text-sm font-medium ${matchMode ? 'text-foreground' : 'text-muted-foreground'}`}>Match</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Test authorization rules and policies.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="authorize" className="w-full">
        <div className="border-b">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            <TabsTrigger value="authorize" className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none">
              <ShieldCheck className="h-4 w-4" />
              Authorize
            </TabsTrigger>
            <TabsTrigger value="filter" className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none">
              <Filter className="h-4 w-4" />
              Get Filter
            </TabsTrigger>
            <TabsTrigger value="global-caps" className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none">
              <Globe className="h-4 w-4" />
              Global Capabilities
            </TabsTrigger>
            <TabsTrigger value="entity-caps" className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none">
              <Database className="h-4 w-4" />
              Entity Capabilities
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Authorize ────────────────────────────────────────── */}
        <TabsContent value="authorize" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Test Parameters</CardTitle>
                <CardDescription>Configure the authorization test parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderIdentitySection(
                  authorizeForm.principalId,
                  (v) => setAuthorizeForm({ ...authorizeForm, principalId: v }),
                  'auth',
                )}

                <Separator />

                <div className="space-y-2">
                  <Label>Namespace</Label>
                  <Select
                    value={authorizeForm.namespace}
                    onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, namespace: v, schemaName: '', entityType: '', action: '' })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select namespace" /></SelectTrigger>
                    <SelectContent>
                      {allNamespaces.map((ns) => <SelectItem key={ns} value={ns}>{ns}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Schema Name</Label>
                  <Select
                    value={authorizeForm.schemaName}
                    onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, schemaName: v, entityType: '', action: '' })}
                    disabled={!authorizeForm.namespace}
                  >
                    <SelectTrigger><SelectValue placeholder="Select schema name" /></SelectTrigger>
                    <SelectContent>
                      {getSchemaOptionsForNamespace(authorizeForm.namespace).map((sn) => <SelectItem key={sn} value={sn}>{sn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Entity Type</Label>
                  <Select
                    value={authorizeForm.entityType}
                    onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, entityType: v, action: '' })}
                    disabled={!authorizeForm.namespace || !authorizeForm.schemaName}
                  >
                    <SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger>
                    <SelectContent>
                      {getEntityTypeOptions(authorizeForm.namespace, authorizeForm.schemaName).map((et) => <SelectItem key={et} value={et}>{et}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select
                    value={authorizeForm.action}
                    onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, action: v })}
                    disabled={!authorizeForm.entityType}
                  >
                    <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
                    <SelectContent>
                      {getAvailableActions(authorizeForm.namespace, authorizeForm.schemaName, authorizeForm.entityType).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{matchMode ? 'Entity Key (optional — omit for global actions)' : 'Entity Key (omit for global actions)'}</Label>
                  <Input
                    placeholder='device-42  or  {"device_id": "device-42"}'
                    value={authorizeForm.entityKey}
                    onChange={(e) => setAuthorizeForm({ ...authorizeForm, entityKey: e.target.value })}
                  />
                </div>

                <Separator />
                <div className="flex gap-2">
                  <Button onClick={handleAuthorize} disabled={loading} className="flex-1">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Test Authorization
                  </Button>
                  <Button variant="outline" onClick={() => { setAuthorizeForm({ principalId: '', namespace: '', schemaName: '', action: '', entityType: '', entityKey: '' }); setAuthorizeResult(null); setError(null); }}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Test Result</CardTitle>
                <CardDescription>Authorization decision and details</CardDescription>
              </CardHeader>
              <CardContent>
                {!authorizeResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">Run a test to see results</div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center py-6">
                      {authorizeResult.allowed ? (
                        <div className="text-center">
                          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-3" />
                          <h3 className="text-xl font-bold text-green-600">Allowed</h3>
                          <p className="text-sm text-muted-foreground mt-1">Authorization successful</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <XCircle className="h-16 w-16 text-red-600 mx-auto mb-3" />
                          <h3 className="text-xl font-bold text-red-600">Denied</h3>
                          <p className="text-sm text-muted-foreground mt-1">Authorization failed</p>
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div className="space-y-3 text-sm">
                      {'matchedPrincipals' in authorizeResult
                        ? renderMatchedPrincipals(authorizeResult.matchedPrincipals)
                        : <div><p className="font-medium text-muted-foreground">Principal ID</p><p className="font-mono">{authorizeResult.principalId}</p></div>
                      }
                      <div><p className="font-medium text-muted-foreground">Action</p><Badge>{authorizeResult.action}</Badge></div>
                      <div><p className="font-medium text-muted-foreground">Namespace</p><Badge variant="secondary">{authorizeResult.namespace}</Badge></div>
                      <div><p className="font-medium text-muted-foreground">Schema Name</p><Badge variant="secondary">{authorizeResult.schemaName}</Badge></div>
                      <div><p className="font-medium text-muted-foreground">Entity Type</p><Badge variant="outline">{authorizeResult.entityType}</Badge></div>
                      <div><p className="font-medium text-muted-foreground">Entity Key</p><pre className="font-mono text-xs">{JSON.stringify(authorizeResult.entityKey, null, 2)}</pre></div>
                    </div>
                    <Separator />
                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">View Full Response</summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">{JSON.stringify(authorizeResult, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Get Filter ───────────────────────────────────────── */}
        <TabsContent value="filter" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Filter Parameters</CardTitle>
                <CardDescription>Configure the filter test parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderIdentitySection(
                  filterForm.principalId,
                  (v) => setFilterForm({ ...filterForm, principalId: v }),
                  'filter',
                )}

                <Separator />

                <div className="space-y-2">
                  <Label>Namespace</Label>
                  <Select
                    value={filterForm.namespace}
                    onValueChange={(v) => setFilterForm({ ...filterForm, namespace: v, schemaName: '', entityType: '' })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select namespace" /></SelectTrigger>
                    <SelectContent>
                      {allNamespaces.map((ns) => <SelectItem key={ns} value={ns}>{ns}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Schema Name</Label>
                  <Select
                    value={filterForm.schemaName}
                    onValueChange={(v) => setFilterForm({ ...filterForm, schemaName: v, entityType: '' })}
                    disabled={!filterForm.namespace}
                  >
                    <SelectTrigger><SelectValue placeholder="Select schema name" /></SelectTrigger>
                    <SelectContent>
                      {getSchemaOptionsForNamespace(filterForm.namespace).map((sn) => <SelectItem key={sn} value={sn}>{sn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Entity Type</Label>
                  <Select
                    value={filterForm.entityType}
                    onValueChange={(v) => setFilterForm({ ...filterForm, entityType: v })}
                    disabled={!filterForm.namespace || !filterForm.schemaName}
                  >
                    <SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger>
                    <SelectContent>
                      {getEntityTypeOptions(filterForm.namespace, filterForm.schemaName).map((et) => <SelectItem key={et} value={et}>{et}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />
                <div className="flex gap-2">
                  <Button onClick={handleFilter} disabled={loading} className="flex-1">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                    Get Filter
                  </Button>
                  <Button variant="outline" onClick={() => { setFilterForm({ principalId: '', namespace: '', schemaName: '', entityType: '' }); setFilterResult(null); setError(null); }}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Filter Result</CardTitle>
                <CardDescription>SQL WHERE clause and arguments</CardDescription>
              </CardHeader>
              <CardContent>
                {!filterResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">Run a test to see results</div>
                ) : (
                  <div className="space-y-4">
                    {'matchedPrincipals' in filterResult && (
                      <>
                        {renderMatchedPrincipals(filterResult.matchedPrincipals)}
                        <Separator />
                      </>
                    )}
                    <div className="space-y-3 text-sm">
                      <div><p className="font-medium text-muted-foreground">Namespace</p><Badge variant="secondary">{filterResult.namespace}</Badge></div>
                      <div><p className="font-medium text-muted-foreground">Schema Name</p><Badge variant="secondary">{filterResult.schemaName}</Badge></div>
                      <div><p className="font-medium text-muted-foreground">Entity Type</p><Badge variant="outline">{filterResult.entityType}</Badge></div>
                    </div>
                    <Separator />
                    <div>
                      <p className="font-medium text-muted-foreground mb-2">Filter Query</p>
                      <pre className="bg-muted p-3 rounded-lg overflow-auto text-xs font-mono">
                        {filterResult.filterQuery || '(no filter - full access)'}
                      </pre>
                    </div>
                    <Separator />
                    <details className="border rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">View Full Response</summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">{JSON.stringify(filterResult, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Global Capabilities ──────────────────────────────── */}
        <TabsContent value="global-caps" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Global Capabilities</CardTitle>
                <CardDescription>
                  {matchMode
                    ? 'Resolve the principal from auth material, then return allowed global actions'
                    : 'Get all global actions allowed for a known principal across every entity type'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderIdentitySection(
                  globalCapsForm.principalId,
                  (v) => setGlobalCapsForm({ principalId: v }),
                  'gc',
                )}
                <Separator />
                <div className="flex gap-2">
                  <Button onClick={handleGlobalCaps} disabled={loading} className="flex-1">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Get Global Capabilities
                  </Button>
                  <Button variant="outline" onClick={() => { setGlobalCapsForm({ principalId: '' }); setGlobalCapsResult(null); setError(null); }}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Result</CardTitle>
                <CardDescription>Allowed global actions per entity type key</CardDescription>
              </CardHeader>
              <CardContent>
                {!globalCapsResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Run a test to see results</div>
                ) : (
                  <div className="space-y-3">
                    {'matched_principals' in globalCapsResult && (
                      <>
                        {renderMatchedPrincipals(globalCapsResult.matched_principals)}
                        <Separator />
                      </>
                    )}
                    {Object.keys(globalCapsResult.global_actions).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No global actions granted</p>
                    ) : (
                      Object.entries(globalCapsResult.global_actions).map(([key, actions]) => (
                        <div key={key} className="border rounded-md p-3 space-y-2">
                          <p className="text-xs font-mono text-muted-foreground">{key}</p>
                          <div className="flex flex-wrap gap-1">
                            {actions.map((a) => <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>)}
                          </div>
                        </div>
                      ))
                    )}
                    <Separator />
                    <details className="border rounded-md">
                      <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">View Full Response</summary>
                      <pre className="bg-muted p-4 overflow-auto text-xs">{JSON.stringify(globalCapsResult, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Entity Capabilities ──────────────────────────────── */}
        <TabsContent value="entity-caps" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Entity Capabilities</CardTitle>
                <CardDescription>
                  {matchMode
                    ? 'Resolve the principal from auth material, then return allowed actions on the entity'
                    : 'Get allowed actions for a known principal on a specific entity'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderIdentitySection(
                  entityCapsForm.principalId,
                  (v) => setEntityCapsForm({ principalId: v }),
                  'ec',
                )}

                <Separator />

                <div className="space-y-2">
                  <Label>Namespace</Label>
                  <Select
                    value={entityCapsQuery.namespace}
                    onValueChange={(v) => setEntityCapsQuery({ ...entityCapsQuery, namespace: v, schemaName: '', entityType: '' })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select namespace" /></SelectTrigger>
                    <SelectContent>
                      {allNamespaces.map((ns) => <SelectItem key={ns} value={ns}>{ns}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Schema Name</Label>
                  <Select
                    value={entityCapsQuery.schemaName}
                    onValueChange={(v) => setEntityCapsQuery({ ...entityCapsQuery, schemaName: v, entityType: '' })}
                    disabled={!entityCapsQuery.namespace}
                  >
                    <SelectTrigger><SelectValue placeholder="Select schema name" /></SelectTrigger>
                    <SelectContent>
                      {getSchemaOptionsForNamespace(entityCapsQuery.namespace).map((sn) => <SelectItem key={sn} value={sn}>{sn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Entity Type</Label>
                  <Select
                    value={entityCapsQuery.entityType}
                    onValueChange={(v) => setEntityCapsQuery({ ...entityCapsQuery, entityType: v })}
                    disabled={!entityCapsQuery.namespace || !entityCapsQuery.schemaName}
                  >
                    <SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger>
                    <SelectContent>
                      {getEntityTypeOptions(entityCapsQuery.namespace, entityCapsQuery.schemaName).map((et) => <SelectItem key={et} value={et}>{et}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Entity Key (omit for global actions)</Label>
                  <Input
                    placeholder='device-42  or  {"device_id": "device-42"}'
                    value={entityCapsQuery.entityKey}
                    onChange={(e) => setEntityCapsQuery({ ...entityCapsQuery, entityKey: e.target.value })}
                  />
                </div>

                <Separator />
                <div className="flex gap-2">
                  <Button onClick={handleEntityCaps} disabled={loading} className="flex-1">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Get Entity Capabilities
                  </Button>
                  <Button variant="outline" onClick={() => { setEntityCapsForm({ principalId: '' }); setEntityCapsQuery({ namespace: '', schemaName: '', entityType: '', entityKey: '' }); setEntityCapsResult(null); setError(null); }}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Result</CardTitle>
                <CardDescription>Allowed actions for the principal on this entity. No actions means no access.</CardDescription>
              </CardHeader>
              <CardContent>
                {!entityCapsResult ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Run a test to see results</div>
                ) : (() => {
                  const r = entityCapsResult.results[0];
                  return (
                    <div className="space-y-4">
                      {'matched_principals' in entityCapsResult && (
                        <>
                          {renderMatchedPrincipals(entityCapsResult.matched_principals)}
                          <Separator />
                        </>
                      )}
                      <div className="space-y-3 text-sm">
                        <div><p className="font-medium text-muted-foreground">Namespace</p><Badge variant="secondary">{r.namespace}</Badge></div>
                        <div><p className="font-medium text-muted-foreground">Schema Name</p><Badge variant="secondary">{r.schema_name}</Badge></div>
                        <div><p className="font-medium text-muted-foreground">Entity Type</p><Badge variant="outline">{r.entity_type}</Badge></div>
                        <div><p className="font-medium text-muted-foreground">Entity Key</p><pre className="font-mono text-xs">{JSON.stringify(r.entity_key, null, 2)}</pre></div>
                      </div>
                      <Separator />
                      <div>
                        <p className="font-medium text-muted-foreground text-sm mb-2">Allowed Actions</p>
                        {r.error ? (
                          <div className="flex items-center gap-2 rounded-lg border-l-4 border-l-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{r.error}</span>
                          </div>
                        ) : r.actions.length === 0 ? (
                          <div className="flex items-center gap-2 rounded-lg border-l-4 border-l-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>No access — this principal has no allowed actions on this entity.</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.actions.map((a) => <Badge key={a} variant="secondary">{a}</Badge>)}
                          </div>
                        )}
                      </div>
                      <Separator />
                      <details className="border rounded-md">
                        <summary className="cursor-pointer p-3 hover:bg-muted text-sm font-medium">View Full Response</summary>
                        <pre className="bg-muted p-4 overflow-auto text-xs">{JSON.stringify(entityCapsResult, null, 2)}</pre>
                      </details>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

