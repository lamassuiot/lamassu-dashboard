'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PolicyBuilder } from '@/components/authz/PolicyBuilder';
import { normalizePolicyRules, validatePolicyRelationWildcardRestrictions } from '@/lib/policy-format';
import type { HTTPRule, Rule } from '@/types/authz';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

interface PolicyFormData {
  id: string;
  name: string;
  description: string;
  rules: Rule[];
  http_rules: HTTPRule[];
}

interface PolicyFormProps {
  formData: PolicyFormData;
  setFormData: Dispatch<SetStateAction<PolicyFormData>>;
  error: string | null;
  submitting: boolean;
  mode: 'create' | 'edit';
  submitIcon: LucideIcon;
  onSubmit: () => void;
}

export function PolicyForm({
  formData,
  setFormData,
  error,
  submitting,
  mode,
  submitIcon: SubmitIcon,
  onSubmit,
}: PolicyFormProps) {
  const isCreate = mode === 'create';
  const wildcardErrors = validatePolicyRelationWildcardRestrictions(formData.rules);
  const validationErrors = [
    ...(!formData.name.trim() ? ['Identity: Policy Name is required.'] : []),
    ...wildcardErrors.map((validationError) => `Access Rules: ${validationError.message}`),
  ];
  const summaryErrors = error ? [...validationErrors, `Submission: ${error}`] : validationErrors;

  return (
    <div className="space-y-0">
      <div className="pb-8 border-b">
        <h1 className="text-2xl font-bold">{isCreate ? 'Create New Policy' : 'Edit Policy'}</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          {isCreate
            ? 'Define an authorization policy with access rules.'
            : 'Update the authorization policy and its access rules.'}
        </p>
      </div>

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
                aria-invalid={!formData.name.trim()}
                aria-describedby={!formData.name.trim() ? 'policy-name-error' : undefined}
              />
              {!formData.name.trim() && (
                <FormFieldError id="policy-name-error" title="Policy Name required." description="Enter one before saving." />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="id">{isCreate ? 'Policy ID (auto-generated)' : 'Policy ID'}</Label>
              <Input
                id="id"
                value={formData.id}
                readOnly
                className="bg-muted/50 font-mono text-xs"
              />
              {isCreate && (
                <p className="text-xs text-muted-foreground">Auto-generated unique identifier.</p>
              )}
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
            error={wildcardErrors[0]?.message}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-3 pt-6">
        <FormValidationSummary errors={summaryErrors} />
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={submitting || validationErrors.length > 0}>
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isCreate ? 'Creating...' : 'Saving...'}</>
            ) : (
              <><SubmitIcon className="mr-2 h-4 w-4" /> {isCreate ? 'Create Policy' : 'Save Changes'}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
