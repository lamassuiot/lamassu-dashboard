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
  ChevronUp
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { Separator } from '@/components/ui/separator';
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
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [policyAutocompleteOpen, setPolicyAutocompleteOpen] = useState(false);
  const [policySearchQuery, setPolicySearchQuery] = useState('');
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
      
      // Fetch full policy details for each assigned policy
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

  const handleGrantPolicy = async () => {
    if (!principalId || !selectedPolicyId) return;
    try {
      setSubmitting(true);
      await grantPolicy(principalId, selectedPolicyId);
      setGrantDialogOpen(false);
      setSelectedPolicyId('');
      setPolicySearchQuery('');
      setPolicyAutocompleteOpen(false);
      loadPrincipalDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to grant policy');
    } finally {
      setSubmitting(false);
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
    if (!query) {
      return availablePolicies;
    }

    return availablePolicies.filter((policy) =>
      policy.name.toLowerCase().includes(query) ||
      policy.id.toLowerCase().includes(query) ||
      (policy.description || '').toLowerCase().includes(query)
    );
  };

  const selectedPolicy = allPolicies.find((policy) => policy.id === selectedPolicyId) || null;

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

    if (type === 'api_key') {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border">
            <Key className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">API Key Authentication</p>
              <p className="text-sm text-muted-foreground mt-1">
                Authenticates using a hashed API key for programmatic access
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">STATUS</p>
            <Badge variant="secondary" className="mt-1">
              <Check className="mr-1 h-3 w-3" />
              API Key Hash Configured
            </Badge>
          </div>
        </div>
      );
    }

    if (type === 'oidc') {
      const oidcConfig = authConfig as any;
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border">
            <Link2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">OpenID Connect (OIDC)</p>
              <p className="text-sm text-muted-foreground mt-1">
                Authenticates via OIDC provider claims
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">ISSUER</p>
            <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
              {String(oidcConfig.issuer)}
            </code>
          </div>

          {oidcConfig.claims && oidcConfig.claims.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">CLAIM CONDITIONS</p>
              <div className="space-y-2">
                {oidcConfig.claims.map((claim: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm border"
                  >
                    <Badge variant="outline" className="font-mono text-xs shrink-0">
                      {claim.claim}
                    </Badge>
                    <span className="text-muted-foreground shrink-0">{claim.operator}</span>
                    <code className="font-mono text-xs bg-background px-2 py-0.5 rounded flex-1 overflow-x-auto">
                      {claim.value}
                    </code>
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
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border">
            <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">X.509 Certificate (mTLS)</p>
              <p className="text-sm text-muted-foreground mt-1">
                Authenticates using client certificates for secure device/service authentication
              </p>
            </div>
          </div>

          {x509Config.ca_trust?.identity_type && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">CA IDENTITY TYPE</p>
              <Badge variant="outline" className="mt-1">
                {String(x509Config.ca_trust.identity_type).replace(/_/g, ' ')}
              </Badge>
            </div>
          )}

          {x509Config.ca_trust?.value && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">CA TRUST VALUE</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto break-all">
                {x509Config.ca_trust.value}
              </code>
            </div>
          )}

          {x509Config.match_mode && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">MATCH MODE</p>
              <Badge variant="outline" className="mt-1">{String(x509Config.match_mode).replace(/_/g, ' ')}</Badge>
            </div>
          )}

          {x509Config.serial_number && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">SERIAL NUMBER</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
                {x509Config.serial_number}
              </code>
            </div>
          )}

          {x509Config.subject_cn && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">SUBJECT CN</p>
              <p className="text-sm font-medium">{x509Config.subject_cn}</p>
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
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/authz/principals')}
            className="mt-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                {getPrincipalTypeIcon(principal.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold truncate">{principal.name}</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-mono text-xs">
                {principal.type.toUpperCase()}
              </Badge>
              {principal.active ? (
                <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
                  <CheckCircle className="h-3 w-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 bg-gray-50 text-gray-600 border-gray-200">
                  <XCircle className="h-3 w-3" />
                  Inactive
                </Badge>
              )}
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Created {new Date(principal.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded border">
                {principal.id}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(principal.id)}
                className="h-7 px-2"
              >
                {copiedId ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {principal.description && (
              <p className="mt-3 text-sm text-muted-foreground max-w-2xl">{principal.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/authz/principals/edit?principalId=${principal.id}`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/authz/principals/edit?principalId=${principal.id}`)}>
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

      <Separator />

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="policies">
            Policies
            {policies.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {policies.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Authentication Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Authentication Configuration
                </CardTitle>
                <CardDescription>
                  How this principal authenticates
                </CardDescription>
              </CardHeader>
              <CardContent>{renderAuthConfig()}</CardContent>
            </Card>

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Metadata
                </CardTitle>
                <CardDescription>
                  Timestamps and system information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">CREATED</p>
                  <DateDisplay 
                    date={principal.createdAt} 
                    formatString="MMM dd, yyyy"
                    className="text-sm"
                    highlightExpired={false}
                  />
                </div>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">LAST UPDATED</p>
                  <DateDisplay 
                    date={principal.updatedAt} 
                    formatString="MMM dd, yyyy"
                    className="text-sm"
                    highlightExpired={false}
                  />
                </div>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">DESCRIPTION</p>
                  {principal.description ? (
                    <p className="text-sm text-muted-foreground break-words">{principal.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No description provided</p>
                  )}
                </div>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">PRINCIPAL ID</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 overflow-x-auto">
                      {principal.id}
                    </code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <p className="text-2xl font-bold mt-1">
                      {principal.active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  {principal.active ? (
                    <CheckCircle className="h-10 w-10 text-green-600" />
                  ) : (
                    <XCircle className="h-10 w-10 text-gray-400" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Assigned Policies</p>
                    <p className="text-2xl font-bold mt-1">{policies.length}</p>
                  </div>
                  <Shield className="h-10 w-10 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Auth Type</p>
                    <p className="text-2xl font-bold mt-1">{principal.type.toUpperCase()}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {getPrincipalTypeIcon(principal.type)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Policy Assignments</h3>
              <p className="text-sm text-muted-foreground">
                Manage policies assigned to this principal
              </p>
            </div>
            <Button onClick={() => setGrantDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Assign Policy
            </Button>
          </div>

          {policies.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="p-3 rounded-full bg-muted">
                      <Shield className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">No policies assigned</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Assign a policy to grant permissions to this principal
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setGrantDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Assign First Policy
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
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
                                  onClick={() => router.push(`/authz/policies/details?policyId=${grantedPolicy.policyId}`)}
                                  className="font-medium hover:underline text-left"
                                >
                                  {fullPolicy?.name || grantedPolicy.policyName}
                                </button>
                                {fullPolicy?.description && (
                                  <p className="text-sm text-muted-foreground">{fullPolicy.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground font-mono">{grantedPolicy.policyId}</p>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <DateDisplay 
                                  date={grantedPolicy.grantedAt} 
                                  formatString="MMM dd, yyyy"
                                  className="text-sm"
                                  highlightExpired={false}
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
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
                                  onClick={() => router.push(`/authz/policies/details?policyId=${grantedPolicy.policyId}`)}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Raw JSON Tab */}
        <TabsContent value="raw">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileJson className="h-5 w-5" />
                    Complete Principal Definition
                  </CardTitle>
                  <CardDescription>
                    Raw JSON representation of this principal
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setJsonExpanded(!jsonExpanded)}
                  className="flex items-center gap-2"
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
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px] text-xs">
                  {JSON.stringify(principal, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Grant Policy Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Policy</DialogTitle>
            <DialogDescription>
              Grant a policy to this principal
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="policy-autocomplete">Select Policy</Label>
              <Popover open={policyAutocompleteOpen} onOpenChange={setPolicyAutocompleteOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="policy-autocomplete"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={policyAutocompleteOpen}
                    className="w-full justify-between"
                    disabled={getAvailablePolicies().length === 0}
                  >
                    {selectedPolicy ? selectedPolicy.name : 'Search policy by name, ID, or description...'}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                  {getAvailablePolicies().length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      All policies are already assigned
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Type to filter policies..."
                        value={policySearchQuery}
                        onChange={(e) => setPolicySearchQuery(e.target.value)}
                        autoFocus
                      />
                      <div className="max-h-64 overflow-auto space-y-1">
                        {getFilteredPolicies().length === 0 ? (
                          <p className="px-2 py-3 text-sm text-muted-foreground text-center">No matching policies</p>
                        ) : (
                          getFilteredPolicies().map((policy) => (
                            <button
                              key={policy.id}
                              type="button"
                              className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setSelectedPolicyId(policy.id);
                                setPolicyAutocompleteOpen(false);
                              }}
                            >
                              <p className="text-sm font-medium">{policy.name}</p>
                              <p className="mt-0.5 text-xs font-mono text-muted-foreground">{policy.id}</p>
                              {policy.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{policy.description}</p>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGrantDialogOpen(false);
                setSelectedPolicyId('');
                setPolicySearchQuery('');
                setPolicyAutocompleteOpen(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGrantPolicy}
              disabled={submitting || !selectedPolicyId}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
              Are you sure you want to revoke the policy &quot;{selectedPolicyToRevoke?.policyName}&quot; from this principal?
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
