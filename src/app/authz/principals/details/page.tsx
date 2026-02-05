'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, AlertCircle, Edit, Trash2, CheckCircle, XCircle, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Label } from '@/components/ui/label';
import { getPrincipal, getPrincipalPolicies, grantPolicy, revokePolicy, listPolicies } from '@/lib/authz-api';
import type { Principal, Policy } from '@/types/authz';

function PrincipalDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const principalId = searchParams.get('principalId');

  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [allPolicies, setAllPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [selectedPolicyToRevoke, setSelectedPolicyToRevoke] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const { authConfig, type } = principal;

    if (type === 'api_key') {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            API Key authentication configuration
          </p>
          <Badge variant="secondary">API Key Hash Configured</Badge>
        </div>
      );
    }

    if (type === 'oidc' && 'issuer' in authConfig) {
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Issuer</p>
            <p className="text-sm text-muted-foreground font-mono">{authConfig.issuer}</p>
          </div>
          {authConfig.claims && authConfig.claims.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Claims</p>
              <div className="space-y-2">
                {authConfig.claims.map((claim, index) => (
                  <div key={index} className="text-sm border-l-2 pl-3">
                    <span className="font-mono">{claim.claim}</span>
                    <span className="text-muted-foreground"> {claim.operator} </span>
                    <span className="font-mono">&quot;{claim.value}&quot;</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (type === 'x509' && 'caFingerprint' in authConfig) {
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">CA Fingerprint</p>
            <p className="text-sm text-muted-foreground font-mono break-all">
              {authConfig.caFingerprint}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Match Mode</p>
            <Badge variant="outline">{authConfig.matchMode}</Badge>
          </div>
          {authConfig.serialNumber && (
            <div>
              <p className="text-sm font-medium">Serial Number</p>
              <p className="text-sm text-muted-foreground font-mono">{authConfig.serialNumber}</p>
            </div>
          )}
          {authConfig.subjectCn && (
            <div>
              <p className="text-sm font-medium">Subject CN</p>
              <p className="text-sm text-muted-foreground">{authConfig.subjectCn}</p>
            </div>
          )}
        </div>
      );
    }

    return <p className="text-sm text-muted-foreground">No authentication configuration</p>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/authz/principals')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{principal.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge>{principal.type}</Badge>
              {principal.active ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Inactive
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Configuration</CardTitle>
            <CardDescription>Principal authentication details</CardDescription>
          </CardHeader>
          <CardContent>{renderAuthConfig()}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>Principal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium">Principal ID</p>
              <p className="text-sm text-muted-foreground font-mono">{principal.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Created At</p>
              <p className="text-sm text-muted-foreground">
                {new Date(principal.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Updated At</p>
              <p className="text-sm text-muted-foreground">
                {new Date(principal.updatedAt).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Assigned Policies</CardTitle>
              <CardDescription>
                {policies.length} {policies.length === 1 ? 'policy' : 'policies'} assigned
              </CardDescription>
            </div>
            <Button onClick={() => setGrantDialogOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Assign Policy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {policies.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No policies assigned to this principal
            </p>
          ) : (
            <div className="space-y-2">
              {policies.map((policy, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{policy.policyName}</p>
                    <p className="text-sm text-muted-foreground">
                      Granted: {new Date(policy.grantedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/authz/policies/details?policyId=${policy.policyId}`)}
                    >
                      View Policy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedPolicyToRevoke(policy);
                        setRevokeDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Principal JSON</CardTitle>
          <CardDescription>Complete principal definition</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs">
            {JSON.stringify(principal, null, 2)}
          </pre>
        </CardContent>
      </Card>

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
              <Label htmlFor="policy">Select Policy</Label>
              <Select
                value={selectedPolicyId}
                onValueChange={setSelectedPolicyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a policy..." />
                </SelectTrigger>
                <SelectContent>
                  {getAvailablePolicies().length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      All policies are already assigned
                    </div>
                  ) : (
                    getAvailablePolicies().map((policy) => (
                      <SelectItem key={policy.id} value={policy.id}>
                        {policy.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGrantDialogOpen(false);
                setSelectedPolicyId('');
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
