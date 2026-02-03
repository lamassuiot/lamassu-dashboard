'use client';

import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Trash2, Plus, X } from 'lucide-react';

interface RuleNodeProps {
  data: {
    entityType: string;
    actions: string[];
    directGrants?: string[];
    onUpdate: (data: any) => void;
    onDelete: () => void;
  };
}

export const RuleNode = memo(({ data }: RuleNodeProps) => {
  const [actionInput, setActionInput] = useState('');
  const [grantInput, setGrantInput] = useState('');

  const addAction = () => {
    if (actionInput.trim() && !data.actions.includes(actionInput.trim())) {
      data.onUpdate({
        actions: [...data.actions, actionInput.trim()],
      });
      setActionInput('');
    }
  };

  const removeAction = (action: string) => {
    data.onUpdate({
      actions: data.actions.filter((a) => a !== action),
    });
  };

  const addGrant = () => {
    if (grantInput.trim() && !data.directGrants?.includes(grantInput.trim())) {
      data.onUpdate({
        directGrants: [...(data.directGrants || []), grantInput.trim()],
      });
      setGrantInput('');
    }
  };

  const removeGrant = (grant: string) => {
    data.onUpdate({
      directGrants: data.directGrants?.filter((g) => g !== grant) || [],
    });
  };

  return (
    <Card className="min-w-[280px] max-w-[320px] shadow-lg border-2 border-green-500">
      <CardHeader className="pb-3 bg-green-50 dark:bg-green-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-sm">Rule: {data.entityType}</CardTitle>
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

      <CardContent className="pt-4 space-y-3">
        {/* Actions */}
        <div className="space-y-2">
          <div className="text-xs font-semibold">Actions</div>
          {data.actions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.actions.map((action: string) => (
                <Badge
                  key={action}
                  variant="default"
                  className="text-xs flex items-center gap-1"
                >
                  {action}
                  <button
                    onClick={() => removeAction(action)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addAction()}
              placeholder="Add action"
              className="h-7 text-xs"
            />
            <Button onClick={addAction} size="sm" className="h-7 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Direct Grants */}
        <div className="space-y-2">
          <div className="text-xs font-semibold">Direct Grants (Optional)</div>
          {data.directGrants && data.directGrants.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.directGrants.map((grant: string) => (
                <Badge
                  key={grant}
                  variant="outline"
                  className="text-xs flex items-center gap-1"
                >
                  {grant}
                  <button
                    onClick={() => removeGrant(grant)}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input
              value={grantInput}
              onChange={(e) => setGrantInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addGrant()}
              placeholder="Principal ID"
              className="h-7 text-xs"
            />
            <Button onClick={addGrant} size="sm" className="h-7 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t">
          Connect to schema entities via relations →
        </div>
      </CardContent>

      <Handle
        type="target"
        position={Position.Left}
        className="!bg-green-500 !w-3 !h-3"
        id="left"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-green-500 !w-3 !h-3"
        id="right"
      />
    </Card>
  );
});

RuleNode.displayName = 'RuleNode';
