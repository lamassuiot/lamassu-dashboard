'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Database, Key, Plus, X } from 'lucide-react';
import type { SchemaDefinition } from '@/types/authz';

interface NestedRuleConfig {
  targetEntity: string;
  relationName: string;
  enabled: boolean;
  actions: string[];
}

interface SchemaEntityNodeProps {
  data: {
    schema: SchemaDefinition;
    isStartingEntity?: boolean;
    isPolicyNode?: boolean;
    actions?: string[];
    directGrants?: string[];
    nestedRules?: NestedRuleConfig[];
    onUpdate?: (data: { actions: string[]; directGrants: string[] }) => void;
    onNestedRuleUpdate?: (targetEntity: string, relationName: string, data: { enabled: boolean; actions: string[] }) => void;
  };
}

export const SchemaEntityNode = memo(({ data }: SchemaEntityNodeProps) => {
  const { schema, isStartingEntity, isPolicyNode, onUpdate, onNestedRuleUpdate, nestedRules = [] } = data;
  const [selectedActions, setSelectedActions] = React.useState<string[]>(data.actions || []);
  const [ids, setIds] = React.useState<string[]>(data.directGrants || []);
  const [newId, setNewId] = React.useState('');
  
  const relations = Object.values(schema.relations);
  const hasAtomicActions = schema.atomicActions && schema.atomicActions.length > 0;
  const hasGlobalActions = schema.globalActions && schema.globalActions.length > 0;
  const availableActions = [
    ...(schema.atomicActions || []),
    ...(schema.globalActions || []),
  ];

  const toggleAction = (action: string) => {
    const newActions = selectedActions.includes(action)
      ? selectedActions.filter((a) => a !== action)
      : [...selectedActions, action];
    setSelectedActions(newActions);
    onUpdate?.({ actions: newActions, directGrants: ids });
  };

  const addId = () => {
    if (!newId.trim()) return;
    const newIds = [...ids, newId.trim()];
    setIds(newIds);
    setNewId('');
    onUpdate?.({ actions: selectedActions, directGrants: newIds });
  };

  const removeId = (id: string) => {
    const newIds = ids.filter((i) => i !== id);
    setIds(newIds);
    onUpdate?.({ actions: selectedActions, directGrants: newIds });
  };

  const borderColor = isStartingEntity ? 'border-green-500' : 'border-blue-500';
  const bgColor = isStartingEntity ? 'bg-green-50/50 dark:bg-green-950/50' : 'bg-blue-50/50 dark:bg-blue-950/50';
  const headerBg = isStartingEntity ? 'bg-green-100 dark:bg-green-900' : 'bg-blue-100 dark:bg-blue-900';
  const iconColor = isStartingEntity ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400';

  return (
    <Card className={`min-w-[280px] max-w-[340px] shadow-lg border-2 ${borderColor} ${bgColor}`}>
      <CardHeader className={`pb-3 ${headerBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className={`h-5 w-5 ${iconColor}`} />
            <CardTitle className="text-base font-bold">{schema.entityType}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {isStartingEntity && (
              <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
                START
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              Schema
            </Badge>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          <div>Table: <code className="bg-muted px-1 rounded">{schema.tableName}</code></div>
          <div className="flex items-center gap-1 mt-1">
            <Key className="h-3 w-3" />
            PK: <code className="bg-muted px-1 rounded">{schema.primaryKey}</code>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-3 space-y-3">
        {/* Policy Configuration - Only for starting entities */}
        {isPolicyNode && (
          <div className="border-2 border-green-500 rounded-md p-3 space-y-3 bg-green-50/50 dark:bg-green-950/30">
            <div className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">
              Policy Configuration
            </div>
            
            {/* Actions Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Actions</Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto">
                {availableActions.map((action) => (
                  <Button
                    key={action}
                    type="button"
                    variant={selectedActions.includes(action) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleAction(action)}
                    className={`h-7 text-xs justify-start ${
                      selectedActions.includes(action)
                        ? 'bg-green-600 hover:bg-green-700'
                        : ''
                    }`}
                  >
                    {action}
                  </Button>
                ))}
              </div>
              {selectedActions.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {selectedActions.length} selected
                </div>
              )}
            </div>

            {/* Direct Grants */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Direct Grants</Label>
              <div className="flex gap-1">
                <Input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addId()}
                  placeholder="Principal ID..."
                  className="h-7 text-xs"
                />
                <Button onClick={addId} size="sm" className="h-7 px-2">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {ids.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ids.map((id) => (
                    <Badge key={id} variant="outline" className="text-xs pr-1">
                      {id}
                      <button
                        onClick={() => removeId(id)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nested Rules - For entities that have relations to policy nodes */}
        {nestedRules.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase border-t pt-3">
              Nested Rules
            </div>
            {nestedRules.map((rule) => {
              const targetSchema = schema;
              const ruleActions = [
                ...(targetSchema.atomicActions || []),
                ...(targetSchema.globalActions || []),
              ];
              
              return (
                <div
                  key={`${rule.targetEntity}-${rule.relationName}`}
                  className="border-2 border-amber-500 rounded-md p-2 space-y-2 bg-amber-50/50 dark:bg-amber-950/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">
                      → {rule.targetEntity}
                      <span className="text-muted-foreground ml-1">via {rule.relationName}</span>
                    </div>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) =>
                        onNestedRuleUpdate?.(rule.targetEntity, rule.relationName, {
                          enabled: checked,
                          actions: rule.actions,
                        })
                      }
                      className="data-[state=checked]:bg-green-600"
                    />
                  </div>
                  
                  {rule.enabled && (
                    <div className="space-y-2">
                      <Label className="text-xs">Actions</Label>
                      <div className="border rounded-md p-2 max-h-[150px] overflow-y-auto space-y-1">
                        {ruleActions.map((action) => (
                          <div key={action} className="flex items-center gap-2">
                            <Checkbox
                              id={`${rule.targetEntity}-${rule.relationName}-${action}`}
                              checked={rule.actions.includes(action)}
                              onCheckedChange={(checked) => {
                                const newActions = checked
                                  ? [...rule.actions, action]
                                  : rule.actions.filter((a) => a !== action);
                                onNestedRuleUpdate?.(rule.targetEntity, rule.relationName, {
                                  enabled: rule.enabled,
                                  actions: newActions,
                                });
                              }}
                            />
                            <label
                              htmlFor={`${rule.targetEntity}-${rule.relationName}-${action}`}
                              className="text-xs cursor-pointer flex-1"
                            >
                              {action}
                            </label>
                          </div>
                        ))}
                      </div>
                      {rule.actions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rule.actions.map((action) => (
                            <Badge key={action} variant="default" className="text-xs bg-green-600">
                              {action}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Relations */}
        {relations.length > 0 && (
          <div className={isPolicyNode ? 'border-t pt-3' : 'border-b pb-2'}>
            <div className="text-xs font-semibold mb-2">Relations:</div>
            <div className="space-y-1">
              {relations.map((relation, idx) => (
                <div
                  key={idx}
                  className="text-xs bg-muted/50 px-2 py-1 rounded flex items-center justify-between"
                >
                  <span className="font-medium">{relation.name}</span>
                  <Badge variant="outline" className="text-xs">
                    → {relation.targetEntity}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Actions - Only show for non-policy nodes */}
        {!isPolicyNode && (hasAtomicActions || hasGlobalActions) && (
          <div className="space-y-1">
            {hasAtomicActions && (
              <div>
                <div className="text-xs font-semibold mb-1">Atomic Actions:</div>
                <div className="flex flex-wrap gap-1">
                  {schema.atomicActions!.slice(0, 3).map((action: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {action}
                    </Badge>
                  ))}
                  {schema.atomicActions!.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{schema.atomicActions!.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
            )}
            {hasGlobalActions && (
              <div>
                <div className="text-xs font-semibold mb-1">Global Actions:</div>
                <div className="flex flex-wrap gap-1">
                  {schema.globalActions!.slice(0, 3).map((action: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {action}
                    </Badge>
                  ))}
                  {schema.globalActions!.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{schema.globalActions!.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Dynamic handles for each relation */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-blue-500 !w-3 !h-3"
        id="left"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-blue-500 !w-3 !h-3"
        id="right"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3"
        id="top"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3"
        id="bottom"
      />
    </Card>
  );
});

SchemaEntityNode.displayName = 'SchemaEntityNode';
