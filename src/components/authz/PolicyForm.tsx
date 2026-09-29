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
import { entityRuleIssues, httpRuleIssues } from '@/components/authz/policy-builder/rule-model';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';
import { usePolicySchemas } from '@/hooks/usePolicySchemas';
import { normalizePolicyRules, validatePolicyRelationWildcardRestrictions } from '@/lib/policy-format';
import type { HTTPRule, Rule } from '@/types/authz';

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

const ruleNumberFromPath = (path: string) => {
  const match = /^rules\[(\d+)\]/.exec(path);
  return match ? Number(match[1]) + 1 : null;
};

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
  const { schemas, httpSchemas, loading: loadingSchemas } = usePolicySchemas();

  const entityIssues = formData.rules.map((rule) => entityRuleIssues(rule, schemas));
  const httpIssues = formData.http_rules.map((rule) => httpRuleIssues(rule));
  const ruleIssues = [...entityIssues, ...httpIssues];
  const wildcardRules = [
    ...new Set(validatePolicyRelationWildcardRestrictions(formData.rules).map((e) => ruleNumberFromPath(e.path))),
  ];

  const validationErrors = [
    ...(!formData.name.trim() ? ['Identity: Policy Name is required.'] : []),
    ...ruleIssues.flatMap((issues, i) => issues.errors.map((e) => `Rule ${i + 1}: ${e}`)),
    ...wildcardRules.map((n) => `${n ? `Rule ${n}` : 'Access Rules'}: Relations cannot contain wildcards.`),
  ];
  const warnings = ruleIssues.flatMap((issues, i) => issues.warnings.map((w) => `Rule ${i + 1}: ${w}`));
  const summaryErrors = error ? [...validationErrors, `Submission: ${error}`] : validationErrors;

  return (
    <div className="space-y-0">
      <div className="pb-8 border-b">
        <h1 className="text-2xl font-bold">{isCreate ? 'Create New Policy' : 'Edit Policy'}</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          {isCreate
            ? 'Define what principals holding this policy are allowed to do.'
            : 'Update the policy. Changes apply to every principal it is granted to.'}
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
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
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
              <Input id="id" value={formData.id} readOnly className="bg-muted/50 font-mono text-xs" />
              {isCreate && <p className="text-xs text-muted-foreground">Auto-generated unique identifier.</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="e.g., Read-only access to devices and their certificates"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
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
            Choose the resources this policy covers, the actions it allows and which instances they apply to.
          </p>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <PolicyBuilder
            rules={formData.rules}
            onChange={(rules) => setFormData((prev) => ({ ...prev, rules: normalizePolicyRules(rules) }))}
            httpRules={formData.http_rules}
            onHttpRulesChange={(http_rules) => setFormData((prev) => ({ ...prev, http_rules }))}
            schemas={schemas}
            httpSchemas={httpSchemas}
            loadingSchemas={loadingSchemas}
            disabled={submitting}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-3 pt-6">
        <FormValidationSummary errors={summaryErrors} warnings={warnings} />
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
