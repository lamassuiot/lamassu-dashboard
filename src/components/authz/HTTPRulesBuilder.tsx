'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { getHTTPSchemas } from '@/lib/authz-api';
import type { HTTPRule, HTTPSchemaDefinition } from '@/types/authz';

interface HTTPRulesBuilderProps {
  httpRules: HTTPRule[];
  onChange: (httpRules: HTTPRule[]) => void;
}

export function HTTPRulesBuilder({ httpRules, onChange }: HTTPRulesBuilderProps) {
  const [httpSchemas, setHTTPSchemas] = useState<Record<string, HTTPSchemaDefinition>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHTTPSchemas()
      .then(setHTTPSchemas)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const schemaNames = Object.keys(httpSchemas);

  const addRule = () => {
    onChange([...httpRules, { http_schema_name: '', actions: [] }]);
  };

  const removeRule = (index: number) => {
    onChange(httpRules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updated: HTTPRule) => {
    onChange(httpRules.map((r, i) => (i === index ? updated : r)));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading HTTP schemas…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {httpRules.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          No HTTP rules defined
        </div>
      ) : (
        <div className="space-y-3">
          {httpRules.map((rule, index) => {
            const schema = httpSchemas[rule.http_schema_name];
            const allActions = schema?.all_actions ?? [];
            const isWildcard = rule.actions.includes('*');

            return (
              <div key={index} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Select
                    value={rule.http_schema_name}
                    onValueChange={(val) =>
                      updateRule(index, { http_schema_name: val, actions: [] })
                    }
                  >
                    <SelectTrigger className="h-8 w-48 text-sm">
                      <SelectValue placeholder="Select schema" />
                    </SelectTrigger>
                    <SelectContent>
                      {schemaNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    onClick={() => removeRule(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>

                {rule.http_schema_name && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Actions</Label>
                    {allActions.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No actions defined for this schema
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id={`http-wildcard-${index}`}
                            checked={isWildcard}
                            onCheckedChange={(checked) =>
                              updateRule(index, { ...rule, actions: checked ? ['*'] : [] })
                            }
                          />
                          <Label
                            htmlFor={`http-wildcard-${index}`}
                            className="cursor-pointer font-mono text-xs"
                          >
                            * (all)
                          </Label>
                        </div>
                        {!isWildcard &&
                          allActions.map((action) => (
                            <div key={action} className="flex items-center gap-1.5">
                              <Checkbox
                                id={`http-action-${index}-${action}`}
                                checked={rule.actions.includes(action)}
                                onCheckedChange={(checked) => {
                                  const next = checked
                                    ? [...rule.actions, action]
                                    : rule.actions.filter((a) => a !== action);
                                  updateRule(index, { ...rule, actions: next });
                                }}
                              />
                              <Label
                                htmlFor={`http-action-${index}-${action}`}
                                className="cursor-pointer font-mono text-xs"
                              >
                                {action}
                              </Label>
                            </div>
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

      <Button
        variant="outline"
        size="sm"
        onClick={addRule}
        disabled={schemaNames.length === 0}
        title={schemaNames.length === 0 ? 'No HTTP schemas available' : undefined}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add HTTP Rule
      </Button>

      {schemaNames.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">
          No HTTP schemas are registered on this server.
        </p>
      )}
    </div>
  );
}
