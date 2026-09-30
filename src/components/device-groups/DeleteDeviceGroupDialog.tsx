'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { DeviceGroup } from '@/types/device-group';

interface DeleteDeviceGroupDialogProps {
  group: Pick<DeviceGroup, 'id' | 'name'> | null;
  /** Groups nested under `group`; the backend deletes them too (ON DELETE CASCADE). */
  descendants: Pick<DeviceGroup, 'id' | 'name'>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

const MAX_LISTED_DESCENDANTS = 5;

export function DeleteDeviceGroupDialog({
  group,
  descendants,
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: Readonly<DeleteDeviceGroupDialogProps>) {
  const listed = descendants.slice(0, MAX_LISTED_DESCENDANTS);
  const remaining = descendants.length - listed.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Device Group</AlertDialogTitle>
          <AlertDialogDescription>
            Delete &quot;{group?.name}&quot;? This cannot be undone. Devices are not deleted, only the group definition.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {descendants.length > 0 && (
          <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {descendants.length} subgroup{descendants.length === 1 ? '' : 's'} will also be deleted
            </p>
            <ul className="mt-2 space-y-0.5 pl-6 text-muted-foreground">
              {listed.map((child) => (
                <li key={child.id} className="list-disc truncate">{child.name}</li>
              ))}
              {remaining > 0 && <li className="list-none">and {remaining} more</li>}
            </ul>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open (with its spinner) until the caller finishes and closes it.
              event.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            variant="destructive"
          >
            {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : descendants.length > 0 ? `Delete ${descendants.length + 1} groups` : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
