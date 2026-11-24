'use client';

import { useEffect, useState, Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from '@/lib/router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { sileo } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Plus,
  Shield,
  Link2,
  FileJson,
  Info,
  X,
} from 'lucide-react';
import Link from '@/components/shared/RouterLink';
import { ReadOnlyField } from '@/components/shared/DecodedCertificateSections';
import { DetailSection } from '@/components/shared/DetailSection';
import { fetchAndProcessCAs, type CA } from '@/lib/ca-data';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
import type { DateFilterValue, PolicyFilters, Principal, Policy, PrincipalType, X509MatchMode } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DetailHero, DetailHeroActionsMenu, DetailHeroStat } from '@/components/shared/DetailHero';
import { cn } from '@/lib/utils';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { PolicyFilterBar, defaultPolicyDateFilterValue } from '@/components/shared/filters/PolicyFilterBar';
import type { GenericDateFilterValue } from '@/components/shared/filters/GenericFilterBar';
import dynamic from '@/components/shared/dynamic';
import { DetailPageSkeleton, TableSkeleton } from '@/components/shared/PageSkeletons';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const PRINCIPAL_CRUMBS = [
  { label: 'Home', href: '/' },
  { label: 'Authorization' },
  { label: 'Principals', href: '/authz/principals' },
];

