'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertCircle, ScrollText } from 'lucide-react';
import { createPolicy } from '@/lib/authz-api';
import type { Rule } from '@/types/authz';
import { PolicyBuilder } from '@/components/authz/PolicyBuilder';
import { normalizePolicyRules, validatePolicyRelationWildcardRestrictions } from '@/lib/policy-format';

export default function NewPolicyPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    id: crypto.randomUUID(),
    name: '',
    description: '',
    rules: [] as Rule[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await createPolicy({
        id: formData.id,
        name: formData.name,
        description: formData.description,
        rules: normalizePolicyRules(formData.rules),
      });
      router.push('/authz/policies');
    } catch (err: any) {
      setError(err.message || 'Failed to create policy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/authz/policies');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="-ml-1 shrink-0" onClick={handleCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Create New Policy</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Define an authorization policy with access rules
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center text-lg">
            <ScrollText className="mr-3 h-5 w-5 text-primary" />
            Policy Details
          </CardTitle>
          <CardDescription>Provide basic information about this policy</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="divide-y">
            <div className="pb-5 space-y-1.5">
              <Label htmlFor="name" className="text-sm">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g. IoT Device Read Access"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="pt-5 space-y-1.5">
              <Label htmlFor="description" className="text-sm">Description</Label>
              <Input
                id="description"
                placeholder="Describe the purpose and scope of this policy"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <PolicyBuilder
        rules={formData.rules}
        onChange={(rules) => setFormData({ ...formData, rules: normalizePolicyRules(rules) })}
        error={error}
      />

      <div className="flex justify-end gap-3 pt-1">
        <Button variant="outline" onClick={handleCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating…
            </>
          ) : (
            'Create Policy'
          )}
        </Button>
      </div>
    </div>
  );
}
