'use client';

import { useEffect, useState, Suspense, useCallback, useRef } from 'react';
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
  Search,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
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
import { getPrincipal, getPrincipalPolicies, grantPolicy, revokePolicy, searchPolicies, getPolicy, deletePrincipal } from '@/lib/authz-api';
import { normalizeX509AuthConfig } from '@/lib/x509-auth-config';
import type { Principal, Policy } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { DetailBreadcrumbRow } from '@/components/shared/DetailBreadcrumbRow';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

function PrincipalDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const principalId = searchParams.get('principalId');

  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [enrichedPolicies, setEnrichedPolicies] = useState<Array<{ grantedPolicy: any; fullPolicy: Policy | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantDrawerOpen, setGrantDrawerOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [policySearchQuery, setPolicySearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Policy[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [assigningPolicyId, setAssigningPolicyId] = useState<string | null>(null);
  const [selectedPolicyToRevoke, setSelectedPolicyToRevoke] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monacoTheme = useMonacoTheme();

  useEffect(() => {
    if (principalId) loadPrincipalDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principalId]);

  const loadPrincipalDetails = async () => {
    if (!principalId) return;
    try {
      setLoading(true);
      const [principalData, policiesData] = await Promise.all([
        getPrincipal(principalId),
        getPrincipalPolicies(principalId).catch(() => ({ policies: [] })),
      ]);
      setPrincipal(principalData);
      setPolicies(policiesData.policies || []);

      const assignedPolicies = policiesData.policies || [];
      if (assignedPolicies.length > 0) {
        const enriched = await Promise.all(
          assignedPolicies.map(async (grantedPolicy) => {
            try {
              const fullPolicy = await getPolicy(grantedPolicy.policyId);
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

  const handleAssignPolicy = async (policyId: string) => {
    if (!principalId || !policyId) return;
    try {
      setAssigningPolicyId(policyId);
      await grantPolicy(principalId, policyId);
      setGrantDrawerOpen(false);
      setPolicySearchQuery('');
      setSelectedPolicyId('');
      setSearchResults([]);
      loadPrincipalDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to grant policy');
    } finally {
      setAssigningPolicyId(null);
    }
  };

  const runPolicySearch = useCallback(async (query: string) => {
    setSearchLoading(true);
    try {
      const result = await searchPolicies(query);
      const assignedIds = new Set(policies.map((p) => p.policyId));
      setSearchResults((result.policies || []).filter((p) => !assignedIds.has(p.id)));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [policies]);

  useEffect(() => {
    if (!grantDrawerOpen) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const delay = policySearchQuery === '' ? 0 : 250;
    searchDebounceRef.current = setTimeout(() => runPolicySearch(policySearchQuery), delay);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [policySearchQuery, grantDrawerOpen, runPolicySearch]);

  const handleRevokePolicy = async () => {
    if (!principalId || !selectedPolicyToRevoke) return;
    try {
      setSubmitting(true);
      await revokePolicy(principalId, selectedPolicyToRevoke.policyId);
      setRevokeDialogOpen(false);
      setSelectedPolicyToRevoke(null);
      loadPrincipalDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke policy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePrincipal = async () => {
    if (!principalId) return;
    try {
      setSubmitting(true);
      await deletePrincipal(principalId);
      router.push('/authz/principals');
    } catch (err: any) {
      setError(err.message || 'Failed to delete principal');
      setSubmitting(false);
    }
  };

  const selectedPolicy = searchResults.find((p) => p.id === selectedPolicyId) ?? null;

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
        <Button variant="outline" onClick={() => router.push('/authz/principals')}>
          Back to Principals
        </Button>
      </div>
    );
  }

  const iconBoxClass = principal.type === 'oidc'
    ? 'bg-violet-50 border-violet-200 text-violet-600 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400'
    : 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400';

  const renderAuthConfig = () => {
    const { authConfig, type } = principal;

    if (type === 'oidc') {
      const oidcConfig = authConfig as any;
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
        </div>
      );
    }

    if (type === 'x509') {
      const x509Config = normalizeX509AuthConfig(authConfig);
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
                <Badge variant="secondary" className="text-xs font-mono uppercase">
                  {principal.type}
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
              variant="outline"
              size="sm"
              onClick={() => router.push(`/authz/principals/edit?principalId=${principal.id}`)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
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
                  onClick={() => router.push(`/authz/principals/edit?principalId=${principal.id}`)}
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
            <DateDisplay date={principal.createdAt} className="text-sm mt-0.5" highlightExpired={false} />
          </div>
          <div className="px-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Updated</p>
            <DateDisplay date={principal.updatedAt} className="text-sm mt-0.5" highlightExpired={false} />
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
            <Button size="sm" onClick={() => setGrantDrawerOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
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
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setGrantDrawerOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
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
                  <TableRow key={grantedPolicy.policyId}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => router.push(`/authz/policies/details?policyId=${grantedPolicy.policyId}`)}
                        className="text-left text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                      >
                        {fullPolicy?.name || grantedPolicy.policyName}
                      </button>
                      {fullPolicy?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs mt-0.5">{fullPolicy.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{grantedPolicy.policyId}</p>
                    </TableCell>
                    <TableCell>
                      <DateDisplay
                        date={grantedPolicy.grantedAt}
                        className="text-xs text-muted-foreground"
                        highlightExpired={false}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setSelectedPolicyToRevoke(grantedPolicy); setRevokeDialogOpen(true); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
          if (!isOpen) { setPolicySearchQuery(''); setSelectedPolicyId(''); setSearchResults([]); }
        }}
      >
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-[480px]">
          <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
            <SheetTitle>Assign Policy</SheetTitle>
            <SheetDescription>Select a policy to grant to this principal.</SheetDescription>
          </SheetHeader>

          <div className="px-4 py-3 border-b shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                placeholder="Search policies…"
                value={policySearchQuery}
                onChange={(e) => { setPolicySearchQuery(e.target.value); setSelectedPolicyId(''); }}
                className="pl-9 pr-8 h-9 text-sm"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {searchLoading && searchResults.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <p className="text-sm font-medium">No policies found</p>
                {policySearchQuery.trim() !== '' && (
                  <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
                )}
              </div>
            ) : (
              <ul className="divide-y">
                {searchResults.map((policy) => {
                  const isSelected = selectedPolicy?.id === policy.id;
                  return (
                    <li key={policy.id}>
                      <button
                        type="button"
                        className="relative w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                        onClick={() => setSelectedPolicyId(isSelected ? '' : policy.id)}
                        disabled={!!assigningPolicyId}
                      >
                        {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                        <div className="flex items-center justify-between gap-3 pl-1">
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-sm font-medium truncate', isSelected && 'text-primary')}>
                              {policy.name}
                            </p>
                            <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">{policy.id}</p>
                            {policy.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{policy.description}</p>
                            )}
                          </div>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t px-4 py-3 shrink-0 space-y-3">
            {selectedPolicy && (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-medium truncate">{selectedPolicy.name}</span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setGrantDrawerOpen(false)} disabled={!!assigningPolicyId}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => selectedPolicy && handleAssignPolicy(selectedPolicy.id)}
                disabled={!selectedPolicy || !!assigningPolicyId}
              >
                {assigningPolicyId && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Assign Policy
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Revoke Policy Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke &quot;{selectedPolicyToRevoke?.policyName}&quot; from this principal?
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
