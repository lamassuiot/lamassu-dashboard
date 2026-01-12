"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { ChildAccess } from "@/types/authorization";

interface ChildRulesDisplayProps {
  childRules?: Record<string, ChildAccess>;
  depth?: number;
}

export function ChildRulesDisplay({ childRules, depth = 0 }: ChildRulesDisplayProps) {
  if (!childRules || Object.keys(childRules).length === 0) {
    if (depth === 0) {
      return (
        <div className="text-sm text-muted-foreground italic">
          Direct access only (no child resource access)
        </div>
      );
    }
    return null;
  }

  const indentClass = depth > 0 ? "ml-6" : "";

  return (
    <div className={`space-y-2 ${indentClass}`}>
      {Object.entries(childRules).map(([entityType, access]) => (
        <div key={entityType} className="border-l-2 border-primary/30 pl-3 py-1">
          <div className="flex items-start gap-2">
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{entityType}</span>
                <div className="flex gap-1 flex-wrap">
                  {access.actions.map((action) => (
                    <Badge key={action} variant="secondary" className="text-xs">
                      {action}
                    </Badge>
                  ))}
                </div>
              </div>
              {access.children && Object.keys(access.children).length > 0 && (
                <ChildRulesDisplay childRules={access.children} depth={depth + 1} />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
