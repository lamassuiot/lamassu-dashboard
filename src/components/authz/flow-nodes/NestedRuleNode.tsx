'use client';

import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Link2, ChevronDown, ChevronUp } from 'lucide-react';
import type { SchemaDefinition } from '@/types/authz';

interface NestedRuleNodeProps {
  data: {
    relationName: string;
    sourceEntity: string;
    targetEntity: string;
    targetSchema?: SchemaDefinition;
    enabled: boolean;
    actions: string[];
    onToggle: (enabled: boolean) => void;
    onActionsChange: (actions: string[]) => void;
  };
}

export const NestedRuleNode = memo(({ data }: NestedRuleNodeProps) => {
  const {
    relationName,
    sourceEntity,
    targetEntity,
    targetSchema,
    enabled,
    actions,
    onToggle,
    onActionsChange,
  } = data;

  const [expanded, setExpanded] = useState(false);
  
  // Sync selectedActions with the actions prop from parent
  const selectedActions = actions || [];
  
  const handleToggle = (checked: boolean) => {
    onToggle(checked);
  };

  const availableActions = targetSchema
    ? [
        ...(targetSchema.atomicActions || []),
        ...(targetSchema.globalActions || []),
      ]
    : [];

  const toggleAction = (action: string) => {
    const newActions = selectedActions.includes(action)
      ? selectedActions.filter((a) => a !== action)
      : [...selectedActions, action];
    onActionsChange(newActions);
  };

  return (
    <Card className="min-w-[200px] max-w-[280px] shadow-lg border-2 border-amber-500 bg-amber-50/80 dark:bg-amber-950/80">
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-2 !h-2" />
      
      <CardContent className="p-3 space-y-2">
        {/* Header with relation info and toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link2 className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
              {relationName}
            </span>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-green-600"
          />
        </div>

        {/* Relationship info */}
        <div className="text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              {targetEntity}
            </Badge>
            <span>→</span>
            <Badge variant="outline" className="text-xs">
              {sourceEntity}
            </Badge>
          </div>
          <p className="mt-1 text-xs italic">via {relationName}</p>
        </div>

        {/* Configuration form - only shown when enabled */}
        {enabled && (
          <>
            <div className="flex items-center justify-between pt-1 border-t">
              <Label className="text-xs text-amber-900 dark:text-amber-100">
                Nested Rule
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="h-5 w-5 p-0"
              >
                {expanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
            </div>

            {expanded && availableActions.length > 0 && (
              <div className="space-y-1 pt-1">
                <Label className="text-xs">Actions:</Label>
                <div className="grid grid-cols-2 gap-1">
                  {availableActions.map((action) => (
                    <Button
                      key={action}
                      variant={selectedActions.includes(action) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleAction(action)}
                      className={`text-xs h-6 ${
                        selectedActions.includes(action)
                          ? 'bg-green-600 hover:bg-green-700'
                          : ''
                      }`}
                    >
                      {action}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {enabled && !expanded && selectedActions.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {selectedActions.length} action(s) selected
              </div>
            )}
          </>
        )}

        {!enabled && (
          <p className="text-xs text-muted-foreground italic">
            Enable to add nested rule
          </p>
        )}
      </CardContent>

      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-2 !h-2" />
    </Card>
  );
});

NestedRuleNode.displayName = 'NestedRuleNode';
