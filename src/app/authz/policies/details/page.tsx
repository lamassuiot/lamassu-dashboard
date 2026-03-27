'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Edit,
  Trash2,
  Shield,
  MoreVertical,
  Copy,
  Check,
  FileJson,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Zap,
  GitBranch,
  CheckCircle2,
  ArrowRight,
  Info,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getPolicy, getPolicyStats, deletePolicy } from '@/lib/authz-api';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import type { Policy, PolicyStats, RelationRule } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { normalizeEntityAddress } from '@/lib/policy-format';

// ─── Helpers ────────────────────────────────────────────────────────────────

const splitEntityDisplay = (rule: any): { schema: string; entity: string } => {
  const addr = normalizeEntityAddress({ schemaName: rule?.schemaName, entityType: rule?.entityType });
  return { schema: addr.schemaName, entity: addr.entityType };
};

const getRelationEntityDisplay = (relation: RelationRule): { schema: string; entity: string } => {
  const addr = normalizeEntityAddress(relation.to);
  return { schema: addr.schemaName, entity: addr.entityType };
};

/** Color-code action badges by semantic intent. */
const getActionClassName = (action: string): string => {
  if (action === '*') {
    return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  const lower = action.toLowerCase();
  if (['read', 'list', 'get', 'view', 'describe', 'download'].some((w) => lower.includes(w))) {
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (['create', 'write', 'update', 'issue', 'add', 'import', 'sign', 'enroll'].some((w) => lower.includes(w))) {
    return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800';
  }
  if (['delete', 'revoke', 'remove', 'purge', 'decommission'].some((w) => lower.includes(w))) {
    return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
  }
  return '';
};

// ─── ActionBadge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-mono font-medium ${getActionClassName(action)}`}
    >
      {action === '*' ? '* (all)' : action}
    </span>
  );
}

// ─── EntitySlug ──────────────────────────────────────────────────────────────

function EntitySlug({ schema, entity }: { schema: string; entity: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <span className="text-muted-foreground">{schema || '""'}</span>
      <span className="text-muted-foreground/40">/</span>
      <span className="font-semibold text-foreground">{entity || '""'}</span>
    </span>
  );
}

// ─── RelationRow ─────────────────────────────────────────────────────────────

