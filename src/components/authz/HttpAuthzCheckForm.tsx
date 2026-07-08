'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Play } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';
import {
  checkHTTPAuthorization,
  getHTTPSchemas,
  listPrincipals,
  matchAndCheckHTTPAuthorization,
} from '@/lib/authz-api';
import { getHTTPSchemaGroups } from '@/lib/http-authz-schema';
import {
  newSubjectAttributeRow,
  subjectAttributeRowsFromRecord,
  subjectAttributeRowsToRecord,
  type SubjectAttributeRow,
} from '@/lib/principal-subject-attributes';
import type {
  HTTPAuthzCheckResponse,
  HTTPSchemaDefinition,
  HTTPSchemaRoute,
  Principal,
  PrincipalType,
} from '@/types/authz';
import { EmptyResult, FullResponse, DecisionBanner, ResultTable, MatchedPrincipals } from '@/components/authz/TestResultViews';

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
};

type RouteOption = {
  value: string;
  schemaName: string;
  groupName: string;
  schema: HTTPSchemaDefinition;
  route: HTTPSchemaRoute;
};

type HTTPAuthzCheckFormProps = {
  matchMode: boolean;
  authType: PrincipalType;
  authMaterial: string;
  onAuthTypeChange: (value: PrincipalType) => void;
  onAuthMaterialChange: (value: string) => void;
  initialPrincipal?: Principal | null;
  initialPrincipalId?: string | null;
};

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const OPTION_SEP = '|||';

const newKeyValueRow = (key = '', value = ''): KeyValueRow => ({
  id: crypto.randomUUID(),
  key,
  value,
});

const keyValueRowsToRecord = (rows: KeyValueRow[]): Record<string, string> | undefined => {
  const entries = rows
    .map((row) => [row.key.trim(), row.value.trim()] as const)
    .filter(([key, value]) => key && value);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const routePathForCheck = (path: string) => {
  const placeholderPath = path.replace(/\{[^}]+\}/g, (match) => match.toLowerCase().includes('id') ? 'e0e8' : 'sample');
  if (!placeholderPath.startsWith('^') && !placeholderPath.endsWith('$')) return placeholderPath;

  return placeholderPath
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\(\?P<([^>]+)>[^)]*\)/g, (_match, name) => String(name).toLowerCase().includes('id') ? 'e0e8' : 'sample')
    .replace(/\(\[\^\/\]\+\)|\[\^\/\]\+/g, 'e0e8')
    .replace(/\(\.\*\)|\.\*/g, 'sample')
    .replace(/\\\//g, '/');
};

const isWfxSbiRoute = (route?: HTTPSchemaRoute | null) =>
  !!route && route.path.toLowerCase().includes('/wfx/sbi/v1/jobs');

const getClientId = (rows: SubjectAttributeRow[]) =>
  rows.find((row) => row.key.trim() === 'client_id')?.value.trim() || '';

const buildRouteOptions = (schemas: Record<string, HTTPSchemaDefinition>): RouteOption[] =>
  Object.entries(schemas).flatMap(([schemaKey, schema]) =>
    getHTTPSchemaGroups(schema).flatMap((group) =>
      group.routes.map((route) => ({
        value: [schema.name || schemaKey, group.name, route.action].join(OPTION_SEP),
        schemaName: schema.name || schemaKey,
        groupName: group.name,
        schema,
        route,
      })),
    ),
  );

const normalizeJwt = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed : `Bearer ${trimmed}`;
};

function updateSubjectRow(rows: SubjectAttributeRow[], id: string, field: 'key' | 'value', value: string) {
  return rows.map((row) => row.id === id ? { ...row, [field]: value } : row);
}

function updateKeyValueRow(rows: KeyValueRow[], id: string, field: 'key' | 'value', value: string) {
  return rows.map((row) => row.id === id ? { ...row, [field]: value } : row);
}

