'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertCircle, ArrowLeft, Save } from 'lucide-react';
import { getPolicy, updatePolicy } from '@/lib/authz-api';
import type { Rule, HTTPRule } from '@/types/authz';
import { PolicyBuilder } from '@/components/authz/PolicyBuilder';
import { normalizePolicyRules, validatePolicyRelationWildcardRestrictions } from '@/lib/policy-format';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

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

        <div className="space-y-0">

          {/* ── Page header ── */}
          <div className="pb-8 border-b">
            <h1 className="text-2xl font-bold">Edit Policy</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Update the authorization policy and its access rules.
            </p>
          </div>

          {error && (
            <div className="pt-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* ── Identity ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Identity</p>
              <p className="text-sm text-muted-foreground mt-1">Name and describe this policy.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    Policy Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g., IoT Device Read Access"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="id">Policy ID</Label>
                  <Input
                    id="id"
                    value={formData.id}
                    readOnly
                    className="bg-muted/50 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose and scope of this policy"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  disabled={submitting}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Rules ── */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
            <div>
              <p className="font-semibold">Access Rules</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configure the conditions and permissions granted by this policy.
              </p>
            </div>
            <div className="lg:col-span-2">
              <PolicyBuilder
                rules={formData.rules}
                onChange={(rules) => setFormData((prev) => ({ ...prev, rules: normalizePolicyRules(rules) }))}
                httpRules={formData.http_rules}
                onHttpRulesChange={(http_rules) => setFormData((prev) => ({ ...prev, http_rules }))}
                error={error}
              />
            </div>
          </div>

          <Separator />

          <div className="flex justify-end pt-6">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" /> Save Changes</>
              )}
            </Button>
          </div>
        </div>
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
