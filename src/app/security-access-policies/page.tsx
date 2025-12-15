'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, FileText, Users, TestTube, Trash2, Download, Upload, RefreshCw, AlertCircle, Key, User, Fingerprint } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import RelationshipsFlowDiagram from '@/components/shared/RelationshipsFlowDiagram';

import { PoliciesTable } from './components/PoliciesTable';
import { MembershipsTable } from './components/MembershipsTable';
import { AddPolicyDialog } from './components/AddPolicyDialog';
import { AddMembershipDialog } from './components/AddMembershipDialog';
import { AccessCheckPanel } from './components/AccessCheckPanel';
import { AdvancedTestingComponent } from './components/AdvancedTestingComponent';
import { PrincipalsTable } from './components/PrincipalsTable';
import { AddPrincipalDialog } from './components/AddPrincipalDialog';
import { PrincipalPoliciesDialog } from './components/PrincipalPoliciesDialog';
import { AuthTestPanel } from './components/AuthTestPanel';

import {
  listPolicyIDs,
  getPolicy,
  createPolicy,
  deletePolicy,
  addMembership,
  deleteMembership,
  checkAccess,
  bulkLoadPolicies,
  clearAllPolicies,
  listPrincipals,
  createPrincipal,
  updatePrincipal,
  deletePrincipal,
  listPrincipalPolicies,
  assignPolicyToPrincipal,
  removePolicyFromPrincipal,
  checkAccessWithAuth,
  resolvePrincipal,
} from '@/lib/authz-api';

