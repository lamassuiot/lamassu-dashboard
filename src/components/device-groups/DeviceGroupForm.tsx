'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { sileo } from '@/lib/toast';
import { generateUUID } from '@/lib-crypto';
import { Save, Loader2, Monitor, PlusCircle } from 'lucide-react';
import { createDeviceGroup, updateDeviceGroup, fetchAllDeviceGroups } from '@/lib/device-groups-api';
import { validateFilterCriteria, normalizeFilterCriteria, getAncestorChain } from '@/lib/device-groups-utils';
import { useDeviceGroupStats } from '@/hooks/useDeviceGroupStats';
import type { DeviceGroup, DeviceGroupFilterOption, CreateDeviceGroupBody, UpdateDeviceGroupBody } from '@/types/device-group';
import { FilterExpressionBuilder } from './FilterExpressionBuilder';
import { ParentGroupSelector } from './ParentGroupSelector';
import { CriteriaRuleList } from './CriteriaRuleList';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

interface DeviceGroupFormProps {
  mode: 'create' | 'edit';
  existingGroup?: DeviceGroup;
  /** Pre-selected parent for new subgroups (create mode). */
  initialParentId?: string | null;
}

function FormSection({ title, description, children }: Readonly<{ title: string; description: ReactNode; children: ReactNode }>) {
  return (
    <div className="grid grid-cols-1 gap-6 py-8 lg:grid-cols-3 lg:gap-10">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5 lg:col-span-2">{children}</div>
    </div>
  );
}

function InheritedRulesPreview({ parentId, groups }: Readonly<{ parentId: string; groups: DeviceGroup[] }>) {
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const parent = byId.get(parentId);
  if (!parent) return null;

  const sources = [...getAncestorChain(parent, byId), parent]
    .map((source) => ({ source, rules: normalizeFilterCriteria(source.criteria ?? []) }))
    .filter((entry) => entry.rules.length > 0);
  const total = sources.reduce((sum, entry) => sum + entry.rules.length, 0);

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <p className="text-sm font-medium">
        {total === 0 ? `No rules inherited from ${parent.name}` : `Inherits ${total} rule${total === 1 ? '' : 's'}`}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {total === 0
          ? 'The parent chain has no rules, so it matches every device.'
          : 'These always apply in addition to the rules you define below.'}
      </p>
      {sources.map(({ source, rules }) => (
        <div key={source.id} className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            From{' '}
            <Link href={`/device-groups/details?groupId=${source.id}`} target="_blank" className="text-primary hover:underline">
              {source.name}
            </Link>
          </p>
          <CriteriaRuleList criteria={rules} inherited />
        </div>
      ))}
    </div>
  );
}

