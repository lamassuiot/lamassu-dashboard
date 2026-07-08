'use client';

import { Fragment, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  AlertCircle,
  Edit,
  Trash2,
  ScrollText,
  MoreVertical,
  Copy,
  Check,
  FileJson,
  Info,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  pageTabsListClass,
  pageTabsTriggerClass,
} from '@/components/ui/tabs';
import { getPolicy, getPolicyStats, deletePolicy, getHTTPSchemas } from '@/lib/authz-api';
import {
  formatHTTPRuleParamConstraint,
  getHTTPRuleParamConstraintsForAction,
  getHTTPSchemaGroups,
} from '@/lib/http-authz-schema';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import type {
  Policy,
  PolicyStats,
  ColumnFilter,
  FilterOperator,
  RelationRule,
  HTTPRule,
  HTTPSchemaDefinition,
  HTTPSchemaRoute,
  HTTPRouteConstraint,
} from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

// ─── Helpers ────────────────────────────────────────────────────────────────

const FILTER_OP_LABEL: Record<FilterOperator, string> = {
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'in', like: '~',
};

const formatFilterValue = (value: ColumnFilter['value']): string =>
  Array.isArray(value) ? value.join(', ') : String(value);

const getRouteConstraints = (route: HTTPSchemaRoute): HTTPRouteConstraint[] => {
  const constraints = route.constraints ?? route.route_constraints ?? route.request_constraints;
  if (constraints) return constraints;
  return route.constraint ? [route.constraint] : [];
};

const formatRouteConstraint = (constraint: HTTPRouteConstraint): string => {
  if (constraint.description) return constraint.description;

  const request = constraint.request ?? {};
  const rawLocation = request.source ?? constraint.location ?? constraint.source ?? '';
  const normalizedLocation = rawLocation.toLowerCase();
  const fieldPath = request.path ?? request.name ?? constraint.path ?? constraint.name ?? '';
  const pathGroup = typeof request.index === 'number' && request.index > 0 ? `path group ${request.index}` : '';
  const subjectAttribute = constraint.equals_subject_attribute ?? constraint.subject_attribute ?? constraint.subject ?? '';
  const subjectRef = subjectAttribute.startsWith('subject.')
    ? subjectAttribute
    : subjectAttribute
      ? `subject.${subjectAttribute}`
      : String(constraint.equals ?? constraint.value ?? '');
  const operator = constraint.operator === 'eq' || !constraint.operator ? '==' : constraint.operator;

  if (normalizedLocation.includes('query')) {
    return `requires query ${fieldPath} ${operator} ${subjectRef}`;
  }

  if (normalizedLocation.includes('json') || normalizedLocation.includes('body')) {
    return `requires JSON body ${fieldPath} ${operator} ${subjectRef}`;
  }

  if (normalizedLocation.includes('path_regex_group')) {
    return `requires ${pathGroup || 'path group'} ${operator} ${subjectRef}`;
  }

  if (fieldPath && subjectRef) return `requires ${fieldPath} ${operator} ${subjectRef}`;
  return 'requires route constraint';
};

const getRoutesForHttpRule = (
  rule: HTTPRule,
  httpSchemas: Record<string, HTTPSchemaDefinition>,
): HTTPSchemaRoute[] => {
  const schema = httpSchemas[rule.http_schema_name];
  if (!schema) return [];

  const groups = rule.http_group_name
    ? getHTTPSchemaGroups(schema).filter((group) => group.name === rule.http_group_name)
    : getHTTPSchemaGroups(schema);
  const routes = groups.flatMap((group) => group.routes);

  if (rule.actions.includes('*')) return routes;
  return routes.filter((route) => rule.actions.includes(route.action));
};

// ─── ActionBadge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  return (
    <span className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium text-foreground">
      {action === '*' ? '* (all)' : action}
    </span>
  );
}

// ─── FilterChip ──────────────────────────────────────────────────────────────

