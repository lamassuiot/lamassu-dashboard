'use client';

import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Plus, X } from 'lucide-react';
import type { SchemaDefinition } from '@/types/authz';

interface PolicyFormNodeProps {
  data: {
    schema: SchemaDefinition;
    actions: string[];
    direct_grants: string[];
    nestedRules: Record<string, boolean>;
    onUpdate: (data: {
      actions: string[];
      direct_grants: string[];
      nestedRules: Record<string, boolean>;
    }) => void;
  };
}

export const PolicyFormNode = memo(({ data }: PolicyFormNodeProps) => {
  const { schema, actions, direct_grants, nestedRules, onUpdate } = data;
  const [newId, setNewId] = useState('');
  const [selectedActions, setSelectedActions] = useState<string[]>(actions || []);
  const [ids, setIds] = useState<string[]>(direct_grants || []);
  const [nested, setNested] = useState<Record<string, boolean>>(nestedRules || {});

  const availableActions = [
    ...(schema.atomic_actions || []),
    ...(schema.global_actions || []),
  ];

  const relations = Object.values(schema.relations || {});

  const toggleAction = (action: string) => {
    const newActions = selectedActions.includes(action)
      ? selectedActions.filter((a) => a !== action)
      : [...selectedActions, action];
    setSelectedActions(newActions);
    onUpdate({ actions: newActions, direct_grants: ids, nestedRules: nested });
  };

  const addId = () => {
    if (!newId.trim()) return;
    const newIds = [...ids, newId.trim()];
    setIds(newIds);
    setNewId('');
    onUpdate({ actions: selectedActions, direct_grants: newIds, nestedRules: nested });
  };

  const removeId = (id: string) => {
    const newIds = ids.filter((i) => i !== id);
    setIds(newIds);
    onUpdate({ actions: selectedActions, direct_grants: newIds, nestedRules: nested });
  };

  const toggleNestedRule = (relationName: string) => {
    const newNested = { ...nested, [relationName]: !nested[relationName] };
    setNested(newNested);
    onUpdate({ actions: selectedActions, direct_grants: ids, nestedRules: newNested });
  };

  return (
    <Card className="min-w-[320px] max-w-[400px] shadow-xl border-2 border-green-600 bg-green-50/50 dark:bg-green-950/50">
      <Handle type="target" position={Position.Left} className="w-3 h-3" />
      
      <CardHeader className="pb-3 bg-green-100 dark:bg-green-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-base font-bold">Policy Configuration</CardTitle>
          </div>
          <Badge variant="default" className="text-xs bg-green-600">
            {schema.entity_type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <ScrollArea className="max-h-[500px] pr-3">
          <div className="space-y-4">
            {/* Actions Section */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground">
                Allowed Actions
              </Label>
              {availableActions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No actions available</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableActions.map((action) => (
                    <Button
                      key={action}
                      variant={selectedActions.includes(action) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleAction(action)}
                      className={
                        selectedActions.includes(action)
                          ? 'bg-green-600 hover:bg-green-700 text-xs'
                          : 'text-xs'
                      }
                    >
                      {action}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Direct Grants (IDs) Section */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-semibold text-foreground">
                Specific IDs (Direct Grants)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter ID..."
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addId()}
                  className="text-xs"
                />
                <Button
                  onClick={addId}
                  size="sm"
                  variant="outline"
                  disabled={!newId.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {ids.length > 0 && (
                <div className="space-y-1 mt-2">
                  {ids.map((id, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-muted px-2 py-1 rounded text-xs"
                    >
                      <code className="font-mono">{id}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeId(id)}
                        className="h-5 w-5 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Nested Rules Section */}
            {relations.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-semibold text-foreground">
                  Include Nested Rules for Relations
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which related entities should have nested access rules
                </p>
                <div className="space-y-2">
                  {relations.map((relation) => (
                    <div
                      key={relation.name}
                      className="flex items-center space-x-2 bg-muted/50 p-2 rounded"
                    >
                      <Checkbox
                        id={`nested-${relation.name}`}
                        checked={nested[relation.name] || false}
                        onCheckedChange={() => toggleNestedRule(relation.name)}
                      />
                      <label
                        htmlFor={`nested-${relation.name}`}
                        className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                      >
                        <span>{relation.name}</span>
                        <Badge variant="outline" className="text-xs">
                          → {relation.target_entity}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="pt-2 border-t space-y-1 text-xs text-muted-foreground">
              <p>
                <strong>{selectedActions.length}</strong> action(s) selected
              </p>
              <p>
                <strong>{ids.length}</strong> specific ID(s) configured
              </p>
              <p>
                <strong>{Object.values(nested).filter(Boolean).length}</strong> nested
                rule(s) enabled
              </p>
            </div>
          </div>
        </ScrollArea>
      </CardContent>

      <Handle type="source" position={Position.Right} className="w-3 h-3" />
    </Card>
  );
});

PolicyFormNode.displayName = 'PolicyFormNode';
