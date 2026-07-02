'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Key, Globe } from 'lucide-react';
import type { SchemaDefinition } from '@/types/authz';

interface SchemaNodeProps {
  data: {
    schema: SchemaDefinition;
  };
}

export const SchemaNode = memo(({ data }: SchemaNodeProps) => {
  const schema = data.schema;
  const namespaceLabel = schema.namespace?.trim() || 'N/A';
  const hasAtomicActions = schema.atomic_actions && schema.atomic_actions.length > 0;
  const hasGlobalActions = schema.global_actions && schema.global_actions.length > 0;
  const relationCount = Object.keys(schema.relations).length;

  return (
    <Card className="min-w-[280px] max-w-[320px] shadow-lg border-2">
      <CardHeader className="pb-3 bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{schema.entity_type}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {schema.table_name}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          PK: <code className="bg-muted px-1 rounded">{schema.primary_key}</code>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Namespace: <span className="font-medium text-foreground">{namespaceLabel}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {/* Atomic Actions */}
        {hasAtomicActions && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Key className="h-3 w-3" />
              Atomic Actions
            </div>
            <div className="flex flex-wrap gap-1">
              {schema.atomic_actions!.slice(0, 4).map((action: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {action}
                </Badge>
              ))}
              {schema.atomic_actions!.length > 4 && (
                <Badge variant="secondary" className="text-xs">
                  +{schema.atomic_actions!.length - 4}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Global Actions */}
        {hasGlobalActions && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Globe className="h-3 w-3" />
              Global Actions
            </div>
            <div className="flex flex-wrap gap-1">
              {schema.global_actions!.slice(0, 4).map((action: string, index: number) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {action}
                </Badge>
              ))}
              {schema.global_actions!.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{schema.global_actions!.length - 4}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Relation Count */}
        {relationCount > 0 && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            {relationCount} relation{relationCount !== 1 ? 's' : ''}
          </div>
        )}
      </CardContent>

      {/* Handles for connections */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !w-3 !h-3"
        id="right"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !w-3 !h-3"
        id="left"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-3 !h-3"
        id="bottom"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-3 !h-3"
        id="top"
      />
    </Card>
  );
});

SchemaNode.displayName = 'SchemaNode';
