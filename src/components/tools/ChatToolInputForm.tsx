'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ChatToolInputField, ChatToolInputRequest } from '@/lib/chat-tools';
import { ChevronDownIcon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ChatToolResourceSelector } from './ChatToolResourceSelector';

interface ChatToolInputFormProps {
  initialValues: Record<string, unknown>;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  request: ChatToolInputRequest;
  submitLabel?: string;
}

const FIELD_LABEL_ACRONYMS = new Set(['api', 'ca', 'dms', 'ecdsa', 'id', 'kms', 'ocsp', 'ra', 'rsa']);

function formatFieldLabel(name: string) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(' ');
  return words
    .map((word, index) => FIELD_LABEL_ACRONYMS.has(word.toLowerCase())
      ? word.toUpperCase()
      : index === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word.toLowerCase())
    .join(' ');
}

function hasInputValue(value: unknown) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function buildInitialValues(
  fields: ChatToolInputField[],
  initialValues: Record<string, unknown>,
) {
  return Object.fromEntries(fields.map((field) => {
    const suppliedValue = initialValues[field.name];
    if (suppliedValue !== undefined) return [field.name, suppliedValue];
    if (field.defaultValue !== undefined) return [field.name, field.defaultValue];
    if (field.type === 'boolean') return [field.name, false];
    if (field.type === 'array') return [field.name, []];
    return [field.name, ''];
  }));
}

function normalizeFormValues(
  fields: ChatToolInputField[],
  values: Record<string, unknown>,
  initialValues: Record<string, unknown>,
  touchedFields: Set<string>,
) {
  const normalized: Record<string, unknown> = {};

  for (const field of fields) {
    const value = values[field.name];
    const wasInitiallyProvided = Object.prototype.hasOwnProperty.call(initialValues, field.name);
    const shouldInclude = field.required
      || wasInitiallyProvided
      || touchedFields.has(field.name)
      || (field.defaultValue === undefined && hasInputValue(value));

    if (!shouldInclude) continue;

    if (field.type === 'integer' || field.type === 'number') {
      if (value !== '') normalized[field.name] = Number(value);
    } else if (field.type === 'string') {
      if (typeof value === 'string' && value.trim()) normalized[field.name] = value.trim();
    } else {
      normalized[field.name] = value;
    }
  }

  return normalized;
}

interface FieldControlProps {
  allValues: Record<string, unknown>;
  error?: string;
  field: ChatToolInputField;
  id: string;
  onChange: (value: unknown) => void;
  value: unknown;
}

function FieldControl({ allValues, error, field, id, onChange, value }: FieldControlProps) {
  const descriptionId = field.description ? `${id}-description` : undefined;

  if (field.type === 'boolean') {
    return (
      <div className="flex items-start justify-between gap-4 py-1">
        <div className="space-y-1">
          <Label htmlFor={id}>{formatFieldLabel(field.name)}</Label>
          {field.description ? (
            <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
              {field.description}
            </p>
          ) : null}
        </div>
        <Checkbox
          aria-describedby={descriptionId}
          checked={value === true}
          id={id}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      </div>
    );
  }

  if (field.type === 'array' && field.itemOptions?.length) {
    const selectedValues = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          {formatFieldLabel(field.name)}
          {field.required ? <span className="ml-1 text-destructive">*</span> : null}
        </legend>
        {field.description ? <p className="text-xs leading-5 text-muted-foreground">{field.description}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {field.itemOptions.map((option) => {
            const optionId = `${id}-${option}`;
            return (
              <label className="flex items-center gap-2 text-sm text-foreground" htmlFor={optionId} key={option}>
                <Checkbox
                  checked={selectedValues.includes(option)}
                  id={optionId}
                  onCheckedChange={(checked) => onChange(
                    checked === true
                      ? [...selectedValues, option]
                      : selectedValues.filter((selected) => selected !== option),
                  )}
                />
                {option}
              </label>
            );
          })}
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </fieldset>
    );
  }

  if (field.control) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {formatFieldLabel(field.name)}
          {field.required ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
        <ChatToolResourceSelector
          control={field.control}
          id={id}
          onChange={onChange}
          relatedValues={allValues}
          value={value}
        />
        {field.description ? (
          <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
            {field.description}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {formatFieldLabel(field.name)}
        {field.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {field.options?.length ? (
        <Select
          onValueChange={(nextValue) => onChange(
            field.type === 'integer' || field.type === 'number' ? Number(nextValue) : nextValue,
          )}
          value={hasInputValue(value) ? String(value) : undefined}
        >
          <SelectTrigger aria-describedby={descriptionId} aria-invalid={Boolean(error)} id={id}>
            <SelectValue placeholder="Select a value" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={String(option)} value={String(option)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          aria-describedby={descriptionId}
          aria-invalid={Boolean(error)}
          autoCapitalize="none"
          id={id}
          max={field.maximum}
          min={field.minimum}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          type={field.type === 'integer' || field.type === 'number' ? 'number' : 'text'}
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        />
      )}
      {field.description ? (
        <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
          {field.description}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function ChatToolInputForm({
  initialValues,
  onCancel,
  onSubmit,
  request,
  submitLabel = 'Continue',
}: ChatToolInputFormProps) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, unknown>>(
    () => buildInitialValues(request.fields, initialValues),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOptional, setShowOptional] = useState(
    request.fields.some((field) => !field.required && Object.prototype.hasOwnProperty.call(initialValues, field.name)),
  );
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set());
  const requiredFields = request.fields.filter((field) => field.required);
  const optionalFields = request.fields.filter((field) => !field.required);

  const updateField = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setTouchedFields((current) => new Set(current).add(name));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = Object.fromEntries(
      requiredFields
        .filter((field) => !hasInputValue(values[field.name]))
        .map((field) => [field.name, 'This field is required.']),
    );

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(normalizeFormValues(request.fields, values, initialValues, touchedFields));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4 border-t pt-4" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Complete the tool input</p>
        <p className="text-xs leading-5 text-muted-foreground">
          The request did not include every required value. Review the detected values and fill in the missing fields.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {requiredFields.map((field) => (
          <FieldControl
            allValues={values}
            error={errors[field.name]}
            field={field}
            id={`${formId}-${field.name}`}
            key={field.name}
            onChange={(value) => updateField(field.name, value)}
            value={values[field.name]}
          />
        ))}
      </div>

      {optionalFields.length > 0 ? (
        <div className="space-y-3 border-t pt-3">
          <Button
            aria-expanded={showOptional}
            className="h-8 gap-1.5 px-2"
            onClick={() => setShowOptional((current) => !current)}
            type="button"
            variant="ghost"
          >
            <ChevronDownIcon className={showOptional ? 'size-4 rotate-180' : 'size-4'} />
            Optional settings
          </Button>
          {showOptional ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {optionalFields.map((field) => (
                <FieldControl
                  allValues={values}
                  error={errors[field.name]}
                  field={field}
                  id={`${formId}-${field.name}`}
                  key={field.name}
                  onChange={(value) => updateField(field.name, value)}
                  value={values[field.name]}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button disabled={isSubmitting} onClick={onCancel} size="sm" type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isSubmitting} size="sm" type="submit">
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
