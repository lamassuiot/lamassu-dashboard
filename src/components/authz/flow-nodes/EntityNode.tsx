'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EntityNodeData {
  entityType: string;
  actions: string[];
  directGrants: string[];
  onUpdate: (data: any) => void;
  onDelete: () => void;
}

export const EntityNode = memo(({ data }: NodeProps<EntityNodeData>) => {
  return (
    <Card className="min-w-[200px] shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">{data.entityType || 'Entity'}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={data.onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Actions:</div>
          <div className="flex flex-wrap gap-1">
            {data.actions && data.actions.length > 0 ? (
              data.actions.map((action) => (
                <Badge key={action} variant="secondary" className="text-xs">
                  {action}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No actions</span>
            )}
          </div>
        </div>

        {data.directGrants && data.directGrants.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Direct Grants:</div>
            <div className="flex flex-wrap gap-1">
              {data.directGrants.map((grant) => (
                <Badge key={grant} variant="outline" className="text-xs">
                  {grant}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary"
        style={{ width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary"
        style={{ width: 8, height: 8 }}
      />
    </Card>
  );
});

EntityNode.displayName = 'EntityNode';
