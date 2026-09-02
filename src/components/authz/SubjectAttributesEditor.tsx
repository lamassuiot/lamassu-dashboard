'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import type { PrincipalType } from '@/types/authz';
import {
  newSubjectAttributeRow,
  X509_SUBJECT_ATTRIBUTE_SOURCES,
  type SubjectAttributeRow,
} from '@/lib/principal-subject-attributes';
import { FormFieldError } from '@/components/shared/FormValidationSummary';

type SubjectAttributesEditorProps = {
  type: PrincipalType;
  staticRows: SubjectAttributeRow[];
  mappingRows: SubjectAttributeRow[];
  onStaticRowsChange: (rows: SubjectAttributeRow[]) => void;
  onMappingRowsChange: (rows: SubjectAttributeRow[]) => void;
  onApplyWfxDevicePreset?: () => void;
  disabled?: boolean;
};

const updateRow = (
  rows: SubjectAttributeRow[],
  id: string,
  field: 'key' | 'value',
  value: string,
) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row);

function EmptyRowButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="h-auto w-full justify-start border-dashed py-3 text-sm text-muted-foreground"
    >
      <Plus className="mr-2 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

export function SubjectAttributesEditor({
  type,
  staticRows,
  mappingRows,
  onStaticRowsChange,
  onMappingRowsChange,
  onApplyWfxDevicePreset,
  disabled,
}: SubjectAttributesEditorProps) {
  const addStaticRow = () => onStaticRowsChange([...staticRows, newSubjectAttributeRow()]);
  const addMappingRow = () => onMappingRowsChange([...mappingRows, newSubjectAttributeRow()]);
  const removeStaticRow = (id: string) => onStaticRowsChange(staticRows.filter((row) => row.id !== id));
  const removeMappingRow = (id: string) => onMappingRowsChange(mappingRows.filter((row) => row.id !== id));

  return (
    <div className="space-y-6">
      {type === 'x509' && onApplyWfxDevicePreset && (
        <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/20 p-3">
          <div>
            <p className="text-sm font-medium">WFX Device Client</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sets derived attribute <code className="rounded bg-muted px-1 py-0.5 font-mono">client_id</code> from the certificate common name.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onApplyWfxDevicePreset} disabled={disabled} className="shrink-0">
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            Apply
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Subject attributes</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Static neutral attributes available to authorization policies.
          </p>
        </div>

        {staticRows.length === 0 ? (
          <EmptyRowButton label="Add subject attribute" onClick={addStaticRow} disabled={disabled} />
        ) : (
          <div className="space-y-2">
            {staticRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`subject-attribute-key-${row.id}`} className="sr-only">Key</Label>
                  <Input
                    id={`subject-attribute-key-${row.id}`}
                    placeholder={index === 0 ? 'key' : 'attribute name'}
                    value={row.key}
                    onChange={(event) => onStaticRowsChange(updateRow(staticRows, row.id, 'key', event.target.value))}
                    disabled={disabled}
                    className="font-mono text-sm"
                    aria-invalid={!!row.value.trim() && !row.key.trim()}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`subject-attribute-value-${row.id}`} className="sr-only">Value</Label>
                  <Input
                    id={`subject-attribute-value-${row.id}`}
                    placeholder={index === 0 ? 'value' : 'attribute value'}
                    value={row.value}
                    onChange={(event) => onStaticRowsChange(updateRow(staticRows, row.id, 'value', event.target.value))}
                    disabled={disabled}
                    className="font-mono text-sm"
                    aria-invalid={!!row.key.trim() && !row.value.trim()}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeStaticRow(row.id)}
                  disabled={disabled}
                  className="h-10 w-10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {((row.value.trim() && !row.key.trim()) || (row.key.trim() && !row.value.trim())) && (
                  <FormFieldError className="col-span-2" title={`Subject attribute ${index + 1}: key and value are both required.`} />
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addStaticRow} disabled={disabled}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Attribute
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Derived subject attributes</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Derived attributes override static attributes when both define the same key.
          </p>
        </div>

        {mappingRows.length === 0 ? (
          <EmptyRowButton label="Add derived subject attribute" onClick={addMappingRow} disabled={disabled} />
        ) : (
          <div className="space-y-2">
            {mappingRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`subject-mapping-key-${row.id}`} className="sr-only">Attribute name</Label>
                  <Input
                    id={`subject-mapping-key-${row.id}`}
                    placeholder={index === 0 ? 'attribute name' : 'client_id'}
                    value={row.key}
                    onChange={(event) => onMappingRowsChange(updateRow(mappingRows, row.id, 'key', event.target.value))}
                    disabled={disabled}
                    className="font-mono text-sm"
                    aria-invalid={!!row.value.trim() && !row.key.trim()}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`subject-mapping-value-${row.id}`} className="sr-only">Source</Label>
                  {type === 'x509' ? (
                    (() => {
                      const knownSources = new Set<string>(X509_SUBJECT_ATTRIBUTE_SOURCES);
                      const currentUnknownSource = row.value.trim() && !knownSources.has(row.value.trim())
                        ? row.value.trim()
                        : '';

                      return (
                        <Select
                          value={row.value}
                          onValueChange={(value) => onMappingRowsChange(updateRow(mappingRows, row.id, 'value', value))}
                          disabled={disabled}
                        >
                          <SelectTrigger
                            id={`subject-mapping-value-${row.id}`}
                            className="font-mono text-sm"
                            aria-invalid={!!row.key.trim() && !row.value.trim()}
                          >
                            <SelectValue placeholder="source" />
                          </SelectTrigger>
                          <SelectContent>
                            {currentUnknownSource && (
                              <SelectItem value={currentUnknownSource}>{currentUnknownSource}</SelectItem>
                            )}
                            {X509_SUBJECT_ATTRIBUTE_SOURCES.map((source) => (
                              <SelectItem key={source} value={source}>{source}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()
                  ) : (
                    <Input
                      id={`subject-mapping-value-${row.id}`}
                      placeholder="oidc.claim.device_id"
                      value={row.value}
                      onChange={(event) => onMappingRowsChange(updateRow(mappingRows, row.id, 'value', event.target.value))}
                      disabled={disabled}
                      className="font-mono text-sm"
                      aria-invalid={(!!row.key.trim() && !row.value.trim()) || (!!row.value.trim() && !row.value.trim().startsWith('oidc.claim.'))}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMappingRow(row.id)}
                  disabled={disabled}
                  className="h-10 w-10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {((row.value.trim() && !row.key.trim()) || (row.key.trim() && !row.value.trim())) && (
                  <FormFieldError className="col-span-2" title={`Derived subject attribute ${index + 1}: key and value are both required.`} />
                )}
                {type === 'oidc' && row.value.trim() && !row.value.trim().startsWith('oidc.claim.') && (
                  <FormFieldError className="col-span-2" title="OIDC source must start with oidc.claim." />
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addMappingRow} disabled={disabled}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Derived Attribute
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
