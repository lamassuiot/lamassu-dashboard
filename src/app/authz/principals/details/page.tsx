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
  CheckCircle,
  XCircle,
  Plus,
  Shield,
  Calendar,
  Key,
  Link2,
  MoreVertical,
  Copy,
  Check,
  FileJson,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { getPrincipal, getPrincipalPolicies, grantPolicy, revokePolicy, listPolicies, getPolicy } from '@/lib/authz-api';
import { normalizeX509AuthConfig } from '@/lib/x509-auth-config';
import type { Principal, Policy } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';

function PrincipalDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const principalId = searchParams.get('principalId');

  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [enrichedPolicies, setEnrichedPolicies] = useState<Array<{ grantedPolicy: any; fullPolicy: Policy | null }>>([]);
  const [allPolicies, setAllPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [policySearchQuery, setPolicySearchQuery] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [assigningPolicyId, setAssigningPolicyId] = useState<string | null>(null);
  const [selectedPolicyToRevoke, setSelectedPolicyToRevoke] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [jsonExpanded, setJsonExpanded] = useState(true);
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (principalId) {
      loadPrincipalDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principalId]);

  const loadPrincipalDetails = async () => {
    if (!principalId) return;
    try {
      setLoading(true);
      const [principalData, policiesData, allPoliciesData] = await Promise.all([
        getPrincipal(principalId),
        getPrincipalPolicies(principalId).catch(() => ({ policies: [] })),
        listPolicies().catch(() => ({ policies: [], count: 0 })),
      ]);
      setPrincipal(principalData);
      setPolicies(policiesData.policies || []);
      setAllPolicies(allPoliciesData.policies || []);

      const assignedPolicies = policiesData.policies || [];
      if (assignedPolicies.length > 0) {
        const enriched = await Promise.all(
          assignedPolicies.map(async (grantedPolicy) => {
            try {
              const fullPolicy = await getPolicy(grantedPolicy.policyId);
              return { grantedPolicy, fullPolicy };
            } catch (err) {
              console.error(`Failed to fetch policy ${grantedPolicy.policyId}:`, err);
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
      setGrantDialogOpen(false);
      setPolicySearchQuery('');
      setSelectedPolicyId('');
      loadPrincipalDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to grant policy');
    } finally {
      setAssigningPolicyId(null);
    }
  };

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

  const getAvailablePolicies = () => {
    const assignedPolicyIds = policies.map(p => p.policyId);
    return allPolicies.filter(p => !assignedPolicyIds.includes(p.id));
  };

  const getFilteredPolicies = () => {
    const availablePolicies = getAvailablePolicies();
    const query = policySearchQuery.trim().toLowerCase();
    if (!query) return availablePolicies;
    return availablePolicies.filter((policy) =>
      policy.name.toLowerCase().includes(query) ||
      policy.id.toLowerCase().includes(query) ||
      (policy.description || '').toLowerCase().includes(query)
    );
  };

  const selectedPolicy = getAvailablePolicies().find((policy) => policy.id === selectedPolicyId) || null;

  const togglePolicyJson = (policyId: string) => {
    setExpandedPolicies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(policyId)) {
        newSet.delete(policyId);
      } else {
        newSet.add(policyId);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const getPrincipalTypeIcon = (type: string) => {
    switch (type) {
      case 'api_key':
        return <Key className="h-5 w-5" />;
      case 'oidc':
        return <Link2 className="h-5 w-5" />;
      case 'x509':
        return <Shield className="h-5 w-5" />;
      default:
        return <Shield className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Principals
        </Button>
      </div>
    );
  }

  const renderAuthConfig = () => {
    if (!principal) return null;
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
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {claim.claim}
                      </code>
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
            <div className="pb-4 first:pt-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                CA Identity Type
              </p>
              <Badge variant="secondary" className="font-mono text-xs">
                {String(x509Config.ca_trust.identity_type).replace(/_/g, ' ')}
              </Badge>
            </div>
          )}
          {x509Config.ca_trust?.value && (
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                CA Trust Value
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto break-all font-mono">
                {x509Config.ca_trust.value}
              </code>
            </div>
          )}
          {x509Config.match_mode && (
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Match Mode
              </p>
              <Badge variant="secondary" className="font-mono text-xs">
                {String(x509Config.match_mode).replace(/_/g, ' ')}
              </Badge>
            </div>
          )}
          {x509Config.serial_number && (
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                Serial Number
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto font-mono">
                {x509Config.serial_number}
              </code>
            </div>
          )}
          {x509Config.subject_cn && (
            <div className="py-4 first:pt-0 last:pb-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                Subject CN
              </p>
              <p className="text-sm font-mono">{x509Config.subject_cn}</p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm">No authentication configuration available</p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
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
                onClick={() => router.push('/authz/principals')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                  {getPrincipalTypeIcon(principal.type)}
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight truncate">{principal.name}</h1>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <Badge variant="secondary" className="font-mono text-xs uppercase">
                      {principal.type.replace('_', ' ')}
                    </Badge>
                    {principal.active ? (
                      <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                        <CheckCircle className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded border font-mono text-muted-foreground">
                      {principal.id}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(principal.id)}
                    >
                      {copiedId ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  {principal.description && (
                    <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{principal.description}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/authz/principals/edit?principalId=${principal.id}`)}
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
                    onClick={() => router.push(`/authz/principals/edit?principalId=${principal.id}`)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Principal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Principal
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
              value="policies"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none gap-2 data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Shield className="h-4 w-4" />
              Policies
              {policies.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {policies.length}
                </Badge>
              )}
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
          <div className="grid gap-5 md:grid-cols-2">
            {/* Authentication Card */}
            <Card className="overflow-hidden rounded-xl shadow-sm">
              <CardHeader className="border-b py-4">
                <CardTitle className="flex items-center text-lg">
                  <Shield className="mr-3 h-5 w-5 text-primary" />
                  Authentication
                </CardTitle>
                <CardDescription>How this principal authenticates</CardDescription>
              </CardHeader>
              <CardContent className="p-6">{renderAuthConfig()}</CardContent>
            </Card>

            {/* Metadata Card */}
            <Card className="overflow-hidden rounded-xl shadow-sm">
              <CardHeader className="border-b py-4">
                <CardTitle className="flex items-center text-lg">
                  <Calendar className="mr-3 h-5 w-5 text-primary" />
                  Metadata
                </CardTitle>
                <CardDescription>Timestamps and system information</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="divide-y">
                  <div className="pb-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                      Created
                    </p>
                    <DateDisplay
                      date={principal.createdAt}
                      formatString="MMM dd, yyyy"
                      className="text-sm"
                      highlightExpired={false}
                    />
                  </div>
                  <div className="py-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                      Last Updated
                    </p>
                    <DateDisplay
                      date={principal.updatedAt}
                      formatString="MMM dd, yyyy"
                      className="text-sm"
                      highlightExpired={false}
                    />
                  </div>
                  <div className="py-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                      Assigned Policies
                    </p>
                    <p className="text-sm font-medium">
                      {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
                    </p>
                  </div>
                  <div className="pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                      Principal ID
                    </p>
                    <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto font-mono break-all">
                      {principal.id}
                    </code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies">
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-lg">
                    <Shield className="mr-3 h-5 w-5 text-primary" />
                    Policy Assignments
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {policies.length === 0
                      ? 'No policies assigned yet'
                      : `${policies.length} ${policies.length === 1 ? 'policy' : 'policies'} assigned`}
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setGrantDialogOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Assign Policy
                </Button>
              </div>
            </CardHeader>

            {policies.length === 0 ? (
              <CardContent className="p-12">
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Shield className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">No policies assigned</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Assign a policy to grant permissions to this principal
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setGrantDialogOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Assign First Policy
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy</TableHead>
                      <TableHead>Granted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrichedPolicies.map(({ grantedPolicy, fullPolicy }) => {
                      const isExpanded = expandedPolicies.has(grantedPolicy.policyId);
                      return (
                        <TableRow key={grantedPolicy.policyId}>
                          <TableCell colSpan={3}>
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-1">
                                  <button
                                    onClick={() =>
                                      router.push(
                                        `/authz/policies/details?policyId=${grantedPolicy.policyId}`
                                      )
                                    }
                                    className="font-medium hover:underline text-left"
                                  >
                                    {fullPolicy?.name || grantedPolicy.policyName}
                                  </button>
                                  {fullPolicy?.description && (
                                    <p className="text-sm text-muted-foreground">
                                      {fullPolicy.description}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {grantedPolicy.policyId}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <DateDisplay
                                    date={grantedPolicy.grantedAt}
                                    formatString="MMM dd, yyyy"
                                    className="text-sm"
                                    highlightExpired={false}
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => togglePolicyJson(grantedPolicy.policyId)}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      router.push(
                                        `/authz/policies/details?policyId=${grantedPolicy.policyId}`
                                      )
                                    }
                                  >
                                    View
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setSelectedPolicyToRevoke(grantedPolicy);
                                      setRevokeDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>

                              {isExpanded && fullPolicy && (
                                <div className="mt-2 pt-3 border-t">
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
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* Raw JSON Tab */}
        <TabsContent value="raw">
          <Card className="overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-lg">
                    <FileJson className="mr-3 h-5 w-5 text-primary" />
                    Complete Principal Definition
                  </CardTitle>
                  <CardDescription>Raw JSON representation of this principal</CardDescription>
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
                  {JSON.stringify(principal, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        </TabsContent>
        </div>
      </Tabs>

      {/* Grant Policy Dialog */}
      <Dialog
        open={grantDialogOpen}
        onOpenChange={(isOpen) => {
          setGrantDialogOpen(isOpen);
          if (!isOpen) {
            setPolicySearchQuery('');
            setSelectedPolicyId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Policy</DialogTitle>
            <DialogDescription>Select a policy and confirm assignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="policy-search">Search policies</Label>
              <Input
                id="policy-search"
                placeholder="Filter by policy name, ID, or description..."
                value={policySearchQuery}
                onChange={(e) => setPolicySearchQuery(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Select one policy from the list, then click Assign Policy.
              </p>
            </div>

            {getAvailablePolicies().length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground text-center">
                All policies are already assigned
              </div>
            ) : getFilteredPolicies().length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground text-center">
                No matching policies
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {getFilteredPolicies().map((policy) => (
                  <button
                    key={policy.id}
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground ${selectedPolicy?.id === policy.id ? 'border-primary bg-accent/40' : ''}`}
                    onClick={() => setSelectedPolicyId(policy.id)}
                    disabled={!!assigningPolicyId || submitting}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{policy.name}</p>
                        <p className="mt-0.5 text-xs font-mono text-muted-foreground truncate">{policy.id}</p>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {policy.description || 'No description provided'}
                        </p>
                      </div>
                      {assigningPolicyId === policy.id ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGrantDialogOpen(false);
                setPolicySearchQuery('');
                setSelectedPolicyId('');
              }}
              disabled={!!assigningPolicyId || submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedPolicy && handleAssignPolicy(selectedPolicy.id)}
              disabled={!selectedPolicy || !!assigningPolicyId || submitting}
            >
              {assigningPolicyId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Policy Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the policy &quot;{selectedPolicyToRevoke?.policyName}&quot; from
              this principal? This action cannot be undone.
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
    </div>
  );
}

export default function PrincipalDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PrincipalDetailsContent />
    </Suspense>
  );
}
