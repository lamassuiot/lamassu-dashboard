'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, FileText, Users, TestTube, Eye, Download, Upload, RefreshCw, AlertCircle, Key, User, Fingerprint } from 'lucide-react';
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
import { PrincipalsTable } from './components/PrincipalsTable';
import { AddPrincipalDialog } from './components/AddPrincipalDialog';
import { PrincipalPoliciesDialog } from './components/PrincipalPoliciesDialog';

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
  listResources,
  getFilter,
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
  GroupedPolicy,
  ListResourcesRequest,
  GetFilterRequest,
  HierarchyType,
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
  const [groupedPolicies, setGroupedPolicies] = useState<GroupedPolicy[]>([]);
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
      
      // Fetch details for each policy using new format
      const allGroupedPolicies: GroupedPolicy[] = [];
      const allMemberships: PrincipalMembershipResponse[] = [];
      
      await Promise.all(
        ids.map(async (policyId) => {
          try {
            const policyDetails = await getPolicy(policyId, token);
            allGroupedPolicies.push({
              policy_id: policyDetails.policy_id,
              rules: policyDetails.rules,
              principals: policyDetails.principals,
              rule_count: policyDetails.count,
            });
          } catch {
            // Skip policies that fail to load
          }
        })
      );
      
      // Convert new format to legacy for backwards compatibility where needed
      const allPolicies: PolicyWithMetaResponse[] = allGroupedPolicies.flatMap((gp) =>
        gp.rules.map((rule) => ({
          policy_id: gp.policy_id,
          subject: rule.sub,
          object: rule.obj,
          action: rule.act,
          hierarchy: rule.eft as HierarchyType,
        }))
      );
      
      setPolicies(allPolicies);
      setMemberships(allMemberships);
      setResourceHierarchy([]);
      setPrincipals(principalsResponse.principals || []);
      setGroupedPolicies(allGroupedPolicies);
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

  const handleDeletePolicy = async (policyId: string) => {
    setIsDeletingPolicy(true);
    try {
      await deletePolicy(policyId, token);
      toast({
        title: 'Policy deleted',
        description: `Policy ${policyId} deleted successfully`,
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

  const handleListResources = async (request: ListResourcesRequest) => {
    return await listResources(request, token);
  };

  const handleGetFilter = async (request: GetFilterRequest) => {
    return await getFilter(request, token);
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
          {/* System Status Banner */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Authorization System Status
                  </CardTitle>
                  <CardDescription>
                    ReBAC policy engine managing access control for Lamassu PKI resources
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchPolicies(true)} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Policy Sets</p>
                    <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-12" /> : groupedPolicies.length}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-500/10 p-2">
                    <Shield className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Access Rules</p>
                    <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-12" /> : policies.length}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-500/10 p-2">
                    <Key className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Principals</p>
                    <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-12" /> : principals.length}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-orange-500/10 p-2">
                    <Users className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Memberships</p>
                    <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-12" /> : memberships.length}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Policy Sets Overview */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Policy Sets Overview
                </CardTitle>
                <CardDescription>
                  Active policy sets with assigned principals
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    ))}
                  </div>
                ) : groupedPolicies.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No policy sets configured</p>
                    <p className="text-sm">Create a policy to get started</p>
                    <Button className="mt-4" onClick={() => setAddPolicyOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Policy
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {groupedPolicies.map((policy) => (
                      <div
                        key={policy.policy_id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-medium truncate">{policy.policy_id}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {policy.rule_count} {policy.rule_count === 1 ? 'rule' : 'rules'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {policy.principals.length} {policy.principals.length === 1 ? 'principal' : 'principals'}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab('policies')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Access Control Analysis
                </CardTitle>
                <CardDescription>
                  Breakdown of permissions and hierarchy settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  renderLoadingSkeleton()
                ) : policies.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No policies to analyze</p>
                ) : (
                  <>
                    {/* Actions Distribution */}
                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Badge variant="outline" className="h-5 w-5 rounded-full p-0 items-center justify-center">1</Badge>
                        Permissions by Action
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(
                          policies.reduce((acc, p) => {
                            acc[p.action] = (acc[p.action] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        )
                          .sort(([, a], [, b]) => b - a)
                          .map(([action, count]) => (
                            <div key={action} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                <Badge variant="outline" className="font-mono">{action}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-2 bg-primary/20 rounded-full overflow-hidden" style={{ width: '60px' }}>
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${(count / policies.length) * 100}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium w-8 text-right">{count}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Hierarchy Settings */}
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Badge variant="outline" className="h-5 w-5 rounded-full p-0 items-center justify-center">2</Badge>
                        Hierarchy Configuration
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 border rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Children Inheritance</p>
                          <p className="text-xl font-bold">
                            {policies.filter(p => p.hierarchy === 'children').length}
                          </p>
                          <Badge variant="default" className="mt-1 text-xs">Cascading</Badge>
                        </div>
                        <div className="p-3 border rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Direct Access Only</p>
                          <p className="text-xl font-bold">
                            {policies.filter(p => p.hierarchy === 'none').length}
                          </p>
                          <Badge variant="secondary" className="mt-1 text-xs">Explicit</Badge>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Access Check Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Access Check
              </CardTitle>
              <CardDescription>
                Quickly test if a principal has access to a resource
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccessCheckPanel onCheckAccess={handleCheckAccess} />
            </CardContent>
          </Card>
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
                  groupedPolicies={groupedPolicies}
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
                Test authorization checks, list accessible resources, and generate SQL filters
              </p>
            </div>
          </div>

          <AccessCheckPanel
            onCheckAccess={handleCheckAccess}
            onListResources={handleListResources}
            onGetFilter={handleGetFilter}
          />
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
