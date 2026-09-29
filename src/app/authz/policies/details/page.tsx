'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import { getPolicy, getPolicyStats, deletePolicy } from '@/lib/authz-api';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import type { Policy, PolicyStats } from '@/types/authz';
import { PolicyRulesView } from '@/components/authz/PolicyRulesView';
import { usePolicySchemas } from '@/hooks/usePolicySchemas';
import { normalizePolicyRules } from '@/lib/policy-format';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

// ─── Main page ────────────────────────────────────────────────────────────────

function PolicyDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policy_id = searchParams.get('policy_id');

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const monacoTheme = useMonacoTheme();
  const { schemas, httpSchemas } = usePolicySchemas();

  useEffect(() => {
    if (policy_id) loadPolicyDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy_id]);

  const loadPolicyDetails = async () => {
    if (!policy_id) return;
    try {
      setLoading(true);
      const [policyData, statsData] = await Promise.all([
        getPolicy(policy_id),
        getPolicyStats(policy_id).catch(() => null),
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
            <div className="border-y py-10 text-center">
              <p className="text-sm font-medium">No rules defined</p>
              <p className="mt-1 text-sm text-muted-foreground">This policy grants nothing until it has at least one rule.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => router.push(`/authz/policies/edit?policy_id=${policy.id}`)}
              >
                <Edit className="mr-1.5 h-3.5 w-3.5" />
                Add Rules
              </Button>
            </div>
          ) : (
            <PolicyRulesView
              rules={normalizePolicyRules(policy.rules)}
              httpRules={policy.http_rules ?? []}
              schemas={schemas}
              httpSchemas={httpSchemas}
            />
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
