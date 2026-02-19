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

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(groupedSchemas).map(([namespace, namespaceSchemas]) => (
          <SelectGroup key={namespace}>
            <SelectLabel className="font-bold">{namespace.toUpperCase()}</SelectLabel>
            {namespaceSchemas.map((schema) => (
              <SelectItem
                key={`${schema.schemaName}.${schema.entityType}`}
                value={valueMode === 'qualified' ? `${schema.schemaName}.${schema.entityType}` : schema.entityType}
                className="pl-10"
              >
                {schema.entityType}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