function SubjectAttributeRows({
  rows,
  onChange,
}: {
  rows: SubjectAttributeRow[];
  onChange: (rows: SubjectAttributeRow[]) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-2 gap-2">
          <Input
            value={row.key}
            placeholder={index === 0 ? 'client_id' : 'attribute'}
            onChange={(event) => onChange(updateSubjectRow(rows, row.id, 'key', event.target.value))}
            className="font-mono text-sm"
          />
          <Input
            value={row.value}
            placeholder={index === 0 ? 'hub-6ece-0664' : 'value'}
            onChange={(event) => onChange(updateSubjectRow(rows, row.id, 'value', event.target.value))}
            className="font-mono text-sm"
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, newSubjectAttributeRow()])}>
        Add Subject Attribute
      </Button>
    </div>
  );
}

function KeyValueRows({
  rows,
  onChange,
}: {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-2 gap-2">
          <Input
            value={row.key}
            placeholder={index === 0 ? 'header' : 'name'}
            onChange={(event) => onChange(updateKeyValueRow(rows, row.id, 'key', event.target.value))}
            className="font-mono text-sm"
          />
          <Input
            value={row.value}
            placeholder="value"
            onChange={(event) => onChange(updateKeyValueRow(rows, row.id, 'value', event.target.value))}
            className="font-mono text-sm"
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, newKeyValueRow()])}>
        Add Header
      </Button>
    </div>
  );
}

