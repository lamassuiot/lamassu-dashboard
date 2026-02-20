'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { getPolicy, updatePolicy } from '@/lib/authz-api';
import type { Rule } from '@/types/authz';
import { PolicyBuilder } from '@/components/authz/PolicyBuilder';
import { normalizePolicyRules, validatePolicyRelationWildcardRestrictions } from '@/lib/policy-format';

function EditPolicyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policyId = searchParams.get('policyId');

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    rules: [] as Rule[],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (policyId) {
      loadPolicy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  const loadPolicy = async () => {
    if (!policyId) return;
    try {
      setLoading(true);
      const policy = await getPolicy(policyId);
      setFormData({
        id: policy.id,
        name: policy.name,
        description: policy.description,
        rules: normalizePolicyRules(policy.rules),
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load policy');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Policy name is required');
      return;
    }

    const wildcardErrors = validatePolicyRelationWildcardRestrictions(formData.rules);
    if (wildcardErrors.length > 0) {
      setError(wildcardErrors[0].message);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await updatePolicy(formData.id, {
        name: formData.name,
        description: formData.description,
        rules: normalizePolicyRules(formData.rules),
      });
      router.push(`/authz/policies/details?policyId=${formData.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update policy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !formData.id) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Policy</h1>
          <p className="text-muted-foreground mt-2">
            Modify authorization policy rules using JSON, forms, or visual flow diagram
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Policy Details</CardTitle>
          <CardDescription>
            Update basic information about this policy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="id">Policy ID</Label>
            <Input
              id="id"
              value={formData.id}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Policy Name *</Label>
            <Input
              id="name"
              placeholder="Enter policy name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Enter policy description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

      <PolicyBuilder
        rules={formData.rules}
        onChange={(rules) => setFormData({ ...formData, rules: normalizePolicyRules(rules) })}
        error={error}
      />

      <div className="flex items-center justify-end gap-4">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

export default function EditPolicyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <EditPolicyContent />
    </Suspense>
  );
}
