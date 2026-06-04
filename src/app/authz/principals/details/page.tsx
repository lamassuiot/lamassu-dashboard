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
  ChevronDown,
  ChevronUp,
  Info,
  Search,
  Calendar,
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
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const togglePolicyJson = (policyId: string) => {
    setExpandedPolicies((prev) => {
      const next = new Set(prev);
      next.has(policyId) ? next.delete(policyId) : next.add(policyId);
      return next;
    });
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
            <div className="pb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Issuer</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto font-mono">
                {String(oidcConfig.issuer)}
              </code>
            </div>
          )}
          {oidcConfig.claims && oidcConfig.claims.length > 0 && (
            <div className={oidcConfig.issuer ? 'pt-4' : ''}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Claim Conditions
              </p>
              <div className="space-y-2">
                {oidcConfig.claims.map((claim: any, index: number) => (
                  <div key={index} className="relative rounded-lg border bg-card overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-400 dark:bg-violet-600" />
                    <div className="pl-4 pr-3 py-2 flex items-center gap-2">
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{claim.claim}</code>
                      <span className="text-xs text-muted-foreground shrink-0">{claim.operator}</span>
                      <code className="text-xs font-mono flex-1 truncate">{claim.value}</code>
                    </div>
                  </div>
                ))}
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
          {x509Config.ca_trust?.identity_type && (
            <div className="pb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">CA Identity Type</p>
              <Badge variant="secondary" className="font-mono text-xs">
                {String(x509Config.ca_trust.identity_type).replace(/_/g, ' ')}
              </Badge>
            </div>
          )}
          {x509Config.ca_trust?.value && (
            <div className="py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">CA Trust Value</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto break-all font-mono">
                {x509Config.ca_trust.value}
              </code>
            </div>
          )}
          {x509Config.match_mode && (
            <div className="py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Match Mode</p>
              <Badge variant="secondary" className="font-mono text-xs">
                {String(x509Config.match_mode).replace(/_/g, ' ')}
              </Badge>
            </div>
          )}
          {x509Config.serial_number && (
            <div className="py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Serial Number</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto font-mono">
                {x509Config.serial_number}
              </code>
            </div>
          )}
          {x509Config.subject_cn && (
            <div className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Subject CN</p>
              <p className="text-sm font-mono">{x509Config.subject_cn}</p>
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
        actions={
          <div className="flex items-center gap-2">
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
        }
      />

      {/* Identity */}
      <div className="flex items-start gap-4 min-w-0">
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

      {/* Info strip */}
      <div className="flex flex-wrap items-center gap-8 pt-1 border-t">
        <div className="py-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</p>
          <DateDisplay date={principal.createdAt} formatString="MMM dd, yyyy" className="text-sm mt-1" highlightExpired={false} />
        </div>
        <div className="py-3 border-l pl-8">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Updated</p>
          <DateDisplay date={principal.updatedAt} formatString="MMM dd, yyyy" className="text-sm mt-1" highlightExpired={false} />
        </div>
        <div className="py-3 border-l pl-8">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned Policies</p>
          <p className="text-sm mt-1">{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</p>
        </div>
      </div>

      <div className="border-t" />

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
          <div className="max-w-lg">
            {renderAuthConfig()}
          </div>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {policies.length === 0
                ? 'No policies assigned yet.'
                : `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'} assigned to this principal.`}
            </p>
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
            <div className="divide-y border rounded-lg overflow-hidden">
              {enrichedPolicies.map(({ grantedPolicy, fullPolicy }) => {
                const isExpanded = expandedPolicies.has(grantedPolicy.policyId);
                return (
                  <div key={grantedPolicy.policyId} className="p-4 bg-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-1">
                        <button
                          onClick={() => router.push(`/authz/policies/details?policyId=${grantedPolicy.policyId}`)}
                          className="font-medium text-primary hover:underline underline-offset-4 text-left"
                        >
                          {fullPolicy?.name || grantedPolicy.policyName}
                        </button>
                        {fullPolicy?.description && (
                          <p className="text-sm text-muted-foreground">{fullPolicy.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground font-mono">{grantedPolicy.policyId}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <DateDisplay
                          date={grantedPolicy.grantedAt}
                          formatString="MMM dd, yyyy"
                          className="text-xs text-muted-foreground mr-2"
                          highlightExpired={false}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => togglePolicyJson(grantedPolicy.policyId)}
                          title={isExpanded ? 'Collapse' : 'Expand JSON'}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { setSelectedPolicyToRevoke(grantedPolicy); setRevokeDialogOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && fullPolicy && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2 mb-2">
                          <FileJson className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Policy Definition</span>
                        </div>
                        <pre className="bg-muted p-3 rounded-lg overflow-auto max-h-[400px] text-xs">
                          {JSON.stringify(fullPolicy, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Raw JSON Tab */}
        <TabsContent value="raw" className="mt-6">
          <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px] text-xs">
            {JSON.stringify(principal, null, 2)}
          </pre>
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
