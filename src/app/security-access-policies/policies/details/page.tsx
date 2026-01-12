'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Trash2, Users, FileText, AlertCircle, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getPolicy, deletePolicy, listPrincipals } from '@/lib/authz-api';
import type { NewPolicyResponse, PrincipalDefinition } from '@/types/authorization';
import RelationshipsFlowDiagram from '@/components/shared/RelationshipsFlowDiagram';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PolicyDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const token = user?.access_token;
  
  const policyId = searchParams.get('id');
  const [policy, setPolicy] = useState<NewPolicyResponse | null>(null);
  const [principals, setPrincipals] = useState<PrincipalDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationshipsDialogOpen, setRelationshipsDialogOpen] = useState(false);

  useEffect(() => {
    if (policyId) {
      fetchPolicyDetails();
    }
  }, [policyId, token]);

  const fetchPolicyDetails = async () => {
    if (!policyId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const [policyData, principalsData] = await Promise.all([
        getPolicy(decodeURIComponent(policyId), token),
        listPrincipals(undefined, token).catch(() => ({ principals: [] })),
      ]);
      
      setPolicy(policyData);
      setPrincipals(principalsData.principals || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load policy details';
      setError(message);
      toast({
        title: 'Error loading policy',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePolicy = async () => {
    if (!policyId) return;
    
    setIsDeleting(true);
    try {
      await deletePolicy(policyId, token);
      toast({
        title: 'Policy deleted',
        description: `Policy ${policy?.name || policyId} has been deleted successfully`,
      });
      router.push('/security-access-policies');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete policy';
      toast({
        title: 'Error deleting policy',
        description: message,
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  };

  const getPrincipalName = (principalId: string): string => {
    const principal = principals.find(p => (p.id || p.name) === principalId);
    return principal?.name || principalId;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/security-access-policies">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Policies
            </Link>
          </Button>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/security-access-policies">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Policies
            </Link>
          </Button>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Policy not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-4 flex-1">
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link href="/security-access-policies">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Policies
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{policy.name}</h1>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {policy.policy_id}
                </p>
              </div>
            </div>
            {policy.description && (
              <p className="text-muted-foreground text-base ml-15">{policy.description}</p>
            )}
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Policy?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the policy <strong>"{policy.name}"</strong>. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeletePolicy} className="bg-destructive text-destructive-foreground">
                Delete Policy
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Rules</p>
                <p className="text-3xl font-bold mt-1">{policy.count}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Assigned Principals</p>
                <p className="text-3xl font-bold mt-1">{policy.principals.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Policy Rules - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Policy Rules</CardTitle>
                  <CardDescription className="mt-1.5">
                    Access control rules defined in this policy
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="h-7">
                  {policy.count} {policy.count === 1 ? 'rule' : 'rules'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {policy.rules.map((rule, index) => (
                <div key={index} className="border rounded-lg p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Rule {index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRelationshipsDialogOpen(true)}
                        className="h-7 px-2"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View Relationships
                      </Button>
                      <Badge 
                        variant={rule.child_rules && Object.keys(rule.child_rules).length > 0 ? 'default' : 'secondary'}
                        className="font-semibold"
                      >
                        {rule.child_rules && Object.keys(rule.child_rules).length > 0 ? 'WITH CHILD RULES' : 'DIRECT ONLY'}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {rule.sub && (
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject</span>
                        <div className="font-mono text-xs bg-muted/50 p-2.5 rounded border mt-1.5">
                          {rule.sub}
                        </div>
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Object</span>
                      <div className="font-mono text-xs bg-muted/50 p-2.5 rounded border mt-1.5">
                        {rule.obj}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</span>
                      <div className="font-mono text-xs bg-muted/50 p-2.5 rounded border mt-1.5">
                        {rule.act}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Takes 1 column */}
        <div className="space-y-4">
          {/* Assigned Principals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assigned Principals</CardTitle>
              <CardDescription className="text-xs">
                {policy.principals.length === 0 
                  ? 'No principals assigned'
                  : `${policy.principals.length} ${policy.principals.length === 1 ? 'principal' : 'principals'}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {policy.principals.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <div className="h-12 w-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                    <Users className="h-6 w-6 opacity-50" />
                  </div>
                  <p className="text-sm">No principals assigned</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {policy.principals.map((principalId) => (
                    <div
                      key={principalId}
                      className="p-3 border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="font-medium text-sm">{getPrincipalName(principalId)}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {principalId}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Policy Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Policy ID
                </p>
                <p className="text-sm font-mono bg-muted/50 p-2 rounded border break-all">
                  {policy.policy_id}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Name
                </p>
                <p className="text-sm">{policy.name}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Description
                </p>
                <p className="text-sm text-muted-foreground">
                  {policy.description || 'No description provided'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Entity Relationships Dialog */}
      <Dialog open={relationshipsDialogOpen} onOpenChange={setRelationshipsDialogOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[85vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>Entity Relationships</DialogTitle>
            <DialogDescription>
              Visualize entity relationships and their access control permissions
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 h-[calc(85vh-100px)] overflow-hidden">
            <div className="h-full border rounded-lg overflow-hidden bg-background">
              <RelationshipsFlowDiagram />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
