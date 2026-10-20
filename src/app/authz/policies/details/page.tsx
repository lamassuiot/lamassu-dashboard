'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from '@/lib/router';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  AlertCircle,
  Edit,
  Trash2,
  ScrollText,
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  pageTabsListClass,
  pageTabsTriggerClass,
} from '@/components/ui/tabs';
import { getPolicy, getPolicyStats, deletePolicy } from '@/lib/authz-api';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DetailHero, DetailHeroActionsMenu, DetailHeroStat } from '@/components/shared/DetailHero';
import type { Policy, PolicyStats } from '@/types/authz';
import { PolicyRulesView } from '@/components/authz/PolicyRulesView';
import { usePolicySchemas } from '@/hooks/usePolicySchemas';
import { normalizePolicyRules } from '@/lib/policy-format';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import dynamic from '@/components/shared/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const POLICY_CRUMBS = [
  { label: 'Home', href: '/' },
  { label: 'Authorization' },
  { label: 'Policies', href: '/authz/policies' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

function PolicyDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policy_id = searchParams.get('policy_id');

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  if (loading) {
    return (
      <BreadcrumbPage items={POLICY_CRUMBS}>
        <div className="flex flex-col items-center justify-center flex-1 p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading Policy...</p>
        </div>
      </BreadcrumbPage>
    );
  }

  if (error || !policy) {
    return (
      <BreadcrumbPage className="space-y-4" items={POLICY_CRUMBS}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Policy not found'}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push('/authz/policies')}>
          Back to Policies
        </Button>
      </BreadcrumbPage>
    );
  }

  return (
    <BreadcrumbPage
      className="space-y-5"
      items={[
        ...POLICY_CRUMBS,
        { label: <Badge className="max-w-[320px] truncate">{policy.name}</Badge> },
      ]}
    >
      <DetailHero
        icon={ScrollText}
        title={policy.name}
        idLabel="Policy ID"
        id={policy.id}
        description={policy.description}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push(`/authz/policies/edit?policy_id=${policy.id}`)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <DetailHeroActionsMenu ariaLabel="Policy actions">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete Policy
              </DropdownMenuItem>
            </DetailHeroActionsMenu>
          </>
        }
        stats={
          <>
            <DetailHeroStat label="Rules">
              {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'}
            </DetailHeroStat>
            {(policy.http_rules?.length ?? 0) > 0 && (
              <DetailHeroStat label="HTTP rules">
                {policy.http_rules!.length} {policy.http_rules!.length === 1 ? 'rule' : 'rules'}
              </DetailHeroStat>
            )}
            <DetailHeroStat label="Principals">
              {stats ? stats.principal_count : <span className="text-muted-foreground">—</span>}
            </DetailHeroStat>
            <DetailHeroStat label="Created">
              <DateDisplay date={policy.created_at} className="text-sm" />
            </DetailHeroStat>
            <DetailHeroStat label="Last updated">
              <DateDisplay date={policy.updated_at} className="text-sm" />
            </DetailHeroStat>
          </>
        }
      />

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
    </BreadcrumbPage>
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
