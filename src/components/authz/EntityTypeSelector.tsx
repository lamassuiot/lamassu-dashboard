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
  valueMode?: 'entity_type' | 'qualified';
}

export function EntityTypeSelector({
  id,
  schemas,
  value,
  onValueChange,
  placeholder = 'Select entity type',
  disabled = false,
  valueMode = 'entity_type',
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
      ? `${s.schema_name}.${s.entity_type}` === value
      : s.entity_type === value
  );

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        {selectedSchema ? (
          <div className="flex flex-col gap-0 text-left min-w-0">
            <span className="font-medium text-sm leading-tight truncate">{selectedSchema.entity_type}</span>
            <span className="text-[11px] text-muted-foreground leading-tight truncate">{selectedSchema.schema_name}</span>
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
                  ? `${schema.schema_name}.${schema.entity_type}`
                  : schema.entity_type;
              return (
                <SelectItem
                  key={`${schema.schema_name}.${schema.entity_type}`}
                  value={itemValue}
                  textValue={itemValue}
                  className="pl-4 py-2"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-sm leading-tight">{schema.entity_type}</span>
                    <span className="text-[11px] text-muted-foreground leading-tight">{schema.schema_name}</span>
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
