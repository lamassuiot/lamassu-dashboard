'use client';

import { useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';

import { FormFieldError } from '@/components/shared/FormValidationSummary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { slugifyRaId } from '@/lib/ra-form';
import { RaFormSection } from './RaFormSection';
import { fieldError, type RaSectionProps } from './types';

export function IdentitySection({ values, update, issues, touch, isEditMode }: RaSectionProps & { isEditMode: boolean }) {
  // In create mode the ID follows the name until the user edits it by hand.
  const [isIdLinked, setIsIdLinked] = useState(!isEditMode && !values.id);
  const nameError = fieldError(issues, 'name');
  const idError = fieldError(issues, 'id');

  return (
    <RaFormSection
      id="identity"
      title="Identity"
      description="How operators and devices refer to this Registration Authority."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="raName">Name</Label>
          <Input
            id="raName"
            value={values.name}
            placeholder="e.g. Main IoT Enrollment Service"
            autoFocus={!isEditMode}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'raName-error' : undefined}
            onBlur={() => touch('name')}
            onChange={event => update({
              name: event.target.value,
              ...(isIdLinked && { id: slugifyRaId(event.target.value) }),
            })}
          />
          {nameError && <FormFieldError id="raName-error" title={nameError} />}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="raId">ID</Label>
          <div className="flex gap-1.5">
            <Input
              id="raId"
              value={values.id}
              placeholder="e.g. main-iot-ra"
              disabled={isEditMode}
              className="font-mono"
              aria-invalid={!!idError}
              aria-describedby={idError ? 'raId-error' : 'raId-hint'}
              onBlur={() => touch('id')}
              onChange={event => {
                setIsIdLinked(!event.target.value);
                update({ id: event.target.value });
              }}
            />
            {!isEditMode && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                aria-pressed={isIdLinked}
                aria-label={isIdLinked ? 'Stop deriving the ID from the name' : 'Derive the ID from the name'}
                title={isIdLinked ? 'ID follows the name' : 'Derive ID from name'}
                onClick={() => {
                  if (!isIdLinked) update({ id: slugifyRaId(values.name) });
                  setIsIdLinked(!isIdLinked);
                }}
              >
                {isIdLinked ? <Link2 className="size-4" /> : <Link2Off className="size-4" />}
              </Button>
            )}
          </div>
          {idError ? (
            <FormFieldError id="raId-error" title={idError} />
          ) : (
            <p id="raId-hint" className="text-xs text-muted-foreground">
              {isEditMode ? 'The ID cannot be changed after creation.' : 'Used in EST endpoint URLs. Cannot be changed later.'}
            </p>
          )}
        </div>
      </div>
    </RaFormSection>
  );
}
