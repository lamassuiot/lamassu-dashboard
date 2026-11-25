'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';

import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGlobalCapability } from '@/contexts/PlatformAccessContext';
import { listPolicies } from '@/lib/authz-api';
import { AUTHZ_ATTRIBUTE_SOURCES, type AuthzAttributeMapping, type RaFormField, type RaFormValues } from '@/lib/ra-form';
import type { Policy } from '@/types/authz';

interface AuthzPrincipalFieldsProps {
  values: RaFormValues;
  update: (patch: Partial<RaFormValues>) => void;
  touch: (field: RaFormField) => void;
  attributesErrors?: readonly string[];
}

async function listAllPolicies(): Promise<Policy[]> {
  const all: Policy[] = [];
  let bookmark = '';
  for (;;) {
    const page = await listPolicies({ pageSize: 100, bookmark: bookmark || undefined });
    all.push(...page.list);
    if (!page.next || page.next === bookmark) return all;
    bookmark = page.next;
  }
}

/**
 * Policies and subject attributes of the RA principal. Without permission to grant authz policies a user can
 * only take access away; the DMS Manager rejects any save that grants more.
 */
export function AuthzPrincipalFields({ values, update, touch, attributesErrors = [] }: AuthzPrincipalFieldsProps) {
  const canGrant = useGlobalCapability('authz.public.principal_policy', 'grant');
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAllPolicies()
      .then(all => !cancelled && setPolicies(all))
      .catch(err => !cancelled && setLoadError(err instanceof Error ? err.message : 'Could not load the policies.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePolicy = (id: string, checked: boolean) =>
    update({ authzPolicyIds: checked ? [...values.authzPolicyIds, id] : values.authzPolicyIds.filter(policyId => policyId !== id) });
  const setAttribute = (index: number, patch: Partial<AuthzAttributeMapping>) =>
    update({ authzAttributes: values.authzAttributes.map((attribute, i) => (i === index ? { ...attribute, ...patch } : attribute)) });

  // A selected policy missing from the list (deleted, or not readable by this user) stays visible so it can be dropped.
  const listed = (policies ?? [])
    .map(policy => ({ id: policy.id, name: policy.name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const choices = [...listed, ...values.authzPolicyIds.filter(id => !listed.some(policy => policy.id === id)).map(id => ({ id, name: id }))];

  return (
    <>
      {!canGrant && (
        <p className="text-xs text-muted-foreground">
          You can remove policies, turn the principal off or turn it on without policies. Adding policies, turning the principal on with policies, changing subject attributes or changing the Enrollment CA while the principal is on needs permission to grant authz policies.
        </p>
      )}

      <div className="space-y-2" role="group" aria-labelledby="authz-policies-label">
        <Label id="authz-policies-label">Policies</Label>
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>Every certificate signed by the Enrollment CA gets these policies, whether it was issued by this RA, by any other RA on that CA or by anyone else who signs with it.</span>
        </p>
        <p className="text-xs text-muted-foreground">Without any, devices authenticate but are allowed nothing.</p>
        {policies === null && !loadError && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading policies" />}
        {loadError && <FormFieldError id="authzPolicies-error" title={`Could not load the policies: ${loadError}`} />}
        {policies?.length === 0 && values.authzPolicyIds.length === 0 && (
          <p className="text-sm text-muted-foreground">No policies are defined in authz.</p>
        )}
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {choices.map(policy => {
            const checked = values.authzPolicyIds.includes(policy.id);
            return (
              <div key={policy.id} className="flex items-center gap-2">
                <Checkbox
                  id={`authz-policy-${policy.id}`}
                  checked={checked}
                  // Removing a policy needs no permission; adding one does.
                  disabled={!canGrant && !checked}
                  onCheckedChange={next => togglePolicy(policy.id, next === true)}
                />
                <Label htmlFor={`authz-policy-${policy.id}`} className="font-normal">{policy.name}</Label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Subject attributes</Label>
        <p className="text-xs text-muted-foreground">Values the policies read from the device certificate, such as the client_id of a device.</p>
        {values.authzAttributes.map((attribute, index) => {
          const sources = AUTHZ_ATTRIBUTE_SOURCES.some(source => source.value === attribute.source)
            ? AUTHZ_ATTRIBUTE_SOURCES
            : [...AUTHZ_ATTRIBUTE_SOURCES, { value: attribute.source, label: attribute.source }];
          return (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label={`Attribute ${index + 1} name`}
                placeholder="client_id"
                value={attribute.name}
                disabled={!canGrant}
                onBlur={() => touch('authzAttributes')}
                onChange={event => setAttribute(index, { name: event.target.value })}
              />
              <Select value={attribute.source} disabled={!canGrant} onValueChange={source => setAttribute(index, { source })}>
                <SelectTrigger aria-label={`Attribute ${index + 1} source`} className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map(source => (
                    <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove attribute ${index + 1}`}
                disabled={!canGrant}
                onClick={() => update({ authzAttributes: values.authzAttributes.filter((_, i) => i !== index) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGrant}
          onClick={() => update({ authzAttributes: [...values.authzAttributes, { name: '', source: 'x509.subject.cn' }] })}
        >
          <Plus className="mr-1 size-4" />
          Add attribute
        </Button>
        {attributesErrors.map((message, index) => <FormFieldError key={message} id={`authzAttributes-error-${index}`} title={message} />)}
      </div>
    </>
  );
}
