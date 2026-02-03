'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getPolicy, getPolicyStats } from '@/lib/authz-api';
import type { Policy, PolicyStats } from '@/types/authz';

function PolicyDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policyId = searchParams.get('policyId');

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (policyId) {
      loadPolicyDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  const loadPolicyDetails = async () => {
    if (!policyId) return;
    try {
      setLoading(true);
      const [policyData, statsData] = await Promise.all([
        getPolicy(policyId),
        getPolicyStats(policyId).catch(() => null),
      ]);
      setPolicy(policyData);
      setStats(statsData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load policy details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Policy not found'}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push('/authz/policies')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Policies
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/authz/policies')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{policy.name}</h1>
            <p className="text-muted-foreground mt-1">{policy.description}</p>
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

      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.ruleCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Principals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.principalCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Last Modified</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                {stats.lastModified ? new Date(stats.lastModified).toLocaleString() : 'N/A'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Policy Rules</CardTitle>
          <CardDescription>
            {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'} defined
          </CardDescription>
        </CardHeader>
        <CardContent>
          {policy.rules.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No rules defined for this policy
            </p>
          ) : (
            <div className="space-y-4">
              {policy.rules.map((rule, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">Rule {index + 1}</Badge>
                    <Badge>{rule.entityType}</Badge>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      {rule.actions.map((action, actionIndex) => (
                        <Badge key={actionIndex} variant="secondary">
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {rule.directGrants && rule.directGrants.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Direct Grants</h4>
                      <div className="flex flex-wrap gap-2">
                        {rule.directGrants.map((grant, grantIndex) => (
                          <Badge key={grantIndex} variant="outline">
                            {grant}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {rule.relations && rule.relations.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Relations</h4>
                      <div className="space-y-2">
                        {rule.relations.map((relation, relIndex) => (
                          <div key={relIndex} className="text-sm border-l-2 pl-3">
                            <div className="font-mono text-xs">
                              {relation.to} via {relation.via}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {relation.actions.map((action, actionIndex) => (
                                <Badge key={actionIndex} variant="secondary" className="text-xs">
                                  {action}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy JSON</CardTitle>
          <CardDescription>Complete policy definition</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs">
            {JSON.stringify(policy, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PolicyDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PolicyDetailsContent />
    </Suspense>
  );
}
