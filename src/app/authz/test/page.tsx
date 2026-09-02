'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Loader2, AlertCircle, ShieldCheck, Play, Filter, Globe, Database, TestTube2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  pageTabsListClass,
  pageTabsTriggerClass,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';
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
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { cn } from '@/lib/utils';
import { HttpAuthzCheckForm } from '@/components/authz/HttpAuthzCheckForm';
import { EmptyResult, FullResponse, DecisionBanner, ResultTable, MatchedPrincipals } from '@/components/authz/TestResultViews';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

export default function AuthorizationTestPage() {
  const searchParams = useSearchParams();
  const principalIdParam = searchParams.get('principal_id');
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam === 'http' ? 'http' : 'authorize');
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [schemas, setSchemas] = useState<SchemaDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [httpInitialPrincipalId, setHttpInitialPrincipalId] = useState<string | null>(principalIdParam);

  const [matchMode, setMatchMode] = useState(false);
  const [authCreds, setAuthCreds] = useState({ auth_type: 'oidc' as 'oidc' | 'x509', value: '' });

  const [authorizeForm, setAuthorizeForm] = useState({ principal_id: '', namespace: '', schema_name: '', action: '', entity_type: '', entity_key: '' });
  const [authorizeResult, setAuthorizeResult] = useState<AuthorizeResponse | MatchAndAuthorizeResponse | null>(null);

  const [filterForm, setFilterForm] = useState({ principal_id: '', namespace: '', schema_name: '', entity_type: '' });
  const [filterResult, setFilterResult] = useState<FilterResponse | MatchAndGetFilterResponse | null>(null);

  const [globalCapsForm, setGlobalCapsForm] = useState({ principal_id: '' });
  const [globalCapsResult, setGlobalCapsResult] = useState<GlobalCapabilitiesResponse | MatchGlobalCapabilitiesResponse | null>(null);

  const [entityCapsForm, setEntityCapsForm] = useState({ principal_id: '' });
  const [entityCapsQuery, setEntityCapsQuery] = useState({ namespace: '', schema_name: '', entity_type: '', entity_key: '' });
  const [entityCapsResult, setEntityCapsResult] = useState<EntityCapabilitiesResponse | MatchEntityCapabilitiesResponse | null>(null);

  // ─── Helpers ─────────────────────────────────────────────────

  const getSchemaOptionsForNamespace = (namespace: string) =>
    Array.from(new Set(schemas.filter((s) => (s.namespace || '').trim() === namespace).map((s) => s.schema_name))).sort((a, b) => a.localeCompare(b));

  const getEntityTypeOptions = (namespace: string, schema_name: string) =>
    schemas.filter((s) => (s.namespace || '').trim() === namespace && s.schema_name === schema_name).map((s) => s.entity_type).sort((a, b) => a.localeCompare(b));

  const getAvailableActions = (namespace: string, schema_name: string, entity_type: string): string[] => {
    const schema = schemas.find((s) => (s.namespace || '').trim() === namespace && s.schema_name === schema_name && s.entity_type === entity_type);
    if (!schema) return [];
    return [...(schema.atomic_actions || []), ...(schema.global_actions || [])];
  };

  const allNamespaces = Array.from(new Set(schemas.map((s) => (s.namespace || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (tabParam === 'http') {
      setActiveTab('http');
    }
  }, [tabParam]);

  useEffect(() => {
    const pendingHTTPCheck = window.sessionStorage.getItem('authz.http_check.open') === '1';
    const pendingPrincipalId = window.sessionStorage.getItem('authz.http_check.principal_id');

    if (pendingPrincipalId) setHttpInitialPrincipalId(pendingPrincipalId);
    if (pendingHTTPCheck) {
      setActiveTab('http');
    }

    window.sessionStorage.removeItem('authz.http_check.open');
    window.sessionStorage.removeItem('authz.http_check.principal_id');
  }, []);

  const loadData = async () => {
    try {
      const [principalsData, schemasData] = await Promise.all([listPrincipals(), getSchemas()]);
      setPrincipals(principalsData.list);
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

  const parseFlexEntityKey = (input: string): FlexEntityKey => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('{')) return trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, string>;
      throw new Error('Entity key JSON must be an object, e.g. {"device_id": "device-42"}');
    } catch (e: any) {
      throw new Error(e.message ?? 'Entity key is not valid JSON — use a plain ID or a JSON object');
    }
  };

  const getIdentityError = (principalId: string) => matchMode
    ? (!authCreds.value.trim() ? 'Authentication Material required. Provide a JWT token or X.509 certificate.' : null)
    : (!principalId ? 'Principal required. Select the principal to test.' : null);
  const getEntityTypeError = (value: string) => {
    if (!value.trim()) return 'Entity Type required. Select an entity type.';
    if (value.trim().includes('.')) return 'Entity Type must be unqualified. Select the schema separately.';
    return null;
  };
  const getEntityKeyError = (value: string, required: boolean) => {
    if (!value.trim()) return required ? 'Entity Key required. Enter a plain ID or JSON object.' : null;
    if (!value.trim().startsWith('{')) return null;
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? null
        : 'Entity Key must be a plain ID or JSON object.';
    } catch {
      return 'Entity Key contains invalid JSON. Enter a plain ID or valid JSON object.';
    }
  };

  const authorizeFieldErrors = {
    identity: getIdentityError(authorizeForm.principal_id),
    namespace: !authorizeForm.namespace ? 'Namespace required. Select a namespace.' : null,
    schema: !authorizeForm.schema_name ? 'Schema Name required. Select a schema.' : null,
    entityType: getEntityTypeError(authorizeForm.entity_type),
    action: !authorizeForm.action ? 'Action required. Select an action to test.' : null,
    entityKey: getEntityKeyError(authorizeForm.entity_key, false),
  };
  const authorizeValidationErrors = Object.values(authorizeFieldErrors).filter((value): value is string => !!value);
  const filterFieldErrors = {
    identity: getIdentityError(filterForm.principal_id),
    namespace: !filterForm.namespace ? 'Namespace required. Select a namespace.' : null,
    schema: !filterForm.schema_name ? 'Schema Name required. Select a schema.' : null,
    entityType: getEntityTypeError(filterForm.entity_type),
  };
  const filterValidationErrors = Object.values(filterFieldErrors).filter((value): value is string => !!value);
  const globalCapsIdentityError = getIdentityError(globalCapsForm.principal_id);
  const globalCapsValidationErrors = globalCapsIdentityError ? [globalCapsIdentityError] : [];
  const entityCapsFieldErrors = {
    identity: getIdentityError(entityCapsForm.principal_id),
    namespace: !entityCapsQuery.namespace ? 'Namespace required. Select a namespace.' : null,
    schema: !entityCapsQuery.schema_name ? 'Schema Name required. Select a schema.' : null,
    entityType: getEntityTypeError(entityCapsQuery.entity_type),
    entityKey: getEntityKeyError(entityCapsQuery.entity_key, true),
  };
  const entityCapsValidationErrors = Object.values(entityCapsFieldErrors).filter((value): value is string => !!value);

  const handleAuthorize = async () => {
    if (authorizeValidationErrors.length > 0) return;
    try {
      setLoading(true); setError(null);
      if (matchMode) {
        const entity_key = authorizeForm.entity_key ? parseFlexEntityKey(authorizeForm.entity_key) : undefined;
        setAuthorizeResult(await matchAndAuthorize({ auth_material: authCreds.value, auth_type: authCreds.auth_type, namespace: authorizeForm.namespace, schema_name: authorizeForm.schema_name, action: authorizeForm.action, entity_type: authorizeForm.entity_type, ...(entity_key !== undefined ? { entity_key } : {}) }));
      } else {
        setAuthorizeResult(await authorize({ principal_id: authorizeForm.principal_id, namespace: authorizeForm.namespace, schema_name: authorizeForm.schema_name, action: authorizeForm.action, entity_type: authorizeForm.entity_type, ...(authorizeForm.entity_key ? { entity_key: parseFlexEntityKey(authorizeForm.entity_key) } : {}) }));
      }
    } catch (err: any) {
      setError(err.message || 'Authorization test failed'); setAuthorizeResult(null);
    } finally { setLoading(false); }
  };

  const handleFilter = async () => {
    if (filterValidationErrors.length > 0) return;
    try {
      setLoading(true); setError(null);
      if (matchMode) {
        setFilterResult(await matchAndGetFilter({ auth_material: authCreds.value, auth_type: authCreds.auth_type, namespace: filterForm.namespace, schema_name: filterForm.schema_name, entity_type: filterForm.entity_type }));
      } else {
        setFilterResult(await getFilter({ principal_id: filterForm.principal_id, namespace: filterForm.namespace, schema_name: filterForm.schema_name, entity_type: filterForm.entity_type }));
      }
    } catch (err: any) {
      setError(err.message || 'Filter test failed'); setFilterResult(null);
    } finally { setLoading(false); }
  };

  const handleGlobalCaps = async () => {
    if (globalCapsValidationErrors.length > 0) return;
    try {
      setLoading(true); setError(null);
      if (matchMode) {
        setGlobalCapsResult(await matchAndGetGlobalCapabilities({ auth_type: authCreds.auth_type, auth_material: authCreds.value }));
      } else {
        setGlobalCapsResult(await getGlobalCapabilities({ principal_id: globalCapsForm.principal_id }));
      }
    } catch (err: any) {
      setError(err.message || 'Get global capabilities failed'); setGlobalCapsResult(null);
    } finally { setLoading(false); }
  };

  const handleEntityCaps = async () => {
    if (entityCapsValidationErrors.length > 0) return;
    try {
      setLoading(true); setError(null);
      const q = { namespace: entityCapsQuery.namespace, schema_name: entityCapsQuery.schema_name, entity_type: entityCapsQuery.entity_type, entity_key: parseFlexEntityKey(entityCapsQuery.entity_key) };
      if (matchMode) {
        setEntityCapsResult(await matchAndGetEntityCapabilities({ auth_type: authCreds.auth_type, auth_material: authCreds.value, queries: [q] }));
      } else {
        setEntityCapsResult(await getEntityCapabilities({ principal_id: entityCapsForm.principal_id, queries: [q] }));
      }
    } catch (err: any) {
      setError(err.message || 'Get entity capabilities failed'); setEntityCapsResult(null);
    } finally { setLoading(false); }
  };

  // ─── Render helpers ───────────────────────────────────────────

  const renderIdentitySection = (
    principal_id: string,
    onPrincipalChange: (v: string) => void,
    idPrefix: string,
    validationError: string | null,
  ) => {
    if (matchMode) {
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-auth-type`}>Authentication Type</Label>
            <Select
              value={authCreds.auth_type}
              onValueChange={(v: 'oidc' | 'x509') => setAuthCreds({ ...authCreds, auth_type: v, value: '' })}
            >
              <SelectTrigger id={`${idPrefix}-auth-type`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oidc">OIDC / JWT Token</SelectItem>
                <SelectItem value="x509">X.509 Certificate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-auth-value`}>
              {authCreds.auth_type === 'x509' ? 'X.509 Certificate (PEM)' : 'JWT Token'}
            </Label>
            {authCreds.auth_type === 'x509' ? (
              <CertificatePemTextarea
                id={`${idPrefix}-auth-value`}
                placeholder="-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----"
                value={authCreds.value}
                onValueChange={(value) => setAuthCreds({ ...authCreds, value })}
                className="font-mono text-xs min-h-[120px]"
                aria-invalid={!!validationError}
                aria-describedby={validationError ? `${idPrefix}-identity-error` : undefined}
              />
            ) : (
              <Textarea
                id={`${idPrefix}-auth-value`}
                placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={authCreds.value}
                onChange={(e) => setAuthCreds({ ...authCreds, value: e.target.value })}
                className="font-mono text-xs min-h-[120px]"
                aria-invalid={!!validationError}
                aria-describedby={validationError ? `${idPrefix}-identity-error` : undefined}
              />
            )}
            {validationError && (
              <FormFieldError
                id={`${idPrefix}-identity-error`}
                title="Authentication Material required."
                description="Provide a JWT token or X.509 certificate."
              />
            )}
          </div>
        </>
      );
    }
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-principal`}>Principal</Label>
        <Select value={principal_id} onValueChange={onPrincipalChange}>
          <SelectTrigger
            id={`${idPrefix}-principal`}
            className="w-full"
            aria-invalid={!!validationError}
            aria-describedby={validationError ? `${idPrefix}-identity-error` : undefined}
          ><SelectValue placeholder="Select principal" /></SelectTrigger>
          <SelectContent>
            {principals.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                <Badge variant="secondary" className="ml-2">{p.type}</Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {validationError && (
          <FormFieldError
            id={`${idPrefix}-identity-error`}
            title="Principal required."
            description="Select the principal to test."
          />
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <BreadcrumbPage
      className="space-y-6 pb-8"
      items={[{ label: 'Home', href: '/' }, { label: 'Authorization', href: '/authz' }, { label: 'Test' }]}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <TestTube2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Authorization Test</h1>
            <p className="text-sm text-muted-foreground mt-1">Test authorization rules and policies.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 rounded-md border bg-card px-3 py-1.5">
          <span className={cn('text-xs font-medium', !matchMode ? 'text-foreground' : 'text-muted-foreground')}>Principal</span>
          <Switch checked={matchMode} onCheckedChange={handleToggleMatchMode} id="match-mode-toggle" />
          <span className={cn('text-xs font-medium', matchMode ? 'text-foreground' : 'text-muted-foreground')}>Match</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setError(null); }} className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
            <TabsTrigger value="authorize" className={pageTabsTriggerClass}>
              <ShieldCheck className="h-4 w-4" /> Authorize
            </TabsTrigger>
            <TabsTrigger value="filter" className={pageTabsTriggerClass}>
              <Filter className="h-4 w-4" /> Get Filter
            </TabsTrigger>
            <TabsTrigger value="global-caps" className={pageTabsTriggerClass}>
              <Globe className="h-4 w-4" /> Global Capabilities
            </TabsTrigger>
            <TabsTrigger value="entity-caps" className={pageTabsTriggerClass}>
              <Database className="h-4 w-4" /> Entity Capabilities
            </TabsTrigger>
            <TabsTrigger value="http" className={pageTabsTriggerClass}>
              <Play className="h-4 w-4" /> HTTP Route
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Authorize ────────────────────────────────────────── */}
        <TabsContent value="authorize" className="mt-6">
          <div className="grid gap-0 md:grid-cols-2 md:divide-x">
            <div className="space-y-4 md:pr-8">
              <div>
                <p className="text-sm font-semibold">Parameters</p>
                <p className="text-xs text-muted-foreground mt-0.5">Configure the authorization test parameters</p>
              </div>
              {renderIdentitySection(authorizeForm.principal_id, (v) => setAuthorizeForm({ ...authorizeForm, principal_id: v }), 'auth', authorizeFieldErrors.identity)}
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="authorize-namespace">Namespace</Label>
                <Select value={authorizeForm.namespace} onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, namespace: v, schema_name: '', entity_type: '', action: '' })}>
                  <SelectTrigger id="authorize-namespace" className="w-full" aria-invalid={!!authorizeFieldErrors.namespace} aria-describedby={authorizeFieldErrors.namespace ? 'authorize-namespace-error' : undefined}><SelectValue placeholder="Select namespace" /></SelectTrigger>
                  <SelectContent>{allNamespaces.map((ns) => <SelectItem key={ns} value={ns}>{ns}</SelectItem>)}</SelectContent>
                </Select>
                {authorizeFieldErrors.namespace && <FormFieldError id="authorize-namespace-error" title="Namespace required." description="Select a namespace." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authorize-schema">Schema Name</Label>
                <Select value={authorizeForm.schema_name} onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, schema_name: v, entity_type: '', action: '' })} disabled={!authorizeForm.namespace}>
                  <SelectTrigger id="authorize-schema" className="w-full" aria-invalid={!!authorizeFieldErrors.schema} aria-describedby={authorizeFieldErrors.schema ? 'authorize-schema-error' : undefined}><SelectValue placeholder="Select schema name" /></SelectTrigger>
                  <SelectContent>{getSchemaOptionsForNamespace(authorizeForm.namespace).map((sn) => <SelectItem key={sn} value={sn}>{sn}</SelectItem>)}</SelectContent>
                </Select>
                {authorizeFieldErrors.schema && <FormFieldError id="authorize-schema-error" title="Schema Name required." description="Select a schema." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authorize-entity-type">Entity Type</Label>
                <Select value={authorizeForm.entity_type} onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, entity_type: v, action: '' })} disabled={!authorizeForm.namespace || !authorizeForm.schema_name}>
                  <SelectTrigger id="authorize-entity-type" className="w-full" aria-invalid={!!authorizeFieldErrors.entityType} aria-describedby={authorizeFieldErrors.entityType ? 'authorize-entity-type-error' : undefined}><SelectValue placeholder="Select entity type" /></SelectTrigger>
                  <SelectContent>{getEntityTypeOptions(authorizeForm.namespace, authorizeForm.schema_name).map((et) => <SelectItem key={et} value={et}>{et}</SelectItem>)}</SelectContent>
                </Select>
                {authorizeFieldErrors.entityType && <FormFieldError id="authorize-entity-type-error" title="Entity Type required." description={authorizeFieldErrors.entityType.replace(/^Entity Type (required\. )?/, '')} />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authorize-action">Action</Label>
                <Select value={authorizeForm.action} onValueChange={(v) => setAuthorizeForm({ ...authorizeForm, action: v })} disabled={!authorizeForm.entity_type}>
                  <SelectTrigger id="authorize-action" className="w-full" aria-invalid={!!authorizeFieldErrors.action} aria-describedby={authorizeFieldErrors.action ? 'authorize-action-error' : undefined}><SelectValue placeholder="Select action" /></SelectTrigger>
                  <SelectContent>{getAvailableActions(authorizeForm.namespace, authorizeForm.schema_name, authorizeForm.entity_type).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
                {authorizeFieldErrors.action && <FormFieldError id="authorize-action-error" title="Action required." description="Select an action to test." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authorize-entity-key">{matchMode ? 'Entity Key (optional — omit for global actions)' : 'Entity Key (omit for global actions)'}</Label>
                <Input id="authorize-entity-key" placeholder='device-42  or  {"device_id": "device-42"}' value={authorizeForm.entity_key} onChange={(e) => setAuthorizeForm({ ...authorizeForm, entity_key: e.target.value })} aria-invalid={!!authorizeFieldErrors.entityKey} aria-describedby={authorizeFieldErrors.entityKey ? 'authorize-entity-key-error' : undefined} />
                {authorizeFieldErrors.entityKey && <FormFieldError id="authorize-entity-key-error" title="Invalid Entity Key." description={authorizeFieldErrors.entityKey} />}
              </div>
              <Separator />
              <FormValidationSummary errors={[...authorizeValidationErrors, ...(error ? [`Request: ${error}`] : [])]} />
              <Button onClick={handleAuthorize} disabled={loading || authorizeValidationErrors.length > 0}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Test Authorization
              </Button>
            </div>

            <div className="space-y-4 md:pl-8 mt-8 md:mt-0">
              <p className="text-sm font-semibold">Result</p>
              {!authorizeResult ? <EmptyResult /> : (
                <div className="space-y-4">
                  <DecisionBanner
                    allowed={authorizeResult.allowed}
                    label={authorizeResult.allowed ? 'Access Allowed' : 'Access Denied'}
                    detail={authorizeResult.allowed ? 'The principal is authorized to perform this action.' : 'The principal is not authorized to perform this action.'}
                  />
                  {'matched_principals' in authorizeResult && (
                    <MatchedPrincipals ids={authorizeResult.matched_principals} principals={principals} />
                  )}
                  <ResultTable rows={[
                    ...('matched_principals' in authorizeResult ? [] : [{ label: 'Principal', value: <span className="font-mono">{authorizeResult.principal_id}</span> }]),
                    { label: 'Action', value: <span className="font-mono font-medium">{authorizeResult.action}</span> },
                    { label: 'Namespace', value: <span className="font-mono">{authorizeResult.namespace}</span> },
                    { label: 'Schema', value: <span className="font-mono">{authorizeResult.schema_name}</span> },
                    { label: 'Entity Type', value: <span className="font-mono">{authorizeResult.entity_type}</span> },
                    ...(authorizeResult.entity_key !== undefined ? [{ label: 'Entity Key', value: <span className="font-mono">{JSON.stringify(authorizeResult.entity_key)}</span> }] : []),
                  ]} />
                  <FullResponse data={authorizeResult} />
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Get Filter ───────────────────────────────────────── */}
        <TabsContent value="filter" className="mt-6">
          <div className="grid gap-0 md:grid-cols-2 md:divide-x">
            <div className="space-y-4 md:pr-8">
              <div>
                <p className="text-sm font-semibold">Parameters</p>
                <p className="text-xs text-muted-foreground mt-0.5">Configure the filter test parameters</p>
              </div>
              {renderIdentitySection(filterForm.principal_id, (v) => setFilterForm({ ...filterForm, principal_id: v }), 'filter', filterFieldErrors.identity)}
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="filter-namespace">Namespace</Label>
                <Select value={filterForm.namespace} onValueChange={(v) => setFilterForm({ ...filterForm, namespace: v, schema_name: '', entity_type: '' })}>
                  <SelectTrigger id="filter-namespace" className="w-full" aria-invalid={!!filterFieldErrors.namespace} aria-describedby={filterFieldErrors.namespace ? 'filter-namespace-error' : undefined}><SelectValue placeholder="Select namespace" /></SelectTrigger>
                  <SelectContent>{allNamespaces.map((ns) => <SelectItem key={ns} value={ns}>{ns}</SelectItem>)}</SelectContent>
                </Select>
                {filterFieldErrors.namespace && <FormFieldError id="filter-namespace-error" title="Namespace required." description="Select a namespace." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-schema">Schema Name</Label>
                <Select value={filterForm.schema_name} onValueChange={(v) => setFilterForm({ ...filterForm, schema_name: v, entity_type: '' })} disabled={!filterForm.namespace}>
                  <SelectTrigger id="filter-schema" className="w-full" aria-invalid={!!filterFieldErrors.schema} aria-describedby={filterFieldErrors.schema ? 'filter-schema-error' : undefined}><SelectValue placeholder="Select schema name" /></SelectTrigger>
                  <SelectContent>{getSchemaOptionsForNamespace(filterForm.namespace).map((sn) => <SelectItem key={sn} value={sn}>{sn}</SelectItem>)}</SelectContent>
                </Select>
                {filterFieldErrors.schema && <FormFieldError id="filter-schema-error" title="Schema Name required." description="Select a schema." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-entity-type">Entity Type</Label>
                <Select value={filterForm.entity_type} onValueChange={(v) => setFilterForm({ ...filterForm, entity_type: v })} disabled={!filterForm.namespace || !filterForm.schema_name}>
                  <SelectTrigger id="filter-entity-type" className="w-full" aria-invalid={!!filterFieldErrors.entityType} aria-describedby={filterFieldErrors.entityType ? 'filter-entity-type-error' : undefined}><SelectValue placeholder="Select entity type" /></SelectTrigger>
                  <SelectContent>{getEntityTypeOptions(filterForm.namespace, filterForm.schema_name).map((et) => <SelectItem key={et} value={et}>{et}</SelectItem>)}</SelectContent>
                </Select>
                {filterFieldErrors.entityType && <FormFieldError id="filter-entity-type-error" title="Entity Type required." description="Select an entity type." />}
              </div>
              <Separator />
              <FormValidationSummary errors={[...filterValidationErrors, ...(error ? [`Request: ${error}`] : [])]} />
              <Button onClick={handleFilter} disabled={loading || filterValidationErrors.length > 0}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                Get Filter
              </Button>
            </div>

            <div className="space-y-4 md:pl-8 mt-8 md:mt-0">
              <p className="text-sm font-semibold">Result</p>
              {!filterResult ? <EmptyResult /> : (
                <div className="space-y-4">
                  {'matched_principals' in filterResult && (
                    <MatchedPrincipals ids={filterResult.matched_principals} principals={principals} />
                  )}
                  <ResultTable rows={[
                    { label: 'Namespace', value: <span className="font-mono">{filterResult.namespace}</span> },
                    { label: 'Schema', value: <span className="font-mono">{filterResult.schema_name}</span> },
                    { label: 'Entity Type', value: <span className="font-mono">{filterResult.entity_type}</span> },
                    {
                      label: 'Filter Query',
                      value: (
                        <pre className="rounded bg-muted/50 px-3 py-2 font-mono overflow-auto whitespace-pre-wrap leading-relaxed">
                          {filterResult.filter_query || '(no filter — full access)'}
                        </pre>
                      ),
                    },
                  ]} />
                  <FullResponse data={filterResult} />
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Global Capabilities ──────────────────────────────── */}
        <TabsContent value="global-caps" className="mt-6">
          <div className="grid gap-0 md:grid-cols-2 md:divide-x">
            <div className="space-y-4 md:pr-8">
              <div>
                <p className="text-sm font-semibold">Global Capabilities</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {matchMode ? 'Resolve the principal from auth material, then return allowed global actions' : 'Get all global actions allowed for a known principal across every entity type'}
                </p>
              </div>
              {renderIdentitySection(globalCapsForm.principal_id, (v) => setGlobalCapsForm({ principal_id: v }), 'gc', globalCapsIdentityError)}
              <Separator />
              <FormValidationSummary errors={[...globalCapsValidationErrors, ...(error ? [`Request: ${error}`] : [])]} />
              <Button onClick={handleGlobalCaps} disabled={loading || globalCapsValidationErrors.length > 0}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Get Global Capabilities
              </Button>
            </div>

            <div className="space-y-4 md:pl-8 mt-8 md:mt-0">
              <p className="text-sm font-semibold">Result</p>
              {!globalCapsResult ? <EmptyResult /> : (
                <div className="space-y-4">
                  {'matched_principals' in globalCapsResult && (
                    <MatchedPrincipals ids={globalCapsResult.matched_principals} principals={principals} />
                  )}
                  {Object.keys(globalCapsResult.global_actions).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No global actions granted</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border">
                        {Object.entries(globalCapsResult.global_actions).map(([key, actions]) => (
                          <tr key={key}>
                            <td className="py-2.5 pr-6 align-top text-xs font-mono text-muted-foreground w-2/5">{key}</td>
                            <td className="py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {actions.map((a) => <Badge key={a} variant="secondary" className="font-mono text-xs">{a}</Badge>)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <FullResponse data={globalCapsResult} />
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Entity Capabilities ──────────────────────────────── */}
        <TabsContent value="entity-caps" className="mt-6">
          <div className="grid gap-0 md:grid-cols-2 md:divide-x">
            <div className="space-y-4 md:pr-8">
              <div>
                <p className="text-sm font-semibold">Entity Capabilities</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {matchMode ? 'Resolve the principal from auth material, then return allowed actions on the entity' : 'Get allowed actions for a known principal on a specific entity'}
                </p>
              </div>
              {renderIdentitySection(entityCapsForm.principal_id, (v) => setEntityCapsForm({ principal_id: v }), 'ec', entityCapsFieldErrors.identity)}
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="entity-caps-namespace">Namespace</Label>
                <Select value={entityCapsQuery.namespace} onValueChange={(v) => setEntityCapsQuery({ ...entityCapsQuery, namespace: v, schema_name: '', entity_type: '' })}>
                  <SelectTrigger id="entity-caps-namespace" className="w-full" aria-invalid={!!entityCapsFieldErrors.namespace} aria-describedby={entityCapsFieldErrors.namespace ? 'entity-caps-namespace-error' : undefined}><SelectValue placeholder="Select namespace" /></SelectTrigger>
                  <SelectContent>{allNamespaces.map((ns) => <SelectItem key={ns} value={ns}>{ns}</SelectItem>)}</SelectContent>
                </Select>
                {entityCapsFieldErrors.namespace && <FormFieldError id="entity-caps-namespace-error" title="Namespace required." description="Select a namespace." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity-caps-schema">Schema Name</Label>
                <Select value={entityCapsQuery.schema_name} onValueChange={(v) => setEntityCapsQuery({ ...entityCapsQuery, schema_name: v, entity_type: '' })} disabled={!entityCapsQuery.namespace}>
                  <SelectTrigger id="entity-caps-schema" className="w-full" aria-invalid={!!entityCapsFieldErrors.schema} aria-describedby={entityCapsFieldErrors.schema ? 'entity-caps-schema-error' : undefined}><SelectValue placeholder="Select schema name" /></SelectTrigger>
                  <SelectContent>{getSchemaOptionsForNamespace(entityCapsQuery.namespace).map((sn) => <SelectItem key={sn} value={sn}>{sn}</SelectItem>)}</SelectContent>
                </Select>
                {entityCapsFieldErrors.schema && <FormFieldError id="entity-caps-schema-error" title="Schema Name required." description="Select a schema." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity-caps-entity-type">Entity Type</Label>
                <Select value={entityCapsQuery.entity_type} onValueChange={(v) => setEntityCapsQuery({ ...entityCapsQuery, entity_type: v })} disabled={!entityCapsQuery.namespace || !entityCapsQuery.schema_name}>
                  <SelectTrigger id="entity-caps-entity-type" className="w-full" aria-invalid={!!entityCapsFieldErrors.entityType} aria-describedby={entityCapsFieldErrors.entityType ? 'entity-caps-entity-type-error' : undefined}><SelectValue placeholder="Select entity type" /></SelectTrigger>
                  <SelectContent>{getEntityTypeOptions(entityCapsQuery.namespace, entityCapsQuery.schema_name).map((et) => <SelectItem key={et} value={et}>{et}</SelectItem>)}</SelectContent>
                </Select>
                {entityCapsFieldErrors.entityType && <FormFieldError id="entity-caps-entity-type-error" title="Entity Type required." description="Select an entity type." />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity-caps-entity-key">Entity Key</Label>
                <Input id="entity-caps-entity-key" placeholder='device-42  or  {"device_id": "device-42"}' value={entityCapsQuery.entity_key} onChange={(e) => setEntityCapsQuery({ ...entityCapsQuery, entity_key: e.target.value })} aria-invalid={!!entityCapsFieldErrors.entityKey} aria-describedby={entityCapsFieldErrors.entityKey ? 'entity-caps-entity-key-error' : undefined} />
                {entityCapsFieldErrors.entityKey && <FormFieldError id="entity-caps-entity-key-error" title={entityCapsQuery.entity_key.trim() ? 'Invalid Entity Key.' : 'Entity Key required.'} description={entityCapsQuery.entity_key.trim() ? entityCapsFieldErrors.entityKey : 'Enter a plain ID or JSON object.'} />}
              </div>
              <Separator />
              <FormValidationSummary errors={[...entityCapsValidationErrors, ...(error ? [`Request: ${error}`] : [])]} />
              <Button onClick={handleEntityCaps} disabled={loading || entityCapsValidationErrors.length > 0}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Get Entity Capabilities
              </Button>
            </div>

            <div className="space-y-4 md:pl-8 mt-8 md:mt-0">
              <p className="text-sm font-semibold">Result</p>
              {!entityCapsResult ? <EmptyResult /> : (() => {
                const r = entityCapsResult.results[0];
                const hasAccess = !r.error && r.actions.length > 0;
                const noAccess = !r.error && r.actions.length === 0;
                return (
                  <div className="space-y-4">
                    {'matched_principals' in entityCapsResult && (
                      <MatchedPrincipals ids={entityCapsResult.matched_principals} principals={principals} />
                    )}
                    {!r.error && (
                      <DecisionBanner
                        allowed={hasAccess}
                        label={hasAccess ? `${r.actions.length} action${r.actions.length !== 1 ? 's' : ''} permitted` : 'No access'}
                        detail={hasAccess ? 'This principal has access to the specified entity.' : 'This principal has no allowed actions on this entity.'}
                      />
                    )}
                    {r.error && (
                      <div className="flex items-start gap-3 rounded-md border-l-4 border-l-destructive bg-destructive/10 px-4 py-3">
                        <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-destructive">Evaluation Error</p>
                          <p className="text-xs text-destructive/80 mt-0.5">{r.error}</p>
                        </div>
                      </div>
                    )}
                    <ResultTable rows={[
                      { label: 'Namespace', value: <span className="font-mono">{r.namespace}</span> },
                      { label: 'Schema', value: <span className="font-mono">{r.schema_name}</span> },
                      { label: 'Entity Type', value: <span className="font-mono">{r.entity_type}</span> },
                      { label: 'Entity Key', value: <span className="font-mono">{JSON.stringify(r.entity_key)}</span> },
                      ...(hasAccess ? [{
                        label: 'Actions',
                        value: (
                          <div className="flex flex-wrap gap-1">
                            {r.actions.map((a) => <Badge key={a} variant="secondary" className="font-mono text-xs">{a}</Badge>)}
                          </div>
                        ),
                      }] : []),
                      ...(noAccess ? [{ label: 'Actions', value: <span className="text-muted-foreground">None</span> }] : []),
                    ]} />
                    <FullResponse data={entityCapsResult} />
                  </div>
                );
              })()}
            </div>
          </div>
        </TabsContent>

        {/* ── HTTP Route ──────────────────────────────────────── */}
        <TabsContent value="http" className="mt-6">
          <HttpAuthzCheckForm
            matchMode={matchMode}
            authType={authCreds.auth_type}
            authMaterial={authCreds.value}
            onAuthTypeChange={(auth_type) => setAuthCreds({ auth_type, value: '' })}
            onAuthMaterialChange={(value) => setAuthCreds((previous) => ({ ...previous, value }))}
            initialPrincipalId={httpInitialPrincipalId}
          />
        </TabsContent>
      </Tabs>
    </BreadcrumbPage>
  );
}
