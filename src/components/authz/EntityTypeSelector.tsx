import type { SchemaDefinition } from '@/types/authz';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EntityTypeSelectorProps {
  id: string;
  schemas: SchemaDefinition[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  valueMode?: 'entityType' | 'qualified';
}

export function EntityTypeSelector({
  id,
  schemas,
  value,
  onValueChange,
  placeholder = 'Select entity type',
  disabled = false,
  valueMode = 'entityType',
}: EntityTypeSelectorProps) {
  const groupedSchemas = schemas.reduce<Record<string, SchemaDefinition[]>>((acc, schema) => {
    const namespace = schema.namespace || 'other';
    if (!acc[namespace]) {
      acc[namespace] = [];
    }
    acc[namespace].push(schema);
    return acc;
  }, {});

  const selectedSchema = schemas.find((s) =>
    valueMode === 'qualified'
      ? `${s.schemaName}.${s.entityType}` === value
      : s.entityType === value
  );

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        {selectedSchema ? (
          <div className="flex flex-col gap-0 text-left min-w-0">
            <span className="font-medium text-sm leading-tight truncate">{selectedSchema.entityType}</span>
            <span className="text-[11px] text-muted-foreground leading-tight truncate">{selectedSchema.schemaName}</span>
          </div>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {Object.entries(groupedSchemas).map(([namespace, namespaceSchemas]) => (
          <SelectGroup key={namespace}>
            <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
              {namespace}
            </SelectLabel>
            {namespaceSchemas.map((schema) => {
              const itemValue =
                valueMode === 'qualified'
                  ? `${schema.schemaName}.${schema.entityType}`
                  : schema.entityType;
              return (
                <SelectItem
                  key={`${schema.schemaName}.${schema.entityType}`}
                  value={itemValue}
                  textValue={itemValue}
                  className="pl-4 py-2"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-sm leading-tight">{schema.entityType}</span>
                    <span className="text-[11px] text-muted-foreground leading-tight">{schema.schemaName}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
