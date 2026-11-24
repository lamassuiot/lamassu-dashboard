
'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DecommissionDeviceModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  deviceName: string;
  isDecommissioning: boolean;
}

export const DecommissionDeviceModal: React.FC<DecommissionDeviceModalProps> = ({
  isOpen,
  onOpenChange,
  onConfirm,
  deviceName,
  isDecommissioning,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Decommission Device</AlertDialogTitle>
          <AlertDialogDescription>
            By decommissioning the device, it will revoke all attached identities as well as loosing all access to Lamassu and other platforms.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning: Irreversible Action</AlertTitle>
            <AlertDescription>
                You are about to decommission the device "{deviceName}". This action is irreversible. All associated certificates will be revoked and the device will no longer be able to obtain new certificates. Are you sure you want to proceed?
            </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDecommissioning}>Close</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(buttonVariants({ variant: "destructive" }))}
            disabled={isDecommissioning}
          >
            {isDecommissioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Decommission
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
