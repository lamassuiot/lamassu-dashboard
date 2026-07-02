'use client';

import { useEffect, useState, Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Plus,
  Shield,
  Link2,
  MoreVertical,
  Copy,
  Check,
  FileJson,
  Info,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  pageTabsListClass,
  pageTabsTriggerClass,
} from '@/components/ui/tabs';
import { getPrincipal, getPrincipalPolicies, grantPolicy, revokePolicy, listPolicies, getPolicy, deletePrincipal } from '@/lib/authz-api';
import { normalizeX509AuthConfig } from '@/lib/x509-auth-config';
import { principalHasSubjectAttribute } from '@/lib/principal-subject-attributes';
import type { DateFilterValue, PolicyFilters, Principal, Policy, PrincipalType } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { PolicyFilterBar, defaultPolicyDateFilterValue } from '@/components/shared/filters/PolicyFilterBar';
import type { GenericDateFilterValue } from '@/components/shared/filters/GenericFilterBar';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const PRINCIPAL_TYPE_LABEL: Record<PrincipalType, string> = {
  oidc: 'OIDC',
  x509: 'X.509',
};

const PRINCIPAL_TYPE_CLASSES: Record<PrincipalType, string> = {
  oidc: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  x509: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const getStringRecordEntries = (value: unknown): Array<[string, string]> => {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([, entryValue]) => typeof entryValue === 'string' || typeof entryValue === 'number' || typeof entryValue === 'boolean')
    .map(([key, entryValue]) => [key, String(entryValue)]);
};

const isWfxSbiPolicy = (policy: Policy | null | undefined): boolean => {
  if (!policy) return false;
  const haystack = [
    policy.name,
    policy.description,
    ...(policy.http_rules ?? []).flatMap((rule) => [rule.http_schema_name, rule.http_group_name ?? '']),
  ].join(' ').toLowerCase();

  return haystack.includes('wfx') && haystack.includes('sbi');
};

function PrincipalDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const principal_id = searchParams.get('principal_id');

  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [enrichedPolicies, setEnrichedPolicies] = useState<Array<{ grantedPolicy: any; fullPolicy: Policy | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantDrawerOpen, setGrantDrawerOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [policyResults, setPolicyResults] = useState<Policy[]>([]);
  const [policyResultsLoading, setPolicyResultsLoading] = useState(false);
  const [policySearchTerm, setPolicySearchTerm] = useState('');
  const [policyIdFilter, setPolicyIdFilter] = useState('');
  const [policyDescriptionFilter, setPolicyDescriptionFilter] = useState('');
  const [policyCreatedAtFilter, setPolicyCreatedAtFilter] = useState<GenericDateFilterValue>(defaultPolicyDateFilterValue);
  const [policyUpdatedAtFilter, setPolicyUpdatedAtFilter] = useState<GenericDateFilterValue>(defaultPolicyDateFilterValue);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [assigningPolicyId, setAssigningPolicyId] = useState<string | null>(null);
  const [selectedPolicyToRevoke, setSelectedPolicyToRevoke] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const monacoTheme = useMonacoTheme();

  useEffect(() => {
    if (principal_id) loadPrincipalDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal_id]);

  const loadPrincipalDetails = async () => {
    if (!principal_id) return;
    try {
      setLoading(true);
      const [principalData, policiesData] = await Promise.all([
        getPrincipal(principal_id),
        getPrincipalPolicies(principal_id).catch(() => ({ principal_id, list: [], next: '' })),
      ]);
      setPrincipal(principalData);
      setPolicies(policiesData.list || []);

      const assignedPolicies = policiesData.list || [];
      if (assignedPolicies.length > 0) {
        const enriched = await Promise.all(
          assignedPolicies.map(async (grantedPolicy) => {
            try {
              const fullPolicy = await getPolicy(grantedPolicy.policy_id);
              return { grantedPolicy, fullPolicy };
            } catch {
              return { grantedPolicy, fullPolicy: null };
            }
          })
        );
        setEnrichedPolicies(enriched);
      } else {
        setEnrichedPolicies([]);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load principal details');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignPolicy = async (policy_id: string) => {
    if (!principal_id || !policy_id) return;
    try {
      setAssigningPolicyId(policy_id);
      await grantPolicy(principal_id, policy_id);
      setGrantDrawerOpen(false);
      setSelectedPolicyId('');
      setPolicyResults([]);
      await loadPrincipalDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to grant policy');
    } finally {
      setAssigningPolicyId(null);
    }
  };

  const toApiDateFilter = useCallback((filter: GenericDateFilterValue): DateFilterValue | undefined => {
    if (!filter.date) return undefined;
    const date = filter.date instanceof Date ? filter.date : new Date(filter.date);
    if (Number.isNaN(date.getTime())) return undefined;

    const operator = filter.operator === 'before'
      ? 'before'
      : filter.operator === 'equal'
        ? 'equal'
        : 'after';

    return { operator, value: date.toISOString() };
  }, []);

  const policyFilters = useMemo<PolicyFilters>(() => {
    const nextFilters: PolicyFilters = {};
    const trimmedSearchTerm = policySearchTerm.trim();
    const trimmedIdFilter = policyIdFilter.trim();
    const trimmedDescriptionFilter = policyDescriptionFilter.trim();
    const createdAt = toApiDateFilter(policyCreatedAtFilter);
    const updatedAt = toApiDateFilter(policyUpdatedAtFilter);

    if (trimmedSearchTerm) nextFilters.name = trimmedSearchTerm;
    if (trimmedIdFilter) nextFilters.id = trimmedIdFilter;
    if (trimmedDescriptionFilter) nextFilters.description = trimmedDescriptionFilter;
    if (createdAt) nextFilters.created_at = createdAt;
    if (updatedAt) nextFilters.updated_at = updatedAt;

    return nextFilters;
  }, [
    policyCreatedAtFilter,
    policyDescriptionFilter,
    policyIdFilter,
    policySearchTerm,
    policyUpdatedAtFilter,
    toApiDateFilter,
  ]);

  const loadAssignablePolicies = useCallback(async () => {
    if (!grantDrawerOpen) return;

    setPolicyResultsLoading(true);
    try {
      const result = await listPolicies({
        sortBy: 'name',
        sortMode: 'asc',
        filters: policyFilters,
      });
      const assignedIds = new Set(policies.map((policy) => policy.policy_id));
      const availablePolicies = (result.list || []).filter((policy) => !assignedIds.has(policy.id));
      setPolicyResults(availablePolicies);
      setSelectedPolicyId((current) => availablePolicies.some((policy) => policy.id === current) ? current : '');
    } catch {
      setPolicyResults([]);
    } finally {
      setPolicyResultsLoading(false);
    }
  }, [grantDrawerOpen, policies, policyFilters]);

  useEffect(() => {
    loadAssignablePolicies();
  }, [loadAssignablePolicies]);

  const handleRevokePolicy = async () => {
    if (!principal_id || !selectedPolicyToRevoke) return;
    try {
      setSubmitting(true);
      await revokePolicy(principal_id, selectedPolicyToRevoke.policy_id);
      setRevokeDialogOpen(false);
      setSelectedPolicyToRevoke(null);
      await loadPrincipalDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke policy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePrincipal = async () => {
    if (!principal_id) return;
    try {
      setSubmitting(true);
      await deletePrincipal(principal_id);
      router.push('/authz/principals');
    } catch (err: any) {
      setError(err.message || 'Failed to delete principal');
      setSubmitting(false);
    }
  };

  const selectedPolicy = policyResults.find((p) => p.id === selectedPolicyId) ?? null;
  const selectedPolicyNeedsClientId = isWfxSbiPolicy(selectedPolicy) && !principalHasSubjectAttribute(principal?.auth_config, 'client_id');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Principal...</p>
      </div>
    );
  }

  if (error || !principal) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Principal not found'}</AlertDescription>
        </Alert>
        <Button variant="secondary" onClick={() => router.push('/authz/principals')}>
          Back to Principals
        </Button>
      </div>
    );
  }

  const iconBoxClass = principal.type === 'oidc'
    ? 'bg-violet-50 border-violet-200 text-violet-600 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400'
    : 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400';

  const renderAuthConfig = () => {
    const { auth_config, type } = principal;
    const staticAttributeEntries = getStringRecordEntries((auth_config as any)?.subject_attributes);
    const derivedAttributeEntries = getStringRecordEntries((auth_config as any)?.subject_attribute_mappings);

    const renderSubjectAttributes = () => {
      if (staticAttributeEntries.length === 0 && derivedAttributeEntries.length === 0) return null;

      return (
        <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
          <div>
            <p className="font-semibold">Subject Attributes</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Neutral attributes available to policies. Derived values override static values with the same key.
            </p>
          </div>
          <div className="space-y-5 lg:col-span-2">
            {staticAttributeEntries.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Static</p>
                <div className="space-y-2">
                  {staticAttributeEntries.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-3 rounded-md border bg-card px-3 py-2">
                      <code className="truncate font-mono text-xs">{key}</code>
                      <code className="truncate font-mono text-xs text-muted-foreground">{value}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {derivedAttributeEntries.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Derived</p>
                <div className="space-y-2">
                  {derivedAttributeEntries.map(([key, source]) => (
                    <div key={key} className="grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-3 rounded-md border bg-card px-3 py-2">
                      <code className="truncate font-mono text-xs">{key}</code>
                      <code className="truncate font-mono text-xs text-muted-foreground">{source}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    };

    if (type === 'oidc') {
      const oidcConfig = auth_config as any;
      return (
        <div className="divide-y">
          {oidcConfig.issuer && (
            <div className="grid grid-cols-1 gap-6 py-6 first:pt-0 lg:grid-cols-3 lg:gap-10">
              <div>
                <p className="font-semibold">Issuer</p>
                <p className="mt-1 text-sm text-muted-foreground">Token issuer URL for this OIDC principal.</p>
              </div>
              <div className="lg:col-span-2">
                <code className="text-xs bg-muted px-2 py-1.5 rounded block overflow-x-auto font-mono">
                  {String(oidcConfig.issuer)}
                </code>
              </div>
            </div>
          )}
          {oidcConfig.claims && oidcConfig.claims.length > 0 && (
            <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
              <div>
                <p className="font-semibold">Claim Conditions</p>
                <p className="mt-1 text-sm text-muted-foreground">Required claim matches for this principal.</p>
              </div>
              <div className="lg:col-span-2">
                <div className="space-y-2">
                  {oidcConfig.claims.map((claim: any, index: number) => (
                    <div key={index} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2">
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{claim.claim}</code>
                      <span className="text-xs text-muted-foreground shrink-0">{claim.operator}</span>
                      <code className="text-xs font-mono flex-1 truncate">{claim.value}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {renderSubjectAttributes()}
        </div>
      );
    }

    if (type === 'x509') {
      const x509Config = normalizeX509AuthConfig(auth_config);
      return (
        <div className="divide-y">
          {(x509Config.ca_trust?.identity_type || x509Config.ca_trust?.value) && (
            <div className="grid grid-cols-1 gap-6 py-6 first:pt-0 lg:grid-cols-3 lg:gap-10">
              <div>
                <p className="font-semibold">CA Trust</p>
                <p className="mt-1 text-sm text-muted-foreground">Certificate authority used to validate this principal.</p>
              </div>
              <div className="lg:col-span-2">
                <div className="divide-y">
                  {x509Config.ca_trust.identity_type && (
                    <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <p className="text-xs font-medium text-muted-foreground">Identity Type</p>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {String(x509Config.ca_trust.identity_type).replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  )}
                  {x509Config.ca_trust.value && (
                    <div className="py-3 last:pb-0">
                      <p className="text-xs font-medium text-muted-foreground">Trust Value</p>
                      <code className="mt-1 text-xs bg-muted px-2 py-1.5 rounded block overflow-x-auto break-all font-mono">
                        {x509Config.ca_trust.value}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {(x509Config.match_mode || x509Config.serial_number || x509Config.subject_cn) && (
            <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
              <div>
                <p className="font-semibold">Match Rules</p>
                <p className="mt-1 text-sm text-muted-foreground">How the certificate identity is matched.</p>
              </div>
              <div className="lg:col-span-2">
                <div className="divide-y">
                  {x509Config.match_mode && (
                    <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <p className="text-xs font-medium text-muted-foreground">Match Mode</p>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {String(x509Config.match_mode).replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  )}
                  {x509Config.serial_number && (
                    <div className="py-3">
                      <p className="text-xs font-medium text-muted-foreground">Serial Number</p>
                      <code className="mt-1 text-xs bg-muted px-2 py-1.5 rounded block overflow-x-auto font-mono">
                        {x509Config.serial_number}
                      </code>
                    </div>
                  )}
                  {x509Config.subject_cn && (
                    <div className="py-3 last:pb-0">
                      <p className="text-xs font-medium text-muted-foreground">Subject CN</p>
                      <p className="mt-1 text-sm font-medium font-mono">{x509Config.subject_cn}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {renderSubjectAttributes()}
        </div>
      );
    }

    return (
      <p className="text-sm text-muted-foreground">No authentication configuration available.</p>
    );
  };

  return (
    <div className="space-y-5">

      <DetailBreadcrumbRow
        items={[
          { label: 'Home', href: '/' },
          { label: 'Principals', href: '/authz/principals' },
          { label: principal.name },
        ]}
      />

      {/* Identity + Actions + Info strip */}
      <div>
        <div className="flex items-start justify-between gap-4 min-w-0 pb-4 border-b">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2',
              iconBoxClass
            )}>
              {principal.type === 'oidc'
                ? <Link2 className="h-6 w-6" />
                : <Shield className="h-6 w-6" />
              }
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight truncate">{principal.name}</h1>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn('text-xs', PRINCIPAL_TYPE_CLASSES[principal.type])}>
                  {PRINCIPAL_TYPE_LABEL[principal.type] ?? principal.type}
                </Badge>
                {principal.active ? (
                  <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 text-xs">
                    <CheckCircle className="h-3 w-3" /> Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <XCircle className="h-3 w-3" /> Inactive
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono text-muted-foreground">
                  {principal.id}
                </code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(principal.id)}>
                  {copiedId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </Button>
              </div>

              {principal.description && (
                <p className="text-sm text-muted-foreground max-w-2xl">{principal.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              onClick={() => router.push(`/authz/principals/edit?principal_id=${principal.id}`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(`/authz/principals/edit?principal_id=${principal.id}`)}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Edit Principal
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Principal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Info strip */}
        <div className="flex divide-x pt-3 pb-3 border-b">
          <div className="pr-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</p>
            <DateDisplay date={principal.created_at} className="text-sm mt-0.5" highlightExpired={false} />
          </div>
          <div className="px-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Updated</p>
            <DateDisplay date={principal.updated_at} className="text-sm mt-0.5" highlightExpired={false} />
          </div>
          <div className="pl-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned Policies</p>
            <p className="text-sm mt-0.5">{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="authentication" className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
            <TabsTrigger value="authentication" className={pageTabsTriggerClass}>
              <Shield className="h-4 w-4" />
              Authentication
            </TabsTrigger>
            <TabsTrigger value="policies" className={pageTabsTriggerClass}>
              <Info className="h-4 w-4" />
              Policies
              {policies.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{policies.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="raw" className={pageTabsTriggerClass}>
              <FileJson className="h-4 w-4" />
              Raw JSON
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Authentication Tab */}
        <TabsContent value="authentication" className="mt-6">
          {renderAuthConfig()}
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="mt-6 space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => setGrantDrawerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Assign Policy
            </Button>
          </div>

          {policies.length === 0 ? (
            <div className="mt-4 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <div className="flex justify-center mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Shield className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              <p className="font-medium">No policies assigned</p>
              <p className="text-sm text-muted-foreground mt-1">
                Assign a policy to grant permissions to this principal.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => setGrantDrawerOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Assign First Policy
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedPolicies.map(({ grantedPolicy, fullPolicy }) => (
                  <TableRow key={grantedPolicy.policy_id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => router.push(`/authz/policies/details?policy_id=${grantedPolicy.policy_id}`)}
                        className="text-left text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                      >
                        {fullPolicy?.name || grantedPolicy.policy_name}
                      </button>
                      {fullPolicy?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs mt-0.5">{fullPolicy.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{grantedPolicy.policy_id}</p>
                    </TableCell>
                    <TableCell>
                      <DateDisplay
                        date={grantedPolicy.granted_at}
                        className="text-xs text-muted-foreground"
                        highlightExpired={false}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => { setSelectedPolicyToRevoke(grantedPolicy); setRevokeDialogOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Raw JSON Tab */}
        <TabsContent value="raw" className="mt-6">
          <div className="rounded-md border overflow-hidden">
            <MonacoEditor
              height="500px"
              language="json"
              value={JSON.stringify(principal, null, 2)}
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

      {/* Assign Policy Sheet */}
      <Sheet
        open={grantDrawerOpen}
        onOpenChange={(isOpen) => {
          setGrantDrawerOpen(isOpen);
          if (!isOpen) {
            setPolicySearchTerm('');
            setPolicyIdFilter('');
            setPolicyDescriptionFilter('');
            setPolicyCreatedAtFilter(defaultPolicyDateFilterValue);
            setPolicyUpdatedAtFilter(defaultPolicyDateFilterValue);
            setSelectedPolicyId('');
            setPolicyResults([]);
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-none"
        >
          <SheetHeader className="border-b px-6 py-5 shrink-0 text-left">
            <SheetTitle>Assign Policy</SheetTitle>
            <SheetDescription>Select a policy to grant to this principal.</SheetDescription>
          </SheetHeader>

          <div className="border-b px-6 py-4 shrink-0">
            <PolicyFilterBar
              searchTerm={policySearchTerm}
              onSearchTermChange={(value) => {
                setPolicySearchTerm(value);
                setSelectedPolicyId('');
              }}
              idFilter={policyIdFilter}
              onIdFilterChange={(value) => {
                setPolicyIdFilter(value);
                setSelectedPolicyId('');
              }}
              descriptionFilter={policyDescriptionFilter}
              onDescriptionFilterChange={(value) => {
                setPolicyDescriptionFilter(value);
                setSelectedPolicyId('');
              }}
              createdAtFilter={policyCreatedAtFilter}
              onCreatedAtFilterChange={(value) => {
                setPolicyCreatedAtFilter(value);
                setSelectedPolicyId('');
              }}
              updatedAtFilter={policyUpdatedAtFilter}
              onUpdatedAtFilterChange={(value) => {
                setPolicyUpdatedAtFilter(value);
                setSelectedPolicyId('');
              }}
              disabled={policyResultsLoading || !!assigningPolicyId}
            />
          </div>

          <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden px-6 py-4">
            {policyResultsLoading && policyResults.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : policyResults.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-sm font-medium">No policies found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Object.keys(policyFilters).length > 0
                    ? 'Try adjusting the filters.'
                    : 'All available policies are already assigned or none exist yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policyResults.map((policy) => {
                      const isSelected = selectedPolicy?.id === policy.id;

                      return (
                        <TableRow
                          key={policy.id}
                          className={cn('cursor-pointer', isSelected && 'bg-primary/5')}
                          onClick={() => setSelectedPolicyId(isSelected ? '' : policy.id)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className={cn('truncate', isSelected && 'text-primary')}>{policy.name}</div>
                                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{policy.id}</p>
                              </div>
                              {isSelected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                            </div>
                          </TableCell>
                          <TableCell>
                            {policy.description ? (
                              <p className="line-clamp-2 text-sm text-muted-foreground">{policy.description}</p>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DateDisplay date={policy.created_at} className="text-xs" highlightExpired={false} />
                          </TableCell>
                          <TableCell>
                            <DateDisplay date={policy.updated_at} className="text-xs" highlightExpired={false} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <SheetFooter className="border-t px-6 py-4 shrink-0">
            {selectedPolicy && (
              <div className="mr-auto space-y-2">
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-medium truncate">{selectedPolicy.name}</span>
                </div>
                {selectedPolicyNeedsClientId && (
                  <Alert className="max-w-md py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      This WFX SBI policy requires subject attribute client_id for job route constraints.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setGrantDrawerOpen(false)} disabled={!!assigningPolicyId}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedPolicy && handleAssignPolicy(selectedPolicy.id)}
                disabled={!selectedPolicy || !!assigningPolicyId}
              >
                {assigningPolicyId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign Policy
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Revoke Policy Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke &quot;{selectedPolicyToRevoke?.policy_name}&quot; from this principal?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokePolicy} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Policy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Principal Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Principal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{principal.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePrincipal} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PrincipalDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center flex-1 p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        </div>
      }
    >
      <PrincipalDetailsContent />
    </Suspense>
  );
}
