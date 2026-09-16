'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitBranch, Info, AlertTriangle } from 'lucide-react';
import { fetchWorkflows, type WfxWorkflow } from '@/lib/iot-api';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';

// Default workflow for UI-driven update launches (matches the previous hard-coded value).
export const DEFAULT_LAUNCH_WORKFLOW = 'wfx.workflow.dau.direct';

// Human-readable label for a workflow, e.g. "wfx.workflow.dau.phased" -> "Phased".
export const workflowLabel = (name: string): string => {
  const suffix = name.replace(/^wfx\.workflow\.dau\./, '');
  return suffix.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || name;
};

// What a workflow choice actually does in HAWKBIT mode, where there is no WFX workflow engine.
//
// The value is not ignored there: the backend normalises it (wfx.workflow.dau.phased -> "phased")
// and maps it to hawkBit's DDI *actionType*, which is what a device sees. Only two values map:
//
//   direct -> actionType "forced"  — the deployment arrives as update:"forced"; the device installs
//                                   immediately.
//   phased -> actionType "soft"    — arrives as update:"attempt"; a DDI device may confirm or
//                                   postpone instead of installing on the spot.
//
// Anything else (canary included) falls through to "forced", i.e. identical to direct. That matters
// to state out loud: batching, thresholds and the canary device are expressed by hawkBit ROLLOUT
// GROUPS (rollout_type/rollout_value/auto/test_device_id), not by this field — so picking "Canary"
// here still gives you canary batching, but its action type is the same as Direct's.
const HAWKBIT_ACTION_NOTE: Record<string, string> = {
  direct: 'hawkBit action type "forced" — the device installs as soon as it polls.',
  phased: 'hawkBit action type "soft" — the device may confirm or postpone the install.',
};
const HAWKBIT_FALLBACK_NOTE =
  'hawkBit has no action type for this; it is sent as "forced", the same as Direct. Batching and the canary device come from the rollout groups, not from this choice.';

// hawkbitActionNote returns the note for one workflow value, or undefined outside hawkbit mode.
export function hawkbitActionNote(workflowName: string): string {
  const short = workflowName.replace(/^wfx\.workflow\.dau\./, '').toLowerCase();
  return HAWKBIT_ACTION_NOTE[short] ?? HAWKBIT_FALLBACK_NOTE;
}

// In NATIVE mode (real WFX workflows), a pack's packaging and its launch workflow are two separate
// fields that nothing on the backend cross-validates — but they are not actually independent: WFX
// only reaches the terminal state the backend is watching for when the two agree. A "non-swu" pack's
// device never sends ACTIVATED (there is no activation step — see isFirmwareSuccessState /
// isFirmwareRunningState in internal/updates/device_inventory.go), so launching it on the SWU
// Direct/Phased workflow leaves the backend waiting for a state that will never arrive; a "swu" pack
// launched on Download-Install analogously stops being tracked past its download step. This mirrors
// hawkbitActionNote's job of saying what a choice actually does, just for the mode where the
// mismatch is a silent tracking bug rather than a difference in device behaviour.
function workflowMatchesPackaging(workflowName: string, packaging: string): boolean {
  const short = workflowName.replace(/^wfx\.workflow\.dau\./, '').toLowerCase();
  return packaging === 'non-swu' ? short === 'download-install' : short !== 'download-install';
}

// packagingMismatchNote returns a warning when workflowName won't reach the terminal state the
// backend expects for a pack of this packaging, or undefined when they agree (or packaging is
// unknown, in which case there's nothing to compare against).
export function packagingMismatchNote(workflowName: string, packaging?: string): string | undefined {
  if (!packaging || workflowMatchesPackaging(workflowName, packaging)) return undefined;
  return packaging === 'non-swu'
    ? 'This pack is "non-swu": its update history only marks a job done at INSTALLED (there is no activation step). Direct/Phased drive the device through the SWU flow instead, so this backend keeps waiting for ACTIVATED and the update can look stuck as "installing" even after the device finished — pick Download-Install to match this pack’s packaging.'
    : 'This pack is "swu": its update history treats INSTALLED as a step along the way and only marks a job done at ACTIVATED. Download-Install drives the device through the raw flow instead, so it never reaches ACTIVATED and the update can look stuck the same way — pick Direct or Phased to match this pack’s packaging.';
}

// WorkflowSelect is a dropdown of the available WFX workflows used when launching an update. It falls
// back to the built-in direct/phased options when the workflow list cannot be fetched. The selected
// value is the full workflow name (e.g. "wfx.workflow.dau.phased"), which the backend accepts directly.
//
// In hawkbit mode the list comes back empty (there is no WFX), so the fallback pair IS the real
// choice — and each option carries what it maps to on the device, because "Phased" there means
// "the device may postpone", not "rolled out in waves".
export function WorkflowSelect({
  value,
  onChange,
  disabled,
  packaging,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The launched pack's packaging ('swu' | 'non-swu'), when known — enables the native-mode
   *  mismatch warning below. Meaningless in hawkbit mode, where packaging and the device's action
   *  type are unrelated (see hawkbitActionNote), so it's simply ignored there. */
  packaging?: string;
}) {
  const [workflows, setWorkflows] = useState<WfxWorkflow[]>([]);
  const { isSupported } = useUpdatesCapabilities();
  // No WFX workflow engine here, so the choice means an actionType rather than a workflow.
  const isHawkbitStyle = !isSupported('workflows');
  const mismatch = !isHawkbitStyle ? packagingMismatchNote(value, packaging) : undefined;

  const fetchWorkflowsData = useCallback(async () => {
    try {
      const result = await fetchWorkflows();
      setWorkflows(result);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchWorkflowsData();
  }, [fetchWorkflowsData]);

  return (
    <div className="space-y-1.5">
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
      {isHawkbitStyle && value ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{hawkbitActionNote(value)}</span>
        </p>
      ) : null}
      {mismatch ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{mismatch}</span>
        </p>
      ) : null}
    </div>
  );
}