export function HttpAuthzCheckForm({
  matchMode,
  authType,
  authMaterial,
  onAuthTypeChange,
  onAuthMaterialChange,
  initialPrincipal,
  initialPrincipalId,
}: HTTPAuthzCheckFormProps) {
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [httpSchemas, setHttpSchemas] = useState<Record<string, HTTPSchemaDefinition>>({});
  const [selectedRouteValue, setSelectedRouteValue] = useState('');
  const [selectedPrincipalId, setSelectedPrincipalId] = useState('');
  const [subjectRows, setSubjectRows] = useState<SubjectAttributeRow[]>([newSubjectAttributeRow('client_id', '')]);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/wfx/sbi/v1/jobs');
  const [rawQuery, setRawQuery] = useState('');
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>([newKeyValueRow()]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HTTPAuthzCheckResponse | null>(null);

  const routeOptions = useMemo(() => buildRouteOptions(httpSchemas), [httpSchemas]);
  const selectedRouteOption = routeOptions.find((option) => option.value === selectedRouteValue) ?? null;
  const selectedRoute = selectedRouteOption?.route ?? null;
  const clientId = getClientId(subjectRows);
  const showWfxClientWarning = !matchMode && isWfxSbiRoute(selectedRoute) && !clientId;

  const applyRoute = useCallback((route: HTTPSchemaRoute, nextClientId = clientId) => {
    const resolvedClientId = nextClientId || '<client_id>';
    const routePath = routePathForCheck(route.path);
    const routeMethod = route.methods[0] || method;

    setMethod(routeMethod);
    setPath(routePath);
    setRawQuery('');
    setHeaderRows([newKeyValueRow()]);
    setBody('');

    const normalizedPath = route.path.toLowerCase();
    const action = route.action.toLowerCase();
    if (!isWfxSbiRoute(route)) return;

    if (normalizedPath.endsWith('/jobs/events') || action === 'sbi-job-events') {
      setRawQuery(`clientIds=${resolvedClientId}`);
      return;
    }

    if (normalizedPath.endsWith('/jobs') || action === 'sbi-job-list') {
      setRawQuery(`clientId=${resolvedClientId}`);
      return;
    }

    if (normalizedPath.endsWith('/jobs/{id}/status') || action === 'sbi-job-status-update') {
      setBody(JSON.stringify({ clientId: resolvedClientId, state: 'DOWNLOADING' }, null, 2));
      return;
    }

    if (normalizedPath.includes('/jobs/{id}') || normalizedPath.includes('/jobs/[^/]+')) {
      setHeaderRows([newKeyValueRow('x-wfx-client-id', resolvedClientId)]);
    }
  }, [clientId, method]);

  useEffect(() => {
    setError(null);
    setResult(null);
  }, [matchMode]);

  useEffect(() => {
    setError(null);
    setResult(null);
    setLoadingData(true);

    Promise.all([
      listPrincipals({ pageSize: 100, sortBy: 'name', sortMode: 'asc' }).catch(() => ({ list: [] })),
      getHTTPSchemas().catch(() => ({})),
    ]).then(([principalData, schemas]) => {
      setPrincipals(principalData.list || []);
      setHttpSchemas(schemas);
    }).finally(() => setLoadingData(false));
  }, []);

  useEffect(() => {
    if (initialPrincipal) {
      setSelectedPrincipalId(initialPrincipal.id);
      const staticRows = subjectAttributeRowsFromRecord((initialPrincipal.auth_config as any)?.subject_attributes);
      setSubjectRows(staticRows.length > 0 ? staticRows : [newSubjectAttributeRow('client_id', '')]);
    }
  }, [initialPrincipal]);

  useEffect(() => {
    if (initialPrincipal || !initialPrincipalId || principals.length === 0) return;

    const selectedPrincipal = principals.find((principal) => principal.id === initialPrincipalId);
    setSelectedPrincipalId(initialPrincipalId);
    if (!selectedPrincipal) return;

    const staticRows = subjectAttributeRowsFromRecord((selectedPrincipal.auth_config as any)?.subject_attributes);
    setSubjectRows(staticRows.length > 0 ? staticRows : [newSubjectAttributeRow('client_id', '')]);
  }, [initialPrincipal, initialPrincipalId, principals]);

  const handlePrincipalChange = (principalId: string) => {
    setSelectedPrincipalId(principalId);
    const selectedPrincipal = principals.find((principal) => principal.id === principalId);
    if (!selectedPrincipal) return;

    const staticRows = subjectAttributeRowsFromRecord((selectedPrincipal.auth_config as any)?.subject_attributes);
    setSubjectRows(staticRows.length > 0 ? staticRows : [newSubjectAttributeRow('client_id', '')]);
  };

  const handleRouteChange = (value: string) => {
    setSelectedRouteValue(value);
    const route = routeOptions.find((option) => option.value === value)?.route;
    if (route) applyRoute(route);
  };

  const handleSubmit = async () => {
    setError(null);
    setResult(null);

    if (!method.trim() || !path.trim()) {
      setError('Method and path are required.');
      return;
    }

    const request = {
      method: method.trim().toUpperCase(),
      path: path.trim(),
      ...(rawQuery.trim() ? { raw_query: rawQuery.trim() } : {}),
      ...(keyValueRowsToRecord(headerRows) ? { headers: keyValueRowsToRecord(headerRows) } : {}),
      ...(body ? { body } : {}),
    };

    try {
      setLoading(true);
      if (!matchMode) {
        if (!selectedPrincipalId.trim()) {
          setError('Principal is required.');
          return;
        }
        const subjectAttributes = subjectAttributeRowsToRecord(subjectRows);
        const response = await checkHTTPAuthorization({
          principal_id: selectedPrincipalId.trim(),
          ...(subjectAttributes ? { subject_attributes: subjectAttributes } : {}),
          request,
        });
        setResult(response);
        return;
      }

      if (!authMaterial.trim()) {
        setError(authType === 'x509' ? 'Certificate PEM is required.' : 'JWT is required.');
        return;
      }

      const response = await matchAndCheckHTTPAuthorization({
        auth_type: authType,
        auth_material: authType === 'oidc' ? normalizeJwt(authMaterial) : authMaterial.trim(),
        request,
      });
      setResult(response);
    } catch (err: any) {
      setError(err.message || 'HTTP authorization check failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-0 md:grid-cols-2 md:divide-x">
      <div className="space-y-4 md:pr-8">
        <div>
          <p className="text-sm font-semibold">Parameters</p>
          <p className="text-xs text-muted-foreground mt-0.5">Simulate an inbound HTTP request against the authorization policies</p>
        </div>

        {loadingData && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading routes and principals
          </div>
        )}

        {!matchMode ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Principal</Label>
              <Select value={selectedPrincipalId} onValueChange={handlePrincipalChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select principal" />
                </SelectTrigger>
                <SelectContent>
                  {principals.map((principal) => (
                    <SelectItem key={principal.id} value={principal.id}>
                      {principal.name} ({principal.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={selectedPrincipalId}
                onChange={(event) => setSelectedPrincipalId(event.target.value)}
                placeholder="Principal ID"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Subject attributes</Label>
              <SubjectAttributeRows rows={subjectRows} onChange={setSubjectRows} />
            </div>

            {showWfxClientWarning && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>This route requires subject.client_id to match the request.</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-w-[180px] space-y-1.5">
                <Label>Auth type</Label>
                <Select value={authType} onValueChange={onAuthTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="x509">x509</SelectItem>
                    <SelectItem value="oidc">oidc</SelectItem>
                  </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{authType === 'x509' ? 'Certificate PEM' : 'JWT'}</Label>
              {authType === 'x509' ? (
                <CertificatePemTextarea
                  value={authMaterial}
                  onValueChange={onAuthMaterialChange}
                  rows={8}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  className="font-mono text-xs"
                />
              ) : (
                <Textarea
                  value={authMaterial}
                  onChange={(event) => onAuthMaterialChange(event.target.value)}
                  rows={4}
                  placeholder="Bearer eyJ..."
                  className="font-mono text-xs"
                />
              )}
            </div>
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Route</Label>
            <Select value={selectedRouteValue} onValueChange={handleRouteChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select schema route" />
              </SelectTrigger>
              <SelectContent>
                {routeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.schemaName} / {option.groupName} / {option.route.action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRouteOption && (
              <div className="space-y-1 text-xs text-muted-foreground">
                {selectedRoute?.skip_authz && (
                  <p>Authorization is skipped for this route after authentication succeeds.</p>
                )}
                {selectedRouteOption.schema.base_paths?.length ? (
                  <p className="font-mono">
                    {selectedRouteOption.schema.base_paths.join(', ')} default {selectedRouteOption.schema.default_action || 'deny'}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Path</Label>
            <Input value={path} onChange={(event) => setPath(event.target.value)} className="font-mono text-sm" />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Query</Label>
            <Input
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              placeholder="clientId=hub-6ece-0664"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Headers</Label>
            <KeyValueRows rows={headerRows} onChange={setHeaderRows} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Body</Label>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className="font-mono text-xs" />
          </div>
        </div>

        <Separator />
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Test HTTP Route
        </Button>
      </div>

      <div className="space-y-4 md:pl-8 mt-8 md:mt-0">
        <p className="text-sm font-semibold">Result</p>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!result ? (!error && <EmptyResult />) : (
          <div className="space-y-4">
            <DecisionBanner
              allowed={result.allowed}
              label={result.allowed ? 'Access Allowed' : 'Access Denied'}
              detail={result.allowed ? 'The request matches an authorized HTTP route.' : 'The request does not match any authorized HTTP route.'}
            />
            {result.matched_principals && (
              <MatchedPrincipals ids={result.matched_principals} principals={principals} />
            )}
            <ResultTable rows={[
              ...(result.matched_principals ? [] : [{ label: 'Principal', value: <span className="font-mono">{result.matched_principal_id || 'None'}</span> }]),
              { label: 'Policy', value: <span className="font-mono">{result.matched_policy_id || 'None'}</span> },
              { label: 'Action', value: <span className="font-mono">{result.matched_action || 'None'}</span> },
              { label: 'Reason', value: result.reason || 'No reason returned.' },
              {
                label: 'Subject Attrs',
                value: (
                  <pre className="rounded bg-muted/50 px-3 py-2 font-mono overflow-auto whitespace-pre-wrap break-all leading-relaxed">
                    {JSON.stringify(result.subject_attributes ?? {}, null, 2)}
                  </pre>
                ),
              },
            ]} />
            <FullResponse data={result} />
          </div>
        )}
      </div>
    </div>
  );
}
