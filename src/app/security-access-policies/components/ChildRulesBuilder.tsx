"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import type { ChildAccess, Entity } from "@/types/authorization";

interface ChildRulesBuilderProps {
  value?: Record<string, ChildAccess>;
  onChange: (value: Record<string, ChildAccess> | undefined) => void;
  entities: Entity[];
  depth?: number;
  parentType?: string;
  onRemove?: () => void;
}

export function ChildRulesBuilder({
  value = {},
  onChange,
  entities,
  depth = 0,
  parentType,
  onRemove,
}: ChildRulesBuilderProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const toggleExpanded = (type: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedTypes(newExpanded);
  };

  const addChildType = () => {
    // Get first available entity type that's not already added
    const availableTypes = entities.filter(
      (e) => !Object.keys(value).includes(e.name)
    );

    if (availableTypes.length > 0) {
      const newType = availableTypes[0].name;
      onChange({
        ...value,
        [newType]: {
          actions: [],
        },
      });
      // Auto-expand the new type
      setExpandedTypes(new Set([...expandedTypes, newType]));
    }
  };

  const removeChildType = (type: string) => {
    const newValue = { ...value };
    delete newValue[type];
    onChange(Object.keys(newValue).length > 0 ? newValue : undefined);
  };

  const updateChildType = (oldType: string, newType: string) => {
    if (oldType === newType) return;

    const newValue: Record<string, ChildAccess> = {};
    Object.entries(value).forEach(([key, val]) => {
      if (key === oldType) {
        newValue[newType] = val;
      } else {
        newValue[key] = val;
      }
    });
    onChange(newValue);
  };

  const updateActions = (type: string, actions: string[]) => {
    onChange({
      ...value,
      [type]: {
        ...value[type],
        actions,
      },
    });
  };

  const updateChildren = (type: string, children: Record<string, ChildAccess> | undefined) => {
    onChange({
      ...value,
      [type]: {
        ...value[type],
        children,
      },
    });
  };

  const getAvailableActions = (entityType: string) => {
    const entity = entities.find((e) => e.name === entityType);
    if (!entity) return [];

    const actions = [...entity.actions];
    if (entity.supports_list_action && !actions.includes("list")) {
      actions.unshift("list");
    }
    actions.push("*"); // Always include wildcard option
    return actions;
  };

  const getAvailableEntities = () => {
    return entities.filter((e) => !Object.keys(value).includes(e.name));
  };

  const childTypes = Object.entries(value);
  const hasChildren = childTypes.length > 0;
  const indentClass = depth > 0 ? `ml-${Math.min(depth * 8, 16)}` : "";

  return (
    <div className={`space-y-3 ${indentClass}`}>
      {depth === 0 && (
        <div className="flex items-center justify-between mb-2">
          <div>
            <Label>Child Resources</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Define which child resources can be accessed and with what actions
            </p>
          </div>
        </div>
      )}

      {hasChildren && (
        <div className="space-y-3">
          {childTypes.map(([type, access]) => {
            const entity = entities.find((e) => e.name === type);
            const isExpanded = expandedTypes.has(type);
            const hasOwnChildren = access.children && Object.keys(access.children).length > 0;

            return (
              <div
                key={type}
                className="border-2 rounded-lg p-4 space-y-3 bg-card hover:bg-accent/5 transition-colors"
                style={{ borderLeftWidth: depth > 0 ? '4px' : '2px' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-3">
                    {/* Entity Type and Actions Row */}
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Child Entity Type</Label>
                        <Select value={type} onValueChange={(newType) => updateChildType(type, newType)}>
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={type}>
                              {entity?.description || type}
                            </SelectItem>
                            {getAvailableEntities().map((e) => (
                              <SelectItem key={e.name} value={e.name}>
                                {e.description || e.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Allowed Actions *</Label>
                        <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded-md bg-background">
                          {access.actions.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No actions selected</span>
                          ) : (
                            access.actions.map((action) => (
                              <Badge
                                key={action}
                                variant="secondary"
                                className="cursor-pointer hover:bg-destructive/20"
                                onClick={() =>
                                  updateActions(
                                    type,
                                    access.actions.filter((a) => a !== action)
                                  )
                                }
                              >
                                {action}
                                <Trash2 className="h-3 w-3 ml-1" />
                              </Badge>
                            ))
                          )}
                        </div>
                        <Select
                          value=""
                          onValueChange={(action) => {
                            if (action && !access.actions.includes(action)) {
                              updateActions(type, [...access.actions, action]);
                            }
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="+ Add action" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableActions(type)
                              .filter((a) => !access.actions.includes(a))
                              .map((action) => (
                                <SelectItem key={action} value={action}>
                                  {action === "*" ? "* (All actions)" : action.charAt(0).toUpperCase() + action.slice(1)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Nested Children */}
                    {(hasOwnChildren || isExpanded) && (
                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-2">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">
                            Children of {type}
                          </span>
                        </div>
                        <ChildRulesBuilder
                          value={access.children}
                          onChange={(children) => updateChildren(type, children)}
                          entities={entities}
                          depth={depth + 1}
                          parentType={type}
                        />
                      </div>
                    )}

                    {/* Add nested children button */}
                    {!hasOwnChildren && !isExpanded && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleExpanded(type)}
                        className="text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add nested child rules
                      </Button>
                    )}
                  </div>

                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChildType(type)}
                    className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Child Type Button */}
      {getAvailableEntities().length > 0 && (
        <Button
          type="button"
          variant={hasChildren ? "outline" : "secondary"}
          size="sm"
          onClick={addChildType}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {hasChildren ? "Add another child type" : "Add child resource access"}
        </Button>
      )}

      {!hasChildren && depth === 0 && (
        <p className="text-xs text-muted-foreground">
          No child resource access defined. Access is limited to the direct resource only.
        </p>
      )}
    </div>
  );
}