function RelationRow({ relation, depth = 0 }: { relation: RelationRule; depth?: number }) {
  const { schema, entity } = getRelationEntityDisplay(relation);
  const hasNested = relation.relations && relation.relations.length > 0;

  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div className="flex items-start gap-3 py-1.5 text-xs">
        {depth > 0 && <span className="text-muted-foreground/40 shrink-0 select-none mt-0.5">└─</span>}
        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
          <span className="uppercase tracking-wide font-medium text-[10px]">via</span>
          <code className="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-mono font-semibold text-[11px]">
            {relation.via}
          </code>
          <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <EntitySlug schema={schema} entity={entity} />
        </div>
        {relation.actions && relation.actions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {relation.actions.map((action, i) => (
              <ActionBadge key={i} action={action} />
            ))}
          </div>
        )}
      </div>
      {hasNested && relation.relations!.map((nested, i) => (
        <RelationRow key={i} relation={nested} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── RuleRow ─────────────────────────────────────────────────────────────────

function RuleRow({ rule, index }: { rule: any; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const { schema, entity } = splitEntityDisplay(rule);
  const namespace: string | undefined = rule.namespace || undefined;
  const actionCount = rule.actions?.length || 0;
  const directGrantCount = rule.directGrants?.length || 0;
  const relationCount = rule.relations?.length || 0;

  const summary: string[] = [];
  if (actionCount > 0) summary.push(`${actionCount} ${actionCount === 1 ? 'action' : 'actions'}`);
  if (directGrantCount > 0) summary.push(`${directGrantCount} grant${directGrantCount > 1 ? 's' : ''}`);
  if (relationCount > 0) summary.push(`${relationCount} relation${relationCount > 1 ? 's' : ''}`);

  return (
    <div className="border-b last:border-b-0">
      {/* Rule header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors group"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-1 ring-border">
          {index + 1}
        </span>
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          {namespace && (
            <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5 h-4 text-muted-foreground">
              {namespace}
            </Badge>
          )}
          <EntitySlug schema={schema} entity={entity} />
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0 ml-auto pl-3">{summary.join(' · ')}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-10 pb-4 space-y-3">

          {/* Direct Actions */}
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5 min-w-[110px]">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Actions</span>
            </div>
            {actionCount === 0 ? (
              <span className="text-xs text-muted-foreground/60 italic">none</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {rule.actions.map((action: string, i: number) => (
                  <ActionBadge key={i} action={action} />
                ))}
              </div>
            )}
          </div>

          {/* Direct Grants */}
          {directGrantCount > 0 && (
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5 min-w-[110px]">
                <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Grants</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {rule.directGrants.map((grant: string, i: number) => (
                  <Badge key={i} variant="secondary" className="font-mono text-[11px] py-0 px-1.5 h-5">
                    {grant}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Relations */}
          {relationCount > 0 && (
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5 min-w-[110px]">
                <GitBranch className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Relations</span>
              </div>
              <div className="space-y-0.5">
                {rule.relations.map((relation: RelationRule, i: number) => (
                  <RelationRow key={i} relation={relation} />
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function PolicyDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policyId = searchParams.get('policyId');

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [jsonExpanded, setJsonExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (policyId) {
      loadPolicyDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  const loadPolicyDetails = async () => {
    if (!policyId) return;
    try {
      setLoading(true);
      const [policyData, statsData] = await Promise.all([
        getPolicy(policyId),
        getPolicyStats(policyId).catch(() => null),
      ]);
      setPolicy(policyData);
      setStats(statsData);
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Policies
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Authorization', href: '/authz/policies' },
          {
            label: (
              <Badge variant="default" className="text-xs">
                {policy.name}
              </Badge>
            ),
          },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/authz/policies/edit?policyId=${policy.id}`)}
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
                <DropdownMenuItem
                  onClick={() => router.push(`/authz/policies/edit?policyId=${policy.id}`)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Policy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Policy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Header card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="h-1 w-full bg-primary" />
        <div className="p-6">
          {/* Hero content */}
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                <Shield className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight truncate">{policy.name}</h1>
                <div className="flex items-center gap-1.5 mt-2">
                  <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono text-muted-foreground">
                    {policy.id}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(policy.id)}
                  >
                    {copiedId ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                {policy.description && (
                  <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{policy.description}</p>
                )}
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-6 xl:min-w-[480px] xl:border-l xl:pl-6">
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rules</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{policy.rules.length}</p>
                <p className="text-xs text-muted-foreground">{policy.rules.length === 1 ? 'rule defined' : 'rules defined'}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Principals</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {stats ? stats.principalCount : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats ? (stats.principalCount === 1 ? 'assigned' : 'assigned') : 'loading…'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last Modified</p>
                <div className="mt-1">
                  {stats?.lastModified ? (
                    <DateDisplay
                      date={stats.lastModified}
                      formatString="MMM dd, yyyy"
                      className="text-sm font-semibold"
                      highlightExpired={false}
                    />
                  ) : (
                    <span className="text-2xl font-semibold tracking-tight">—</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">modification date</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Info className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="raw"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <FileJson className="h-4 w-4" />
              Raw JSON
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="mt-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 space-y-5">
            {/* Policy Rules */}
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              {/* List header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Policy Rules</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'}
                </span>
              </div>

              {policy.rules.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Shield className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">No rules defined</p>
                    <p className="text-sm text-muted-foreground mt-1">This policy has no rules configured</p>
                  </div>
                </div>
              ) : (
                <div>
                  {policy.rules.map((rule, index) => (
                    <RuleRow key={index} rule={rule} index={index} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Raw JSON Tab */}
          <TabsContent value="raw" className="mt-0">
            <Card className="overflow-hidden rounded-xl shadow-sm">
              <CardHeader className="border-b py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center text-lg">
                      <FileJson className="mr-3 h-5 w-5 text-primary" />
                      Complete Policy Definition
                    </CardTitle>
                    <CardDescription>Raw JSON representation of this policy</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setJsonExpanded(!jsonExpanded)}
                    className="gap-1.5"
                  >
                    {jsonExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Expand
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              {jsonExpanded && (
                <CardContent className="p-6">
                  <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px] text-xs">
                    {JSON.stringify(policy, null, 2)}
                  </pre>
                </CardContent>
              )}
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete Policy Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the policy &quot;{policy.name}&quot;?
              This action cannot be undone.
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
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PolicyDetailsContent />
    </Suspense>
  );
}
