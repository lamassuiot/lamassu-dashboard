'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitBranch } from 'lucide-react';
import { fetchWorkflows, type WfxWorkflow } from '@/lib/iot-api';

// Default workflow for UI-driven update launches (matches the previous hard-coded value).
export const DEFAULT_LAUNCH_WORKFLOW = 'wfx.workflow.dau.direct';

// Human-readable label for a workflow, e.g. "wfx.workflow.dau.phased" -> "Phased".
export const workflowLabel = (name: string): string => {
  const suffix = name.replace(/^wfx\.workflow\.dau\./, '');
  return suffix.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || name;
};

// WorkflowSelect is a dropdown of the available WFX workflows used when launching an update. It falls
// back to the built-in direct/phased options when the workflow list cannot be fetched. The selected
// value is the full workflow name (e.g. "wfx.workflow.dau.phased"), which the backend accepts directly.
export function WorkflowSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { data: workflows = [] } = useQuery<WfxWorkflow[]>({
    queryKey: ['wfxWorkflows'],
    queryFn: ({ signal }) => fetchWorkflows({ signal }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <span className="flex items-center gap-2 truncate">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select a workflow" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {workflows.length > 0 ? (
          workflows.map((wf) => (
            <SelectItem key={wf.name} value={wf.name}>{workflowLabel(wf.name)}</SelectItem>
          ))
        ) : (
          <>
            <SelectItem value="wfx.workflow.dau.direct">Direct</SelectItem>
            <SelectItem value="wfx.workflow.dau.phased">Phased</SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
