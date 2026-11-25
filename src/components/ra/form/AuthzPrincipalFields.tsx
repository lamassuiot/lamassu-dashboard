'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Trash2, X } from 'lucide-react';

import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { PolicySelectorSheet } from '@/components/shared/PolicySelectorSheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGlobalCapability } from '@/contexts/PlatformAccessContext';
import { getPolicy } from '@/lib/authz-api';
import { AUTHZ_ATTRIBUTE_SOURCES, type AuthzAttributeMapping, type RaFormField, type RaFormValues, type RaOnSameCa } from '@/lib/ra-form';
import type { Policy } from '@/types/authz';

interface AuthzPrincipalFieldsProps {
  values: RaFormValues;
  update: (patch: Partial<RaFormValues>) => void;
  touch: (field: RaFormField) => void;
  attributesErrors?: readonly string[];
  /** Other RAs on the Enrollment CA: their certificates get the policies of this principal too. */
  otherRasOnCa?: readonly RaOnSameCa[];
}

/** "A", "A and B", "A, B and 2 more". */
export function listRaNames(ras: readonly RaOnSameCa[], shown = 2): string {
  const names = ras.slice(0, shown).map(ra => `"${ra.name}"`);
  const rest = ras.length - names.length;
  if (rest > 0) return `${names.join(', ')} and ${rest} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
}

/** Policies by id: undefined while loading, null when it does not exist or this user can not read it. */
function usePolicyDetails(ids: readonly string[]) {
  const [known, setKnown] = useState<Record<string, Policy | null>>({});
  const missing = ids.filter(id => !(id in known));
  const missingKey = missing.join('\n');

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    Promise.all(missingKey.split('\n').map(id => getPolicy(id).then(policy => [id, policy] as const, () => [id, null] as const)))
      .then(entries => !cancelled && setKnown(current => ({ ...current, ...Object.fromEntries(entries) })));
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const remember = (policies: Policy[]) => setKnown(current => ({ ...current, ...Object.fromEntries(policies.map(policy => [policy.id, policy])) }));
  return { known, remember };
}

/**
 * Policies and subject attributes of the RA principal. Without permission to grant authz policies a user can
 * only take access away; the DMS Manager rejects any save that grants more.
 */
export function AuthzPrincipalFields({ values, update, touch, attributesErrors = [], otherRasOnCa = [] }: AuthzPrincipalFieldsProps) {
  const canGrant = useGlobalCapability('authz.public.principal_policy', 'grant');
  const [sheetOpen, setSheetOpen] = useState(false);
  const { known, remember } = usePolicyDetails(values.authzPolicyIds);

  const removePolicy = (id: string) => update({ authzPolicyIds: values.authzPolicyIds.filter(policyId => policyId !== id) });
  const addPolicies = (policies: Policy[]) => {
    remember(policies);
    update({ authzPolicyIds: [...values.authzPolicyIds, ...policies.map(policy => policy.id).filter(id => !values.authzPolicyIds.includes(id))] });
  };
  const setAttribute = (index: number, patch: Partial<AuthzAttributeMapping>) =>
    update({ authzAttributes: values.authzAttributes.map((attribute, i) => (i === index ? { ...attribute, ...patch } : attribute)) });

  return (
    <>
      {!canGrant && (
        <p className="text-xs text-muted-foreground">
          You can remove policies, turn the principal off or turn it on without policies. Adding policies, turning the principal on with policies, changing subject attributes or changing the Enrollment CA while the principal is on needs permission to grant authz policies.
        </p>
      )}

      <div className="space-y-2" role="group" aria-labelledby="authz-policies-label">
        <div className="flex items-end justify-between gap-2">
          <div>
            <Label id="authz-policies-label">Policies</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every certificate signed by the Enrollment CA gets these policies, whether it was issued by this RA, by any other RA on that CA or by anyone else who signs with it.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={!canGrant} onClick={() => setSheetOpen(true)}>
            <Plus className="mr-1 size-4" />
            Add policies
          </Button>
        </div>

        {values.authzPolicyIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policies: devices authenticate but are allowed nothing.</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {values.authzPolicyIds.map(id => {
              const policy = known[id];
              const name = policy?.name ?? id;
              return (
                <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {policy === undefined && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Loading policy" />}
                      {name}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {policy === null ? `${id} · not found or not readable` : id}
                    </p>
                  </div>
                  {/* Removing a policy needs no permission; adding one does. */}
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={() => removePolicy(id)}>
                    <X className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {values.authzPolicyIds.length > 0 && otherRasOnCa.length > 0 && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Other RAs share this Enrollment CA</AlertTitle>
            <AlertDescription>
              Certificates issued by {listRaNames(otherRasOnCa)} also get these policies. Anyone who can enroll in {otherRasOnCa.length > 1 ? 'those RAs' : 'that RA'} authenticates with them.
            </AlertDescription>
          </Alert>
        )}
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

      <PolicySelectorSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        excludedPolicyIds={values.authzPolicyIds}
        title="Add Policies"
        description="Select the policies the authz principal of this RA grants. They are granted when the RA is saved."
        confirmLabel={count => (count > 1 ? `Add ${count} Policies` : 'Add Policy')}
        onConfirm={addPolicies}
      />
    </>
  );
}
