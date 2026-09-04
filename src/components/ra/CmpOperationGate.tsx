'use client';

import React from 'react';
import { PowerOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface CmpOperationGateProps {
  id: string;
  label: string;
  description?: React.ReactNode;
  // Shown in place of the operation's fields while it is switched off.
  disabledNote?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  // Rendered as siblings after the gate row, only while the operation is on.
  children?: React.ReactNode;
}

// Master on/off switch for one RFC 9483 message type, mirroring the backend's
// operationEnabled gate (settings.cmp_settings.enrollment_settings.<op>.enabled):
// a disabled operation is rejected at the wire layer, so the rest of its
// settings have no effect and are hidden rather than left editable.
//
// IMPORTANT (backend resolver quirk): a per-operation block whose mandatory
// enum field is still empty is treated as "never configured", and its default
// `enabled` is re-applied — silently flipping an explicit `false` back to
// `true` for ir/cr/kur/rr/genm. The save path must therefore always send the
// complete block (sentinel enum included), never a sparse `{enabled: false}`.
export function CmpOperationGate({
  id, label, description, disabledNote, checked, onCheckedChange, children,
}: CmpOperationGateProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-0.5">
          <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {/* The gated fields are gone while the operation is off, so the note takes
          their place in the layout and has to read as the section's content
          rather than as fine print under the switch. */}
      {!checked && disabledNote && (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
          <PowerOff className="h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1 text-sm font-medium text-primary">{disabledNote}</p>
        </div>
      )}
      {checked && children}
    </>
  );
}
