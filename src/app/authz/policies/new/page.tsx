'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle } from 'lucide-react';
import { createPolicy } from '@/lib/authz-api';
import type { Rule, HTTPRule } from '@/types/authz';
import { normalizePolicyRules, validatePolicyRelationWildcardRestrictions } from '@/lib/policy-format';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { PolicyForm } from '@/components/authz/PolicyForm';

export default function NewPolicyPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    id: crypto.randomUUID(),
    name: '',
    description: '',
    rules: [] as Rule[],
    http_rules: [] as HTTPRule[],
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
        http_rules: formData.http_rules,
      });
      router.push('/authz/policies');
    } catch (err: any) {
      setError(err.message || 'Failed to create policy');
    } finally {
      setSubmitting(false);
    }
  };

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Policies', href: '/authz/policies' },
    { label: 'New' },
  ];

  return (
    <BreadcrumbPage items={breadcrumbItems} className="space-y-5 pb-8">
      <div className="w-[80%] mx-auto space-y-5 mb-8">
        <PolicyForm
          formData={formData}
          setFormData={setFormData}
          error={error}
          submitting={submitting}
          mode="create"
          submitIcon={PlusCircle}
          onSubmit={handleSubmit}
        />
      </div>
    </BreadcrumbPage>
  );
}