function FilterChip({ filter }: { filter: ColumnFilter }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1">
      <code className="text-[11px] font-mono font-medium">{filter.column}</code>
      <span className="text-[11px] font-mono text-muted-foreground">{FILTER_OP_LABEL[filter.operator] ?? filter.operator}</span>
      <code className="text-[11px] font-mono text-foreground">{formatFilterValue(filter.value)}</code>
    </div>
  );
}

// ─── Relation rows ───────────────────────────────────────────────────────────

function resolveRelationTarget(to: RelationRule['to']): { schema: string; entity: string } {
  if (typeof to === 'string') return { schema: '', entity: to };
  return { schema: to.schema_name || '', entity: to.entity_type || '' };
}

function RelationRows({ relations, depth = 1 }: { relations: RelationRule[]; depth?: number }) {
  return (
    <>
      {relations.map((rel, i) => {
        const { schema, entity } = resolveRelationTarget(rel.to);
        return (
          <>
            <TableRow key={i} className="hover:bg-transparent align-top bg-muted/20">
              <TableCell className="py-2">
                <span className="inline-flex items-center gap-1 font-mono text-sm" style={{ paddingLeft: depth * 16 }}>
                  <span className="text-muted-foreground/30 text-xs shrink-0">↳</span>
                  {schema && (
                    <>
                      <span className="text-muted-foreground">{schema}</span>
                      <span className="text-muted-foreground/40">›</span>
                    </>
                  )}
                  <span className="font-medium">{entity || '—'}</span>
                </span>
              </TableCell>
              <TableCell className="py-2">
                {rel.actions.length === 0 ? (
                  <span className="text-xs text-muted-foreground/60 italic">None</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {rel.actions.map((action, j) => <ActionBadge key={j} action={action} />)}
                  </div>
                )}
              </TableCell>
              <TableCell className="py-2">
                <code className="text-[11px] font-mono text-muted-foreground">via {rel.via}</code>
              </TableCell>
              <TableCell className="py-2" />
            </TableRow>
            {rel.relations && rel.relations.length > 0 && (
              <RelationRows relations={rel.relations} depth={depth + 1} />
            )}
          </>
        );
      })}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function PolicyDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policy_id = searchParams.get('policy_id');

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [httpSchemas, setHttpSchemas] = useState<Record<string, HTTPSchemaDefinition>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const monacoTheme = useMonacoTheme();

  useEffect(() => {
    if (policy_id) loadPolicyDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy_id]);

  const loadPolicyDetails = async () => {
    if (!policy_id) return;
    try {
      setLoading(true);
      const [policyData, statsData, httpSchemasData] = await Promise.all([
        getPolicy(policy_id),
        getPolicyStats(policy_id).catch(() => null),
        getHTTPSchemas().catch(() => ({})),
      ]);
      setPolicy(policyData);
      setStats(statsData);
      setHttpSchemas(httpSchemasData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load policy details');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!policy) return;
    try {
      setDeleting(true);
      await deletePolicy(policy.id);
      router.push('/authz/policies');
    } catch (err: any) {
      setError(err.message || 'Failed to delete policy');
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Policy...</p>
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Policy not found'}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push('/authz/policies')}>
          Back to Policies
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Policies', href: '/authz/policies' },
          { label: policy.name },
        ]}
      />

      {/* Identity + Actions + Info strip */}
      <div>
        <div className="flex items-start justify-between gap-4 min-w-0 pb-4 border-b">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 bg-primary/10 border-primary/20 text-primary">
              <ScrollText className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight truncate">{policy.name}</h1>

              <div className="flex items-center gap-1.5">
                <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono text-muted-foreground">
                  {policy.id}
                </code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(policy.id)}>
                  {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </Button>
              </div>

              {policy.description && (
                <p className="text-sm text-muted-foreground max-w-2xl">{policy.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/authz/policies/edit?policy_id=${policy.id}`)}
            >
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/authz/policies/edit?policy_id=${policy.id}`)}>
                  <Edit className="mr-2 h-4 w-4" /> Edit Policy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Policy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Info strip */}
        <div className="flex divide-x pt-3 pb-3 border-b">
          <div className="pr-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rules</p>
            <p className="text-sm mt-0.5">{policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'}</p>
          </div>
          {(policy.http_rules?.length ?? 0) > 0 && (
            <div className="px-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HTTP Rules</p>
              <p className="text-sm mt-0.5">{policy.http_rules!.length} {policy.http_rules!.length === 1 ? 'rule' : 'rules'}</p>
            </div>
          )}
          <div className="px-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Principals</p>
            <p className="text-sm mt-0.5">{stats ? stats.principal_count : '—'}</p>
          </div>
          <div className="px-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</p>
            <DateDisplay date={policy.created_at} className="text-sm mt-0.5" />
          </div>
          <div className="pl-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Updated</p>
            <DateDisplay date={policy.updated_at} className="text-sm mt-0.5" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
            <TabsTrigger value="overview" className={pageTabsTriggerClass}>
              <Info className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="raw" className={pageTabsTriggerClass}>
              <FileJson className="h-4 w-4" />
              Raw JSON
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {policy.rules.length === 0 && !policy.http_rules?.length ? (
            <div className="rounded-xl border bg-card p-12 text-center space-y-3">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <ScrollText className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              <div>
                <p className="font-medium">No rules defined</p>
                <p className="text-sm text-muted-foreground mt-1">This policy has no rules configured</p>
              </div>
            </div>
          ) : (
            <>
              {policy.rules.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[18%] text-[11px] uppercase tracking-wider font-medium">Service</TableHead>
                      <TableHead className="w-[28%] text-[11px] uppercase tracking-wider font-medium">Access Level</TableHead>
                      <TableHead className="w-[22%] text-[11px] uppercase tracking-wider font-medium">Resources</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider font-medium">Request Conditions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policy.rules.map((rule, index) => {
                      const namespace = rule.namespace || '';
                      const schema = rule.schema_name || '';
                      const entity = rule.entity_type || '';
                      const actions = rule.actions ?? [];
                      const direct_grants = rule.direct_grants ?? [];
                      const column_filters = rule.column_filters ?? [];
                      const relations = rule.relations ?? [];

                      return (
                        <>
                          <TableRow key={index} className="hover:bg-transparent align-top">
                            <TableCell className="py-3">
                              <span className="inline-flex items-center gap-1 font-mono text-sm flex-wrap">
                                {namespace && <>
                                  <span className="text-muted-foreground">{namespace}</span>
                                  <span className="text-muted-foreground/40">›</span>
                                </>}
                                <span className="text-muted-foreground">{schema || '—'}</span>
                                <span className="text-muted-foreground/40">›</span>
                                <span className="font-medium">{entity || '—'}</span>
                              </span>
                            </TableCell>

                            <TableCell className="py-3">
                              {actions.length === 0 ? (
                                <span className="text-xs text-muted-foreground/60 italic">None</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {actions.map((action, i) => (
                                    <ActionBadge key={i} action={action} />
                                  ))}
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="py-3">
                              {direct_grants.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {direct_grants.map((grant, i) => (
                                    <Badge key={i} variant="secondary" className="font-mono text-[11px]">
                                      {grant}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/60">All</span>
                              )}
                            </TableCell>

                            <TableCell className="py-3">
                              {column_filters.length === 0 ? (
                                <span className="text-xs text-muted-foreground/60 italic">None</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {column_filters.map((filter, i) => (
                                    <FilterChip key={i} filter={filter} />
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                          {relations.length > 0 && <RelationRows relations={relations} />}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {policy.http_rules && policy.http_rules.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">HTTP Rules</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[30%] text-[11px] uppercase tracking-wider font-medium">Schema</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-medium">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policy.http_rules.map((httpRule: HTTPRule, index: number) => (
                        <Fragment key={index}>
                          <TableRow key={index} className="hover:bg-transparent align-top">
                            <TableCell className="py-3">
                              <code className="font-mono text-sm">{httpRule.http_schema_name}</code>
                              {httpRule.http_group_name && (
                                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{httpRule.http_group_name}</p>
                              )}
                              {httpSchemas[httpRule.http_schema_name]?.base_paths?.length ? (
                                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                                  {httpSchemas[httpRule.http_schema_name].base_paths!.join(', ')} default {httpSchemas[httpRule.http_schema_name].default_action || 'deny'}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="py-3">
                              {httpRule.actions.length === 0 ? (
                                <span className="text-xs text-muted-foreground/60 italic">None</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {httpRule.actions.map((action, i) => (
                                    <ActionBadge key={i} action={action} />
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                          {getRoutesForHttpRule(httpRule, httpSchemas).map((route) => {
                            const constraints = getRouteConstraints(route);
                            return (
                              <TableRow key={`${index}-${route.action}`} className="hover:bg-transparent align-top bg-muted/20">
                                <TableCell className="py-2 pl-6">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                                      {route.methods.map((method) => (
                                        <Badge key={method} variant="secondary" className="font-mono text-[10px]">{method}</Badge>
                                      ))}
                                      {route.skip_authz && (
                                        <Badge variant="outline" className="font-mono text-[10px]">skip authz</Badge>
                                      )}
                                      <span>{route.path}</span>
                                    </div>
                                    <code className="text-[11px] text-muted-foreground">{route.action}</code>
                                  </div>
                                </TableCell>
                                <TableCell className="py-2">
                                  {(() => {
                                    const paramConstraints = getHTTPRuleParamConstraintsForAction(httpRule, route.action);
                                    const hasConditions = constraints.length > 0 || paramConstraints.length > 0 || route.skip_authz;

                                    if (!hasConditions) {
                                      return <span className="text-xs text-muted-foreground/60">No route constraints</span>;
                                    }

                                    return (
                                      <div className="space-y-1">
                                        {route.skip_authz && (
                                          <p className="font-mono text-xs text-muted-foreground">
                                            authz skipped for authenticated subjects
                                          </p>
                                        )}
                                        {constraints.map((constraint, constraintIndex) => (
                                          <p key={`route-${constraintIndex}`} className="font-mono text-xs text-muted-foreground">
                                            {formatRouteConstraint(constraint)}
                                          </p>
                                        ))}
                                        {paramConstraints.map((constraint, constraintIndex) => (
                                          <p key={`param-${constraintIndex}`} className="font-mono text-xs text-muted-foreground">
                                            static check {formatHTTPRuleParamConstraint(constraint)}
                                          </p>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {(httpRule.param_constraints ?? []).filter(
                            (constraint) => !getRoutesForHttpRule(httpRule, httpSchemas).some((route) => route.action === constraint.action),
                          ).map((constraint, constraintIndex) => (
                            <TableRow key={`${index}-unmatched-param-${constraintIndex}`} className="hover:bg-transparent align-top bg-muted/20">
                              <TableCell className="py-2 pl-6">
                                <code className="text-[11px] text-muted-foreground">{constraint.action}</code>
                              </TableCell>
                              <TableCell className="py-2">
                                <p className="font-mono text-xs text-muted-foreground">
                                  static check {formatHTTPRuleParamConstraint(constraint)}
                                </p>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="raw" className="mt-6">
          <div className="rounded-md border overflow-hidden">
            <MonacoEditor
              height="500px"
              language="json"
              value={JSON.stringify(policy, null, 2)}
              theme={monacoTheme}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Policy Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{policy.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PolicyDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center flex-1 p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        </div>
      }
    >
      <PolicyDetailsContent />
    </Suspense>
  );
}