import type {
  PrincipalMembershipResponse,
  ResourceHierarchyResponse,
  AddPolicyWithMetaRequest,
  AddMembershipWithMetaRequest,
  CheckAccessRequest,
  PrincipalDefinition,
  CreatePrincipalRequest,
  Policy,
  CheckAccessWithAuthRequest,
  ResolvePrincipalRequest,
  PolicyWithMetaResponse,
} from '@/types/authorization';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SecurityAccessPoliciesPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [policies, setPolicies] = useState<PolicyWithMetaResponse[]>([]);
  const [policyIds, setPolicyIds] = useState<string[]>([]);
  const [memberships, setMemberships] = useState<PrincipalMembershipResponse[]>([]);
  const [resourceHierarchy, setResourceHierarchy] = useState<ResourceHierarchyResponse[]>([]);
  const [principals, setPrincipals] = useState<PrincipalDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [addPrincipalOpen, setAddPrincipalOpen] = useState(false);
  const [principalPoliciesOpen, setPrincipalPoliciesOpen] = useState(false);
  const [selectedPrincipal, setSelectedPrincipal] = useState<PrincipalDefinition | null>(null);
  const [selectedPrincipalPolicies, setSelectedPrincipalPolicies] = useState<string[]>([]);
  const [isAddingPolicy, setIsAddingPolicy] = useState(false);
  const [isAddingMembership, setIsAddingMembership] = useState(false);
  const [isAddingPrincipal, setIsAddingPrincipal] = useState(false);
  const [isDeletingPolicy, setIsDeletingPolicy] = useState(false);
  const [isDeletingMembership, setIsDeletingMembership] = useState(false);
  const [isDeletingPrincipal, setIsDeletingPrincipal] = useState(false);

  // Clear all confirmation dialog
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();
  const token = user?.access_token;

  const fetchPolicies = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [policyIdsResponse, principalsResponse] = await Promise.all([
        listPolicyIDs(token),
        listPrincipals(undefined, token).catch(() => ({ principals: [] })),
      ]);
      
      const ids = policyIdsResponse.policy_ids || [];
      setPolicyIds(ids);
      
      // Fetch details for each policy
      const allPolicies: PolicyWithMetaResponse[] = [];
      const allMemberships: PrincipalMembershipResponse[] = [];
      
      await Promise.all(
        ids.map(async (policyId) => {
          try {
            const policyDetails = await getPolicy(policyId, token);
            allPolicies.push(...(policyDetails.policies || []));
          } catch {
            // Skip policies that fail to load
          }
        })
      );
      
      setPolicies(allPolicies);
      setMemberships(allMemberships);
      setResourceHierarchy([]);
      setPrincipals(principalsResponse.principals || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load policies';
      setError(message);
      toast({
        title: 'Error loading policies',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const handleAddPolicy = async (policy: AddPolicyWithMetaRequest) => {
    setIsAddingPolicy(true);
    try {
      await createPolicy(policy, token);
      toast({
        title: 'Policy added',
        description: `Policy for ${policy.subject} added successfully`,
      });
      setAddPolicyOpen(false);
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add policy';
      toast({
        title: 'Error adding policy',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsAddingPolicy(false);
    }
  };

  const handleDeletePolicy = async (policy: PolicyWithMetaResponse) => {
    setIsDeletingPolicy(true);
    try {
      await deletePolicy(policy.policy_id, token);
      toast({
        title: 'Policy deleted',
        description: `Policy for ${policy.subject} deleted successfully`,
      });
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete policy';
      toast({
        title: 'Error deleting policy',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingPolicy(false);
    }
  };

  const handleAddMembership = async (membership: AddMembershipWithMetaRequest) => {
    setIsAddingMembership(true);
    try {
      await addMembership(membership, token);
      toast({
        title: 'Membership added',
        description: `${membership.principal} added to ${membership.scope}`,
      });
      setAddMembershipOpen(false);
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add membership';
      toast({
        title: 'Error adding membership',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsAddingMembership(false);
    }
  };

  const handleDeleteMembership = async (membership: PrincipalMembershipResponse) => {
    setIsDeletingMembership(true);
    try {
      await deleteMembership(membership, token);
      toast({
        title: 'Membership deleted',
        description: `${membership.principal} removed from ${membership.scope}`,
      });
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete membership';
      toast({
        title: 'Error deleting membership',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingMembership(false);
    }
  };

  const handleCheckAccess = async (request: CheckAccessRequest) => {
    return await checkAccess(request, token);
  };

  // Principal management functions
  const handleAddPrincipal = async (request: CreatePrincipalRequest) => {
    setIsAddingPrincipal(true);
    try {
      await createPrincipal(request, token);
      toast({
        title: 'Principal added',
        description: `Principal ${request.name} created successfully`,
      });
      setAddPrincipalOpen(false);
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add principal';
      toast({
        title: 'Error adding principal',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsAddingPrincipal(false);
    }
  };

  const handleUpdatePrincipal = async (principal: PrincipalDefinition, enabled: boolean) => {
    try {
      await updatePrincipal(principal.name, { enabled }, token);

      toast({
        title: 'Principal updated',
        description: `Principal ${principal.name} ${enabled ? 'enabled' : 'disabled'}`,
      });
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update principal';
      toast({
        title: 'Error updating principal',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleDeletePrincipal = async (principal: PrincipalDefinition) => {
    setIsDeletingPrincipal(true);
    try {
      await deletePrincipal(principal.name, token);
      toast({
        title: 'Principal deleted',
        description: `Principal ${principal.name} deleted successfully`,
      });
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete principal';
      toast({
        title: 'Error deleting principal',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingPrincipal(false);
    }
  };

  const handleManagePrincipalPolicies = async (principal: PrincipalDefinition) => {
    setSelectedPrincipal(principal);
    try {
      const response = await listPrincipalPolicies(principal.id || principal.name, token);
      // response is ListDetailedPoliciesResponse - extract policy_ids from policies array
      setSelectedPrincipalPolicies(response.policies.map(p => p.policy_id));
      setPrincipalPoliciesOpen(true);
    } catch {
      toast({
        title: 'Error loading policies',
        description: 'Failed to load assigned policies',
        variant: 'destructive',
      });
    }
  };

  const handleAssignPolicyToPrincipal = async (principalName: string, policyName: string) => {
    await assignPolicyToPrincipal(principalName, { policy_id: policyName }, token);
    toast({
      title: 'Policy assigned',
      description: `Policy ${policyName} assigned to ${principalName}`,
    });
  };

  const handleRemovePolicyFromPrincipal = async (principalName: string, policyName: string) => {
    await removePolicyFromPrincipal(principalName, policyName, token);
    toast({
      title: 'Policy removed',
      description: `Policy ${policyName} removed from ${principalName}`,
    });
  };

  const handleCheckAccessWithAuth = async (request: CheckAccessWithAuthRequest) => {
    return await checkAccessWithAuth(request, token);
  };

  const handleResolvePrincipal = async (request: ResolvePrincipalRequest) => {
    return await resolvePrincipal(request, token);
  };

  // Convert PolicyResponse to Policy for the dialog
  const allPoliciesForAssignment: Policy[] = policies.map(p => ({
    name: `${p.subject}:${p.object}:${p.action}`,
    effect: 'allow',
    resources: [p.object],
    actions: [p.action],
    conditions: {},
  }));

  const handleExport = () => {
    // Generate CSV content from current policies and memberships
    let csvContent = '# Policies\n';
    policies.forEach(p => {
      csvContent += `p,${p.subject},${p.object},${p.action},${p.hierarchy}\n`;
    });
    csvContent += '# Memberships\n';
    memberships.forEach(m => {
      csvContent += `g,${m.principal},${m.scope}\n`;
    });

    // Download as file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'policies-export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Export complete',
      description: 'Policies and memberships exported to CSV',
    });
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const csvContent = event.target?.result as string;
        try {
          const result = await bulkLoadPolicies({ csv_content: csvContent }, token);
          toast({
            title: 'Import complete',
            description: `Loaded ${result.policies_loaded} policies and ${result.memberships_loaded} memberships`,
          });
          await fetchPolicies(true);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to import policies';
          toast({
            title: 'Import failed',
            description: message,
            variant: 'destructive',
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearAll = async () => {
    setIsClearingAll(true);
    try {
      await clearAllPolicies(token);
      toast({
        title: 'All policies cleared',
        description: 'All policies and memberships have been removed',
      });
      setClearAllOpen(false);
      await fetchPolicies(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear policies';
      toast({
        title: 'Error clearing policies',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsClearingAll(false);
    }
  };

  const renderLoadingSkeleton = () => (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">Failed to load policies</h3>
      <p className="text-muted-foreground mb-4">{error}</p>
      <Button onClick={() => fetchPolicies()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Try Again
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Security Access & Policies</h1>
            <p className="text-muted-foreground">
              Manage ReBAC policies and memberships for your PKI infrastructure
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPolicies(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="principals">Principals</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="memberships">Memberships</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="test">Test Access</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Principals</CardTitle>
                <Key className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{principals.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Identity definitions
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{policies.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Active access control policies
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memberships</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{memberships.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Principal-scope assignments
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hierarchical Policies</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {policies.filter(p => p.hierarchy === 'children').length}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Policies with child inheritance
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resource Hierarchy</CardTitle>
                <TestTube className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{resourceHierarchy.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Parent-child relationships
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common authorization management tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full justify-start" variant="outline" onClick={() => setAddPrincipalOpen(true)}>
                  <Key className="h-4 w-4 mr-2" />
                  Add New Principal
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => setAddPolicyOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Policy
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => setAddMembershipOpen(true)}>
                  <Users className="h-4 w-4 mr-2" />
                  Add Membership
                </Button>
                <Button className="w-full justify-start" variant="outline" onClick={() => setActiveTab('test')}>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Access Control
                </Button>
                <Button
                  className="w-full justify-start text-destructive"
                  variant="outline"
                  onClick={() => setClearAllOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Policies
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Policy Distribution</CardTitle>
                <CardDescription>Breakdown of policy types by action</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  renderLoadingSkeleton()
                ) : policies.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground">No policies configured</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(
                      policies.reduce((acc, p) => {
                        acc[p.action] = (acc[p.action] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([action, count]) => (
                      <div key={action} className="flex items-center justify-between">
                        <Badge variant="outline">{action}</Badge>
                        <span className="text-sm font-medium">{count} {count === 1 ? 'policy' : 'policies'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <AccessCheckPanel onCheckAccess={handleCheckAccess} />
        </TabsContent>

        <TabsContent value="principals" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Principal Definitions</h2>
              <p className="text-muted-foreground">
                Define identity matchers for OIDC, X.509, and API Key authentication
              </p>
            </div>
            <Button onClick={() => setAddPrincipalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Principal
            </Button>
          </div>

          {/* Principal type summary cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">OIDC/JWT</CardTitle>
                <User className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {principals.filter(p => p.type === 'oidc').length}
                </div>
                <p className="text-xs text-muted-foreground">OAuth/OpenID Connect identities</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">X.509 Certificates</CardTitle>
                <Fingerprint className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {principals.filter(p => p.type === 'x509').length}
                </div>
                <p className="text-xs text-muted-foreground">Certificate-based identities</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Keys</CardTitle>
                <Key className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {principals.filter(p => p.type === 'apikey').length}
                </div>
                <p className="text-xs text-muted-foreground">API key identities</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Principal Definitions</CardTitle>
              <CardDescription>
                Configure how authentication credentials are matched to principals
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                renderLoadingSkeleton()
              ) : error ? (
                renderError()
              ) : (
                <PrincipalsTable
                  principals={principals}
                  onDeletePrincipal={handleDeletePrincipal}
                  onToggleEnabled={handleUpdatePrincipal}
                  onManagePolicies={handleManagePrincipalPolicies}
                  isDeleting={isDeletingPrincipal}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Access Control Policies</h2>
              <p className="text-muted-foreground">
                Define what subjects can perform which actions on resources
              </p>
            </div>
            <Button onClick={() => setAddPolicyOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Policies</CardTitle>
              <CardDescription>
                ReBAC policies defining subject-action-object relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                renderLoadingSkeleton()
              ) : error ? (
                renderError()
              ) : (
                <PoliciesTable
                  policies={policies}
                  onDeletePolicy={handleDeletePolicy}
                  isDeleting={isDeletingPolicy}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memberships" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Principal Memberships</h2>
              <p className="text-muted-foreground">
                Assign principals to scopes to inherit permissions
              </p>
            </div>
            <Button onClick={() => setAddMembershipOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Membership
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Memberships</CardTitle>
              <CardDescription>
                Principal-to-scope assignments for permission inheritance
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                renderLoadingSkeleton()
              ) : error ? (
                renderError()
              ) : (
                <MembershipsTable
                  memberships={memberships}
                  onDeleteMembership={handleDeleteMembership}
                  isDeleting={isDeletingMembership}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relationships" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Entity Relationships</h2>
              <p className="text-muted-foreground">
                Visualize entity relationships and their access control permissions
              </p>
            </div>
          </div>

          <RelationshipsFlowDiagram />
        </TabsContent>

        <TabsContent value="test" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Test Access Control</h2>
              <p className="text-muted-foreground">
                Simulate access control decisions for principals and resources
              </p>
            </div>
          </div>

          <AccessCheckPanel onCheckAccess={handleCheckAccess} />

          <AuthTestPanel 
            onCheckAccessWithAuth={handleCheckAccessWithAuth}
            onResolvePrincipal={handleResolvePrincipal}
          />

          <AdvancedTestingComponent />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddPolicyDialog
        open={addPolicyOpen}
        onOpenChange={setAddPolicyOpen}
        onAddPolicy={handleAddPolicy}
        isLoading={isAddingPolicy}
      />

      <AddMembershipDialog
        open={addMembershipOpen}
        onOpenChange={setAddMembershipOpen}
        onAddMembership={handleAddMembership}
        isLoading={isAddingMembership}
      />

      <AddPrincipalDialog
        open={addPrincipalOpen}
        onOpenChange={setAddPrincipalOpen}
        onAddPrincipal={handleAddPrincipal}
        isLoading={isAddingPrincipal}
      />

      <PrincipalPoliciesDialog
        open={principalPoliciesOpen}
        onOpenChange={setPrincipalPoliciesOpen}
        principal={selectedPrincipal}
        assignedPolicies={selectedPrincipalPolicies}
        allPolicies={allPoliciesForAssignment}
        onAssignPolicy={handleAssignPolicyToPrincipal}
        onRemovePolicy={handleRemovePolicyFromPrincipal}
      />

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Policies?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete all policies and memberships. This cannot be undone.
              Consider exporting your current policies before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isClearingAll}
            >
              {isClearingAll ? 'Clearing...' : 'Clear All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
