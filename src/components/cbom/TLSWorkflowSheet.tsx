'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  TLSWorkflowInspector,
  type TLSWorkflowConnection,
} from '@/components/cbom/TLSWorkflowInspector';

interface TLSWorkflowSheetProps {
  connection: TLSWorkflowConnection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TLSWorkflowSheet({
  connection,
  open,
  onOpenChange,
}: TLSWorkflowSheetProps) {
  if (!connection) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 overflow-hidden p-0 sm:!w-2/3 sm:!max-w-none"
      >
        <SheetHeader className="shrink-0 border-b px-6 py-5">
          <SheetTitle>TLS Workflow</SheetTitle>
          <SheetDescription>
            {connection.label}
            {connection.endpoint ? ` · ${connection.endpoint}` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6">
          <TLSWorkflowInspector
            connections={[connection]}
            showConnectionSelector={false}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
