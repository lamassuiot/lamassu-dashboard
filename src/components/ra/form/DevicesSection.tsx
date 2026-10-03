'use client';

import { ChevronsUpDown } from 'lucide-react';

import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { TagInput } from '@/components/shared/TagInput';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { RegistrationMode } from '@/lib/ra-form';
import { cn } from '@/lib/utils';
import { ChoiceList, RaFieldGroup, RaFormSection } from './RaFormSection';
import { fieldError, listedIssues, type RaSectionProps } from './types';

const registrationModeOptions = [
  {
    value: 'JITP' as const,
    label: 'Just-in-time provisioning',
    description: 'Unknown devices are created automatically on their first enrollment.',
  },
  {
    value: 'PRE_REGISTRATION' as const,
    label: 'Pre-registration',
    description: 'Only devices registered beforehand may enroll.',
  },
];

export function DevicesSection({ values, update, issues, onOpenIconPicker }: RaSectionProps & { onOpenIconPicker: () => void }) {
  const metadataError = fieldError(issues, 'deviceMetadata');
  const iconError = fieldError(issues, 'deviceIcon');
  const DeviceIcon = getLucideIconByName(values.deviceIcon.name);

  return (
    <RaFormSection
      id="devices"
      title="Device provisioning"
      description="Which devices may enroll, and how new device records are created."
      issues={listedIssues(issues, ['deviceMetadata', 'deviceIcon'])}
    >
      <ChoiceList<RegistrationMode>
        name="registrationMode"
        label="Registration mode"
        value={values.registrationMode}
        onChange={registrationMode => update({ registrationMode })}
        options={registrationModeOptions}
      />

      <RaFieldGroup title="Defaults for new devices">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="deviceIconButton">Icon</Label>
            <button
              id="deviceIconButton"
              type="button"
              onClick={onOpenIconPicker}
              aria-invalid={!!iconError}
              aria-describedby={iconError ? 'deviceIcon-error' : undefined}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
                iconError && 'border-destructive ring-3 ring-destructive/20',
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: values.deviceIcon.bgColor }}>
                  {DeviceIcon && <DeviceIcon className="size-4" style={{ color: values.deviceIcon.color }} />}
                </span>
                <span className="truncate">{values.deviceIcon.name ?? 'Select device icon'}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
            {iconError && <FormFieldError id="deviceIcon-error" title={iconError} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="raTags">Tags</Label>
            <TagInput id="raTags" value={values.tags} onChange={tags => update({ tags })} placeholder="Add tags…" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deviceMetadata">Metadata</Label>
          <Textarea
            id="deviceMetadata"
            value={values.deviceMetadataJson}
            onChange={event => update({ deviceMetadataJson: event.target.value })}
            className="min-h-28 font-mono text-xs"
            spellCheck={false}
            aria-invalid={!!metadataError}
            aria-describedby={metadataError ? 'deviceMetadata-error' : 'deviceMetadata-hint'}
            placeholder={'{\n  "location": "factory-a"\n}'}
          />
          {metadataError
            ? <FormFieldError id="deviceMetadata-error" title={metadataError} />
            : <p id="deviceMetadata-hint" className="text-xs text-muted-foreground">JSON object assigned to devices created through just-in-time provisioning.</p>}
        </div>
      </RaFieldGroup>
    </RaFormSection>
  );
}
