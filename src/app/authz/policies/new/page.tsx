'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { createPolicy } from '@/lib/authz-api';
import type { Rule } from '@/types/authz';
import { PolicyBuilder } from '@/components/authz/PolicyBuilder';

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

    try {
      setSubmitting(true);
      setError(null);
      await createPolicy({
        id: formData.id,
        name: formData.name,
        description: formData.description,
        rules: formData.rules,
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create New Policy</h1>
          <p className="text-muted-foreground mt-2">
            Define a new authorization policy with rules using JSON, forms, or visual flow diagram
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
            Provide basic information about this policy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        onChange={(rules) => setFormData({ ...formData, rules })}
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
          Create Policy
        </Button>
      </div>
    </div>
  );
}
