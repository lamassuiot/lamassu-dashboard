'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { sileo } from '@/lib/toast';
import { AlertCircle, Save, X, Users, Loader2 } from 'lucide-react';
import {
  createDeviceGroup,
  updateDeviceGroup,
  getDevicesByGroup,
} from '@/lib/device-groups-api';
import { validateFilterCriteria, normalizeFilterCriteria } from '@/lib/device-groups-utils';
import type {
  DeviceGroup,
  DeviceGroupFilterOption,
  CreateDeviceGroupBody,
} from '@/types/device-group';

// Generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, (c) => {
    const r = Math.trunc(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
import { FilterExpressionBuilder } from './FilterExpressionBuilder';
import { ParentGroupSelector } from './ParentGroupSelector';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

interface DeviceGroupFormProps {
  mode: 'create' | 'edit';
  existingGroup?: DeviceGroup;
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4 lg:col-span-2">{children}</div>
    </div>
  );
}

export function DeviceGroupForm({ mode, existingGroup }: DeviceGroupFormProps) {
  const router = useRouter();

  const [name, setName] = useState(existingGroup?.name || '');
  const [description, setDescription] = useState(existingGroup?.description || '');
  const [parentId, setParentId] = useState<string | null>(existingGroup?.parent_id || null);
  const [criteria, setCriteria] = useState<DeviceGroupFilterOption[]>(
    existingGroup?.criteria ? normalizeFilterCriteria(existingGroup.criteria) : []
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Validate form
  const getValidationErrors = (): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Group name is required';
    } else if (name.length < 3) {
      newErrors.name = 'Group name must be at least 3 characters';
    } else if (name.length > 100) {
      newErrors.name = 'Group name must be less than 100 characters';
    }

    if (description && description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    // Validate circular reference
    if (mode === 'edit' && parentId === existingGroup?.id) {
      newErrors.parentId = 'A group cannot be its own parent';
    }

    // Validate filter criteria
    if (criteria.length > 0) {
      const validation = validateFilterCriteria(criteria);
      if (!validation.valid) {
        newErrors.criteria = validation.error || 'Invalid filter criteria';
      }
    } else if (mode === 'create') {
      newErrors.criteria = 'At least one filter criterion is required';
    }

    return newErrors;
  };

  const errors = getValidationErrors();
  const validationErrors = Object.values(errors);
  const validateForm = () => validationErrors.length === 0;

  // Load preview count when criteria changes
  useEffect(() => {
    const loadPreview = async () => {
      if (criteria.length === 0) {
        setPreviewCount(null);
        return;
      }

      // For edit mode, we can get actual count from the existing group
      // For create mode or when criteria changed, we'd need a preview endpoint
      // Since the backend doesn't have a preview endpoint, we'll show a message
      setIsLoadingPreview(true);
      try {
        if (mode === 'edit' && existingGroup) {
          // Get current device count
          const devices = await getDevicesByGroup(existingGroup.id, {
            pageSize: 1,
          });
          // Note: This shows current count, not preview of changes
          setPreviewCount(devices.list.length);
        } else {
          // For create mode, we can't preview without creating the group
          setPreviewCount(null);
        }
      } catch (err) {
        console.error('Failed to load preview:', err);
        setPreviewCount(null);
      } finally {
        setIsLoadingPreview(false);
      }
    };

    const timeoutId = setTimeout(loadPreview, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [criteria, mode, existingGroup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      sileo.error({
        title: 'Validation Error',
        description: 'Please fix the errors in the form'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const body: CreateDeviceGroupBody = {
        id: generateUUID(),
        name: name.trim(),
        description: description.trim(),
        parent_id: parentId,
        criteria,
      };

      if (mode === 'create') {
        const newGroup = await createDeviceGroup(body);
        sileo.success({
          title: 'Success',
          description: `Device group "${newGroup.name}" created successfully`
        });
        router.push(`/device-groups/details?groupId=${newGroup.id}`);
      } else if (existingGroup) {
        const updatedGroup = await updateDeviceGroup(
          existingGroup.id,
          body
        );
        sileo.success({
          title: 'Success',
          description: `Device group "${updatedGroup.name}" updated successfully`
        });
        router.push(`/device-groups/details?groupId=${updatedGroup.id}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save device group';
      sileo.error({
        title: 'Error',
        description: errorMessage
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (mode === 'edit' && existingGroup) {
      router.push(`/device-groups/details?groupId=${existingGroup.id}`);
    } else {
      router.push('/device-groups');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-0">
      {/* Basic Information */}
      <FormSection
        title="Basic Information"
        description="Define the group name, description, and parent hierarchy."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Group Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Production Devices"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'device-group-name-error' : undefined}
            />
            {errors.name && <FormFieldError id="device-group-name-error" title={`${errors.name}.`} />}
            <p className="text-sm text-muted-foreground">
              A unique UUID will be automatically generated for this group
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe the purpose of this device group"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'device-group-description-error' : undefined}
            />
            {errors.description && (
              <FormFieldError id="device-group-description-error" title={`${errors.description}.`} />
            )}
            <p className="text-sm text-muted-foreground">
              {description.length}/500 characters
            </p>
          </div>

          <ParentGroupSelector
            value={parentId}
            onChange={setParentId}
            excludeGroupId={existingGroup?.id}
            error={errors.parentId}
          />
        </div>
      </FormSection>
      <Separator />

      {/* Filter Criteria */}
      <FormSection
        title="Filter Criteria"
        description="Define dynamic membership rules. All filters are combined with AND logic."
      >
        <FilterExpressionBuilder
          criteria={criteria}
          onChange={setCriteria}
          error={errors.criteria}
        />
      </FormSection>

      {/* Preview Card */}
      {mode === 'edit' && existingGroup && (
        <>
          <Separator />
          <FormSection
            title="Device Count"
            description="Current devices matching this group."
          >
            {isLoadingPreview ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading device count...</span>
              </div>
            ) : previewCount !== null ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{previewCount}</div>
                  <div className="text-sm text-muted-foreground">
                    Device{previewCount !== 1 ? 's' : ''} currently in this group
                  </div>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {criteria.length === 0
                    ? 'Add filter criteria to see matching device count'
                  : 'Save the group to see matching device count'}
                </AlertDescription>
              </Alert>
            )}
          </FormSection>
        </>
      )}

      <Separator />

      <div className="space-y-4 py-8">
        {mode === 'create' && criteria.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Device count will be calculated after the group is created. The group will dynamically
              include all devices matching the filter criteria.
            </AlertDescription>
          </Alert>
        )}

        <FormValidationSummary errors={validationErrors} />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSubmitting}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || validationErrors.length > 0}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-5 w-5" />
              {mode === 'create' ? 'Create Group' : 'Save Changes'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
