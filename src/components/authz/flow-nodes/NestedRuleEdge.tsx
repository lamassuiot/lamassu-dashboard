'use client';

import React, { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import type { SchemaDefinition } from '@/types/authz';

interface NestedRuleEdgeData {
  relationName: string;
  sourceEntity: string;
  target_entity: string;
  targetSchema?: SchemaDefinition;
  enabled: boolean;
  actions: string[];
  onToggle: (enabled: boolean) => void;
  onActionsChange: (actions: string[]) => void;
}

type CustomEdgeProps = EdgeProps & {
  data?: NestedRuleEdgeData;
};

export function NestedRuleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: CustomEdgeProps) {
  const [expanded, setExpanded] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  if (!data) {
    return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd as string} />;
  }

  const {
    relationName,
    sourceEntity,
    target_entity,
    targetSchema,
    enabled,
    actions = [],
    onToggle,
    onActionsChange,
  } = data;

  const availableActions = targetSchema
    ? [
        ...(targetSchema.atomic_actions || []),
        ...(targetSchema.global_actions || []),
      ]
    : [];

  const toggleAction = (action: string) => {
    const newActions = actions.includes(action)
      ? actions.filter((a: string) => a !== action)
      : [...actions, action];
    onActionsChange(newActions);
  };

  return (
    <>
      <BaseEdge 
        id={id} 
        path={edgePath} 
        style={{
          stroke: enabled ? 'hsl(45 93% 47%)' : 'hsl(217 91% 60%)',
          strokeWidth: 2,
          strokeDasharray: '3,3',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <Card className={`min-w-[200px] max-w-[280px] shadow-lg border-2 ${
            enabled ? 'border-amber-500 bg-amber-50/95 dark:bg-amber-950/95' : 'border-blue-500 bg-blue-50/95 dark:bg-blue-950/95'
          } backdrop-blur-sm`}>
            <CardContent className="p-3 space-y-2">
              {/* Header with relation info and toggle */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Link2 className={`h-4 w-4 ${enabled ? 'text-amber-600' : 'text-blue-600'}`} />
                  <span className={`text-xs font-semibold ${
                    enabled ? 'text-amber-900 dark:text-amber-100' : 'text-blue-900 dark:text-blue-100'
                  }`}>
                    {relationName}
                  </span>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={onToggle}
                  className="data-[state=checked]:bg-green-600"
                />
              </div>

              {/* Relationship info */}
              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-mono text-xs bg-white/50 dark:bg-black/20 px-1 rounded">
                    {target_entity}
                  </span>
                  <span>→</span>
                  <span className="font-mono text-xs bg-white/50 dark:bg-black/20 px-1 rounded">
                    {sourceEntity}
                  </span>
                </div>
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
                            variant={actions.includes(action) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleAction(action)}
                            className={`text-xs h-6 ${
                              actions.includes(action)
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

                  {enabled && !expanded && actions.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {actions.length} action(s) selected
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
          </Card>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
