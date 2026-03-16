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
  Users,
  FileText,
  MoreVertical,
  Copy,
  Check,
  FileJson,
  ChevronDown,
  ChevronUp,
  Calendar,
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

// ─── EntityTypePill ──────────────────────────────────────────────────────────

function EntityTypePill({ schema, entity, size = 'sm' }: { schema: string; entity: string; size?: 'sm' | 'md' }) {
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono ${textSize} bg-muted border rounded px-2 py-0.5`}>
      {schema && (
        <>
          <span className="text-muted-foreground">{schema}</span>
          <span className="text-muted-foreground/50">.</span>
        </>
      )}
      <span className="font-semibold text-foreground">{entity || '*'}</span>
    </span>
  );
}

// ─── ActionBadge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-mono font-medium ${getActionClassName(action)}`}
    >
      {action === '*' ? '* (all)' : action}
    </span>
  );
}

// ─── RelationNode ─────────────────────────────────────────────────────────────

function RelationNode({ relation, depth = 0 }: { relation: RelationRule; depth?: number }) {
  const { schema, entity } = getRelationEntityDisplay(relation);
  const hasNested = relation.relations && relation.relations.length > 0;

  return (
    <div className={depth > 0 ? 'ml-6 border-l-2 border-muted pl-4 pt-3' : ''}>
      {/* Header row: via [name] → entity */}
      <div className="flex items-center flex-wrap gap-2 text-sm">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">via</span>
        <code className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-mono font-semibold">
          {relation.via}
        </code>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <EntityTypePill schema={schema} entity={entity} />
      </div>

      {/* Granted actions */}
      {relation.actions && relation.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1">
          <span className="text-xs text-muted-foreground mr-0.5">grants:</span>
          {relation.actions.map((action, i) => (
            <ActionBadge key={i} action={action} />
          ))}
        </div>
      )}

      {/* Nested relations */}
      {hasNested && (
        <div className="mt-2 space-y-3">
          {relation.relations!.map((nested, i) => (
            <RelationNode key={i} relation={nested} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RuleCard ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, index }: { rule: any; index: number }) {
  const { schema, entity } = splitEntityDisplay(rule);
  const namespace: string | undefined = rule.namespace || undefined;
  const actionCount = rule.actions?.length || 0;
  const directGrantCount = rule.directGrants?.length || 0;
  const relationCount = rule.relations?.length || 0;

  const parts: string[] = [];
  if (actionCount > 0) parts.push(`${actionCount} ${actionCount === 1 ? 'action' : 'actions'}`);
  if (directGrantCount > 0) parts.push(`${directGrantCount} direct ${directGrantCount === 1 ? 'grant' : 'grants'}`);
  if (relationCount > 0) parts.push(`${relationCount} relation ${relationCount === 1 ? 'path' : 'paths'}`);

  return (
    <Card className="overflow-hidden">
      {/* Rule header */}
      <div className="flex items-center gap-3 bg-muted/40 border-b px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
          {index + 1}
        </span>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {namespace && (
            <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
              {namespace}
            </Badge>
          )}
          <EntityTypePill schema={schema} entity={entity} size="md" />
          <span className="text-xs text-muted-foreground">{parts.join(' · ')}</span>
        </div>
      </div>

      <CardContent className="p-0 divide-y">
        {/* ── Direct Actions ─────────────────────────────────────────────── */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-medium">Direct Actions</span>
            <span className="text-xs text-muted-foreground">
              — what the principal can do on any&nbsp;
              <code className="text-xs font-mono">{entity || '*'}</code>
            </span>
          </div>
          {actionCount === 0 ? (
            <p className="text-xs text-muted-foreground pl-5">No direct actions defined</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pl-5">
              {rule.actions.map((action: string, i: number) => (
                <ActionBadge key={i} action={action} />
              ))}
            </div>
          )}
        </div>

        {/* ── Direct Grants ──────────────────────────────────────────────── */}
        {directGrantCount > 0 && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-sm font-medium">Direct Grants</span>
              <span className="text-xs text-muted-foreground">— explicitly granted entity references</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-5">
              {rule.directGrants.map((grant: string, i: number) => (
                <Badge key={i} variant="secondary" className="font-mono text-xs">
                  {grant}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ── Relation Paths ─────────────────────────────────────────────── */}
        {relationCount > 0 && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-sm font-medium">Permission via Relations</span>
              <span className="text-xs text-muted-foreground">— access inherited through entity relationships</span>
            </div>
            <div className="space-y-4 pl-5">
              {rule.relations.map((relation: RelationRule, i: number) => (
                <RelationNode key={i} relation={relation} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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

      {/* Header card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="h-1 w-full bg-primary" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="-ml-1 mt-0.5 shrink-0"
                onClick={() => router.push('/authz/policies')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight truncate">{policy.name}</h1>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <Badge variant="secondary" className="text-xs">
                      {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'}
                    </Badge>
                  </div>
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
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
            {/* Stats Cards */}
            {stats && (
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="overflow-hidden rounded-xl shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-4">
                    <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="text-2xl font-bold">{stats.ruleCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {policy.rules.length === 1 ? 'rule' : 'rules'} defined
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden rounded-xl shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-4">
                    <CardTitle className="text-sm font-medium">Assigned Principals</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="text-2xl font-bold">{stats.principalCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.principalCount === 1 ? 'principal has' : 'principals have'} this policy
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden rounded-xl shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-4">
                    <CardTitle className="text-sm font-medium">Last Modified</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="p-6">
                    {stats.lastModified ? (
                      <DateDisplay
                        date={stats.lastModified}
                        formatString="MMM dd, yyyy"
                        className="text-sm font-medium"
                        highlightExpired={false}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">N/A</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Policy Rules */}
            <Card className="overflow-hidden rounded-xl shadow-sm">
              <CardHeader className="border-b py-4">
                <CardTitle className="flex items-center text-lg">
                  <Shield className="mr-3 h-5 w-5 text-primary" />
                  Policy Rules
                </CardTitle>
                <CardDescription className="mt-1">
                  {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'} — each rule defines what a principal
                  can do on a given entity type, and what access is inherited through relationships.
                </CardDescription>
              </CardHeader>

              {policy.rules.length === 0 ? (
                <CardContent className="p-12">
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Shield className="h-6 w-6 text-muted-foreground" />
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">No rules defined</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        This policy has no rules configured
                      </p>
                    </div>
                  </div>
                </CardContent>
              ) : (
                <CardContent className="p-5">
                  <div className="space-y-4">
                    {policy.rules.map((rule, index) => (
                      <RuleCard key={index} rule={rule} index={index} />
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
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