const PRINCIPAL_TYPE_LABEL: Record<PrincipalType, string> = {
  oidc: 'OIDC',
  x509: 'X.509',
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

const X509_MATCH_MODE_LABEL: Record<X509MatchMode, string> = {
  any_from_ca: 'Any certificate issued by the trusted CA',
  subject_cn: 'Certificates whose subject CN matches',
  cn_and_ca: 'Subject CN match, issued by the trusted CA',
  serial_and_ca: 'Serial number match, issued by the trusted CA',
};

const CA_TRUST_LABEL: Record<string, string> = {
  authority_key_id: 'Authority Key Identifier',
  fingerprint: 'SHA-256 fingerprint',
};

/**
 * The CA whose SKI equals the principal's trusted AKI. The stored value may or may not use
 * colons, so both spellings are tried.
 */
function useCaByKeyId(keyId: string | undefined) {
  const [ca, setCa] = useState<CA | null>(null);
  useEffect(() => {
    setCa(null);
    if (!keyId) return;
    let cancelled = false;
    const bare = keyId.replaceAll(':', '').toLowerCase();
    const colon = bare.match(/.{1,2}/g)?.join(':') ?? bare;
    (async () => {
      for (const candidate of [...new Set([keyId, bare, colon])]) {
        try {
          const [match] = await fetchAndProcessCAs(`filter=subject_key_id[equal]${encodeURIComponent(candidate)}`);
          if (match) {
            if (!cancelled) setCa(match);
            return;
          }
        } catch {
          return; // The CA is only a convenience link; the AKI itself is still shown.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [keyId]);
  return ca;
}

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
  // Kept as policies, not IDs, so a selection survives a search that no longer lists it.
  const [selectedPolicies, setSelectedPolicies] = useState<Policy[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedPolicyToRevoke, setSelectedPolicyToRevoke] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  const togglePolicySelection = (policy: Policy) => {
    setSelectedPolicies((current) => current.some((p) => p.id === policy.id)
      ? current.filter((p) => p.id !== policy.id)
      : [...current, policy]);
  };

  /** Grants every selected policy. Grants that fail stay selected so they can be retried. */
  const handleAssignPolicies = async () => {
    if (!principal_id || selectedPolicies.length === 0) return;
    setIsAssigning(true);
    const results = await Promise.allSettled(selectedPolicies.map((policy) => grantPolicy(principal_id, policy.id)));
    const failed = selectedPolicies.filter((_, index) => results[index].status === 'rejected');
    const granted = selectedPolicies.length - failed.length;
    setIsAssigning(false);

    if (granted > 0) {
      sileo.success({
        title: granted === 1 ? 'Policy assigned' : `${granted} policies assigned`,
        description: `Granted to ${principal?.name ?? 'this principal'}.`,
      });
    }
    if (failed.length > 0) {
      const reason = (results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason;
      sileo.error({
        title: failed.length === 1 ? 'Could not assign 1 policy' : `Could not assign ${failed.length} policies`,
        description: `${failed.map((policy) => policy.name).join(', ')}: ${reason?.message ?? 'unknown error'}`,
      });
      setSelectedPolicies(failed);
    } else {
      setGrantDrawerOpen(false);
      setSelectedPolicies([]);
      setPolicyResults([]);
    }
    if (granted > 0) await loadPrincipalDetails();
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

  const trustedKeyId = useMemo(() => {
    if (principal?.type !== 'x509') return undefined;
    const trust = normalizeX509AuthConfig(principal.auth_config).ca_trust;
    return trust?.identity_type === 'authority_key_id' ? trust.value : undefined;
  }, [principal]);
  const trustedCa = useCaByKeyId(trustedKeyId);

  const selectedPolicyIds = new Set(selectedPolicies.map((policy) => policy.id));
  const selectedPolicyNeedsClientId = selectedPolicies.some(isWfxSbiPolicy)
    && !principalHasSubjectAttribute(principal?.auth_config, 'client_id');

  if (loading) {
    return (
      <BreadcrumbPage items={PRINCIPAL_CRUMBS}>
        <DetailPageSkeleton label="Loading principal…" tabs={3} />
      </BreadcrumbPage>
    );
  }

  if (error || !principal) {
    return (
      <BreadcrumbPage className="space-y-4" items={PRINCIPAL_CRUMBS}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Principal not found'}</AlertDescription>
        </Alert>
        <Button variant="secondary" onClick={() => router.push('/authz/principals')}>
          Back to Principals
        </Button>
      </BreadcrumbPage>
    );
  }

  const staticAttributeEntries = getStringRecordEntries((principal.auth_config as any)?.subject_attributes);
  const derivedAttributeEntries = getStringRecordEntries((principal.auth_config as any)?.subject_attribute_mappings);
  const x509Config = principal.type === 'x509' ? normalizeX509AuthConfig(principal.auth_config) : null;

  const renderAuthentication = () => {
    if (principal.type === 'oidc') {
      const oidcConfig = principal.auth_config as any;
      const claims: Array<{ claim: string; operator: string; value: string }> = oidcConfig.claims ?? [];
      return (
        <DetailSection
          title="Authentication"
          description="OIDC tokens are accepted for this principal when every claim condition holds."
        >
          <ReadOnlyField label="Credential" value="OIDC token" />
          {oidcConfig.issuer && <ReadOnlyField label="Issuer" value={String(oidcConfig.issuer)} mono />}
          <div className="space-y-2 pt-4">
            <p className="text-sm leading-none font-medium">Claim conditions</p>
            {claims.length === 0 ? (
              <p className="text-sm text-muted-foreground">None: any token from the issuer matches.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((claim, index) => (
                    <TableRow key={`${claim.claim}-${index}`}>
                      <TableCell className="font-mono text-sm">{claim.claim}</TableCell>
                      <TableCell className="text-muted-foreground">{claim.operator}</TableCell>
                      <TableCell className="max-w-[24rem] truncate font-mono text-sm" title={claim.value}>{claim.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DetailSection>
      );
    }

    if (x509Config) {
      const trust = x509Config.ca_trust;
      return (
        <DetailSection
          title="Authentication"
          description="X.509 client certificates are accepted for this principal when they match this rule."
        >
          <ReadOnlyField label="Credential" value="X.509 certificate" />
          <ReadOnlyField label="Match rule" value={X509_MATCH_MODE_LABEL[x509Config.match_mode] ?? x509Config.match_mode} />
          {x509Config.subject_cn && <ReadOnlyField label="Subject CN" value={x509Config.subject_cn} mono />}
          {x509Config.serial_number && <ReadOnlyField label="Serial number" value={x509Config.serial_number} mono />}
          {trust?.value && (
            <div className="space-y-1.5">
              <ReadOnlyField
                label={`Trusted CA · ${CA_TRUST_LABEL[trust.identity_type] ?? trust.identity_type}`}
                value={trust.value}
                mono
              />
              {trustedCa && (
                <p className="text-sm text-muted-foreground">
                  Issued by{' '}
                  <Link
                    href={`/certificate-authorities/details?caId=${encodeURIComponent(trustedCa.id)}`}
                    className={cn(buttonVariants({ variant: 'link' }), 'h-auto p-0 font-medium')}
                  >
                    {trustedCa.name}
                  </Link>
                </p>
              )}
            </div>
          )}
        </DetailSection>
      );
    }

    return (
      <DetailSection title="Authentication" description="How this principal authenticates.">
        <p className="text-sm text-muted-foreground">No authentication configuration available.</p>
      </DetailSection>
    );
  };

  const renderSubjectAttributes = () => {
    const rows = [
      ...staticAttributeEntries.map(([key, value]) => ({ key, value, source: 'Static' })),
      ...derivedAttributeEntries.map(([key, value]) => ({ key, value, source: 'Derived' })),
    ];
    if (rows.length === 0) return null;
    return (
      <>
        <Separator />
        <DetailSection
          title="Subject attributes"
          description="Attributes available to policies. Derived values override static values with the same key."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attribute</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.source}-${row.key}`}>
                  <TableCell className="font-mono text-sm">{row.key}</TableCell>
                  <TableCell className="max-w-[20rem] truncate font-mono text-sm" title={row.value}>{row.value}</TableCell>
                  <TableCell className="text-muted-foreground">{row.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DetailSection>
      </>
    );
  };

  const renderPolicies = () => (
    <DetailSection
      title="Policies"
      description="Policies granted to this principal. Together they decide what it may do."
      aside={(
        <Button variant="secondary" size="sm" onClick={() => setGrantDrawerOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Assign policy
        </Button>
      )}
    >
      {policies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No policies assigned yet, so this principal is not allowed to do anything.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Policy</TableHead>
              <TableHead className="text-center">Granted</TableHead>
              <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedPolicies.map(({ grantedPolicy, fullPolicy }) => {
              const name = fullPolicy?.name || grantedPolicy.policy_name;
              return (
                <TableRow key={grantedPolicy.policy_id}>
                  <TableCell className="max-w-[28rem] whitespace-normal">
                    <Link
                      href={`/authz/policies/details?policy_id=${encodeURIComponent(grantedPolicy.policy_id)}`}
                      title={`ID: ${grantedPolicy.policy_id}`}
                      className={cn(buttonVariants({ variant: 'link' }), 'block h-auto truncate p-0 text-left font-medium')}
                    >
                      {name}
                    </Link>
                    {fullPolicy?.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={fullPolicy.description}>
                        {fullPolicy.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <DateDisplay date={grantedPolicy.granted_at} className="items-center" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={`Revoke ${name}`}
                      aria-label={`Revoke ${name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => { setSelectedPolicyToRevoke(grantedPolicy); setRevokeDialogOpen(true); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </DetailSection>
  );

  return (
    <BreadcrumbPage
      className="space-y-5"
      items={[
        ...PRINCIPAL_CRUMBS,
        { label: <Badge className="max-w-[320px] truncate">{principal.name}</Badge> },
      ]}
    >
      <DetailHero
        icon={principal.type === 'oidc' ? Link2 : Shield}
        title={principal.name}
        badges={principal.active
          ? <Badge dot>Active</Badge>
          : <Badge variant="muted" dot>Inactive</Badge>}
        idLabel="Principal ID"
        id={principal.id}
        meta={
          <Badge variant="secondary">
            {PRINCIPAL_TYPE_LABEL[principal.type] ?? principal.type}
          </Badge>
        }
        description={principal.description}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => router.push(`/authz/principals/edit?principal_id=${principal.id}`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <DetailHeroActionsMenu ariaLabel="Principal actions">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete Principal
              </DropdownMenuItem>
            </DetailHeroActionsMenu>
          </>
        }
        stats={
          <>
            <DetailHeroStat label="Assigned policies">
              {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
            </DetailHeroStat>
            <DetailHeroStat label="Created">
              <DateDisplay date={principal.created_at} className="text-sm" highlightExpired={false} />
            </DetailHeroStat>
            <DetailHeroStat label="Last updated">
              <DateDisplay date={principal.updated_at} className="text-sm" highlightExpired={false} />
            </DetailHeroStat>
          </>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="information" className="w-full">
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
            <TabsTrigger value="information" className={pageTabsTriggerClass}>
              <Info className="h-4 w-4" />
              Information
            </TabsTrigger>
            <TabsTrigger value="raw" className={pageTabsTriggerClass}>
              <FileJson className="h-4 w-4" />
              Raw JSON
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="information" className="mt-0">
          {renderAuthentication()}
          {renderSubjectAttributes()}
          <Separator />
          {renderPolicies()}
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
            setSelectedPolicies([]);
            setPolicyResults([]);
          }
        }}
      >
        <ResizableSheetContent
          storageKey="assign-policy"
          side="right"
          className="flex flex-col gap-0 p-0 data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-none"
        >
          <SheetHeader className="border-b px-6 py-5 shrink-0 text-left">
            <SheetTitle>Assign Policies</SheetTitle>
            <SheetDescription>Select one or more policies to grant to this principal.</SheetDescription>
          </SheetHeader>

          <div className="border-b px-6 py-4 shrink-0">
            <PolicyFilterBar
              searchTerm={policySearchTerm}
              onSearchTermChange={(value) => {
                setPolicySearchTerm(value);
              }}
              idFilter={policyIdFilter}
              onIdFilterChange={(value) => {
                setPolicyIdFilter(value);
              }}
              descriptionFilter={policyDescriptionFilter}
              onDescriptionFilterChange={(value) => {
                setPolicyDescriptionFilter(value);
              }}
              createdAtFilter={policyCreatedAtFilter}
              onCreatedAtFilterChange={(value) => {
                setPolicyCreatedAtFilter(value);
              }}
              updatedAtFilter={policyUpdatedAtFilter}
              onUpdatedAtFilterChange={(value) => {
                setPolicyUpdatedAtFilter(value);
              }}
              disabled={policyResultsLoading || isAssigning}
            />
          </div>

          <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden px-6 py-4">
            {policyResultsLoading && policyResults.length === 0 ? (
              <TableSkeleton label="Loading policies…" icon={false} columns={4} rows={4} pagination={false} />
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
                      <TableHead className="w-10"><span className="sr-only">Selected</span></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policyResults.map((policy) => {
                      const isSelected = selectedPolicyIds.has(policy.id);

                      return (
                        <TableRow
                          key={policy.id}
                          data-state={isSelected ? 'selected' : undefined}
                          className={cn('cursor-pointer', isSelected && 'bg-primary/5 data-[state=selected]:bg-primary/5')}
                          onClick={() => togglePolicySelection(policy)}
                        >
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => togglePolicySelection(policy)}
                              aria-label={`Select ${policy.name}`}
                              disabled={isAssigning}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className={cn('truncate', isSelected && 'text-primary')}>{policy.name}</div>
                            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{policy.id}</p>
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
            <div className="mr-auto min-w-0 space-y-2">
              {selectedPolicies.length > 0 ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{selectedPolicies.length} selected:</span>
                  {selectedPolicies.map((policy) => (
                    <Badge key={policy.id} variant="secondary" className="max-w-[14rem]">
                      <span className="truncate">{policy.name}</span>
                      <button
                        type="button"
                        onClick={() => togglePolicySelection(policy)}
                        disabled={isAssigning}
                        aria-label={`Remove ${policy.name} from the selection`}
                        className="-mr-1 rounded-sm opacity-60 hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No policies selected.</p>
              )}
              {selectedPolicyNeedsClientId && (
                <Alert className="max-w-md py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    A selected WFX SBI policy requires subject attribute client_id for job route constraints.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <div className="flex shrink-0 gap-2 justify-end">
              <Button variant="secondary" onClick={() => setGrantDrawerOpen(false)} disabled={isAssigning}>
                Cancel
              </Button>
              <Button onClick={handleAssignPolicies} disabled={selectedPolicies.length === 0 || isAssigning}>
                {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedPolicies.length > 1 ? `Assign ${selectedPolicies.length} Policies` : 'Assign Policy'}
              </Button>
            </div>
          </SheetFooter>
        </ResizableSheetContent>
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
    </BreadcrumbPage>
  );
}

export default function PrincipalDetailsPage() {
  return (
    <Suspense
      fallback={<DetailPageSkeleton label="Loading principal…" tabs={3} />}
    >
      <PrincipalDetailsContent />
    </Suspense>
  );
}
