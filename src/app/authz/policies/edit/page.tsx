'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, ArrowLeft, Save } from 'lucide-react';
import { getPolicy, updatePolicy } from '@/lib/authz-api';
import type { Rule, HTTPRule } from '@/types/authz';
import { normalizePolicyRules, validateHTTPRuleParamConstraints, validatePolicyRelationWildcardRestrictions } from '@/lib/policy-format';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { PolicyForm } from '@/components/authz/PolicyForm';

function EditPolicyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const policy_id = searchParams.get('policy_id');

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    rules: [] as Rule[],
    http_rules: [] as HTTPRule[],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (policy_id) loadPolicy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy_id]);

  const loadPolicy = async () => {
    if (!policy_id) return;
    try {
      setLoading(true);
      const policy = await getPolicy(policy_id);
      setFormData({
        id: policy.id,
        name: policy.name,
        description: policy.description,
        rules: normalizePolicyRules(policy.rules),
        http_rules: policy.http_rules ?? [],
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

    const httpParamConstraintErrors = validateHTTPRuleParamConstraints(formData.http_rules);
    if (httpParamConstraintErrors.length > 0) {
      setError(httpParamConstraintErrors[0].message);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await updatePolicy(formData.id, {
        name: formData.name,
        description: formData.description,
        rules: normalizePolicyRules(formData.rules),
        http_rules: formData.http_rules,
      });
      router.push(`/authz/policies/details?policy_id=${formData.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update policy');
    } finally {
      setSubmitting(false);
    }
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

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Policies', href: '/authz/policies' },
    ...(policy_id
      ? [{ label: formData.name || 'Details', href: `/authz/policies/details?policy_id=${policy_id}` }]
      : []),
    { label: 'Edit' },
  ];

  return (
    <BreadcrumbPage items={breadcrumbItems} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto space-y-5 mb-8">
        <PolicyForm
          formData={formData}
          setFormData={setFormData}
          error={error}
          submitting={submitting}
          mode="edit"
          submitIcon={Save}
          onSubmit={handleSubmit}
        />
      </div>
    </BreadcrumbPage>
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
