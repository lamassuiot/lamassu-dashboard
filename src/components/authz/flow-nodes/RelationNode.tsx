'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RelationNodeData {
  to: string;
  via: string;
  actions: string[];
  onUpdate: (data: any) => void;
  onDelete: () => void;
}

export const RelationNode = memo(({ data: rawData }: NodeProps) => {
  const data = rawData as unknown as RelationNodeData;
  return (
    <Card className="min-w-[180px] shadow-lg border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Relation</CardTitle>
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
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">To:</div>
            <div className="font-mono">{data.to || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Via:</div>
            <div className="font-mono">{data.via || '—'}</div>
          </div>
        </div>

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
      </CardContent>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground"
        style={{ width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground"
        style={{ width: 8, height: 8 }}
      />
    </Card>
  );
});

RelationNode.displayName = 'RelationNode';