function CurrentMembership({ groupId }: Readonly<{ groupId: string }>) {
  const { stats, isLoading, error } = useDeviceGroupStats(groupId);
  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/20 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Monitor className="h-4 w-4" />
      </div>
      <div className="min-w-0 text-sm">
        {isLoading ? (
          <Skeleton className="h-4 w-48" />
        ) : error || !stats ? (
          <p className="text-muted-foreground">Current device count unavailable.</p>
        ) : (
          <p>
            Currently matches <span className="font-semibold tabular-nums">{stats.total.toLocaleString()}</span> device{stats.total === 1 ? '' : 's'}.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Membership is evaluated dynamically, so rule changes apply as soon as you save.</p>
      </div>
    </div>
  );
}

export function DeviceGroupForm({ mode, existingGroup, initialParentId = null }: Readonly<DeviceGroupFormProps>) {
  const router = useRouter();

  const [name, setName] = useState(existingGroup?.name || '');
  const [description, setDescription] = useState(existingGroup?.description || '');
  const [parentId, setParentId] = useState<string | null>(existingGroup ? existingGroup.parent_id || null : initialParentId);
  const [criteria, setCriteria] = useState<DeviceGroupFilterOption[]>(
    existingGroup?.criteria ? normalizeFilterCriteria(existingGroup.criteria) : [],
  );
  const [nameTouched, setNameTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllDeviceGroups()
      .then((all) => {
        if (!cancelled) setGroups(all);
      })
      .catch((err) => {
        if (!cancelled) setGroupsError(err instanceof Error ? err.message : 'Failed to fetch groups');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingGroups(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parentName = groups.find((g) => g.id === parentId)?.name;

  const errors = useMemo(() => {
    const result: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) result.name = 'Group name is required';
    else if (trimmedName.length < 3) result.name = 'Group name must be at least 3 characters';
    else if (trimmedName.length > NAME_MAX_LENGTH) result.name = `Group name must be at most ${NAME_MAX_LENGTH} characters`;
    else if (groups.some((g) => g.id !== existingGroup?.id && g.name === trimmedName)) {
      result.name = 'Another group already uses this name';
    }

    if (description.length > DESCRIPTION_MAX_LENGTH) {
      result.description = `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`;
    }

    if (mode === 'edit' && parentId === existingGroup?.id) {
      result.parentId = 'A group cannot be its own parent';
    }

    if (criteria.length > 0) {
      const validation = validateFilterCriteria(criteria);
      if (!validation.valid) result.criteria = validation.error || 'Invalid filter criteria';
    } else if (mode === 'create') {
      result.criteria = 'Add at least one membership rule';
    }
    return result;
  }, [name, description, parentId, criteria, mode, existingGroup, groups]);

  const validationErrors = Object.values(errors);
  const showNameError = Boolean(errors.name) && (nameTouched || name.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationErrors.length > 0) {
      setNameTouched(true);
      sileo.error({ title: 'Validation Error', description: 'Please fix the errors in the form' });
      return;
    }

    setIsSubmitting(true);
    try {
      const fields: UpdateDeviceGroupBody = {
        name: name.trim(),
        description: description.trim(),
        parent_id: parentId,
        criteria,
      };

      if (mode === 'create') {
        const body: CreateDeviceGroupBody = { id: generateUUID(), ...fields };
        const newGroup = await createDeviceGroup(body);
        sileo.success({ title: 'Success', description: `Device group "${newGroup.name}" created successfully` });
        router.push(`/device-groups/details?groupId=${newGroup.id}`);
      } else if (existingGroup) {
        const updatedGroup = await updateDeviceGroup(existingGroup.id, fields);
        sileo.success({ title: 'Success', description: `Device group "${updatedGroup.name}" updated successfully` });
        router.push(`/device-groups/details?groupId=${updatedGroup.id}`);
      }
    } catch (err) {
      sileo.error({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save device group' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(mode === 'edit' && existingGroup ? `/device-groups/details?groupId=${existingGroup.id}` : '/device-groups');
  };

  const emptyRulesDescription = mode === 'create'
    ? 'Add at least one rule to define which devices belong to this group.'
    : parentName
      ? `Without rules of its own, this group contains every device of ${parentName}.`
      : 'Without rules, this group matches every device in the system.';

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormSection title="Identity" description="How this group is named and described across the dashboard.">
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Group name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="e.g. Production PLCs"
            value={name}
            maxLength={NAME_MAX_LENGTH + 20}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            aria-invalid={showNameError}
            aria-describedby={showNameError ? 'device-group-name-error' : 'device-group-name-help'}
          />
          {showNameError ? (
            <FormFieldError id="device-group-name-error" title={`${errors.name}.`} />
          ) : (
            <p id="device-group-name-help" className="text-xs text-muted-foreground">Must be unique.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="description">Description</Label>
            <span className={`text-xs tabular-nums ${errors.description ? 'text-destructive' : 'text-muted-foreground'}`}>
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            id="description"
            placeholder="What devices does this group collect, and why?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? 'device-group-description-error' : undefined}
          />
          {errors.description && <FormFieldError id="device-group-description-error" title={`${errors.description}.`} />}
        </div>
      </FormSection>

      <Separator />

      <FormSection title="Hierarchy" description="Nest this group under a parent to narrow the parent's devices further.">
        <ParentGroupSelector
          value={parentId}
          onChange={setParentId}
          groups={groups}
          isLoading={isLoadingGroups}
          loadError={groupsError}
          excludeGroupId={existingGroup?.id}
          error={errors.parentId}
        />
        {parentId && !isLoadingGroups && <InheritedRulesPreview parentId={parentId} groups={groups} />}
      </FormSection>

      <Separator />

      <FormSection
        title="Membership Rules"
        description={<>A device joins this group when it matches <span className="font-medium text-foreground">all</span> of these rules{parentId ? ' and the inherited ones' : ''}.</>}
      >
        {mode === 'edit' && existingGroup && <CurrentMembership groupId={existingGroup.id} />}
        <FilterExpressionBuilder
          criteria={criteria}
          onChange={setCriteria}
          emptyDescription={emptyRulesDescription}
          // Missing values are flagged per rule once touched; only surface structural errors here.
          error={criteria.length > 0 && criteria.every((rule) => rule.value.trim()) ? errors.criteria : undefined}
        />
      </FormSection>

      <Separator />

      <div className="space-y-4 pt-6">
        <FormValidationSummary errors={validationErrors} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || validationErrors.length > 0}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : mode === 'create' ? (
              <PlusCircle className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create Group' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}
