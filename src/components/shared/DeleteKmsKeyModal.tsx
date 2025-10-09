'use client';

import React, { useState, useEffect } from 'react';
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeleteKmsKeyModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  keyName: string;
  keyId: string;
  isDeleting: boolean;
}

export const DeleteKmsKeyModal: React.FC<DeleteKmsKeyModalProps> = ({
  isOpen,
  onOpenChange,
  onConfirm,
  keyName,
  keyId,
  isDeleting,
}) => {
  const [confirmationText, setConfirmationText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
    }
  }, [isOpen]);

  const isConfirmed = confirmationText === keyId;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center text-xl">
            <AlertTriangle className="mr-2 h-6 w-6 text-destructive" />
            Permanently Delete KMS Key
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action is permanent and cannot be undone. Please read the warning carefully.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Warning: Irreversible Action</AlertTitle>
          <AlertDescription>
            You are about to permanently delete the KMS key "<strong>{keyName}</strong>" with ID "<strong>{keyId}</strong>". This will remove it from the system entirely and cannot be reversed.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="key-id-confirm" className="font-bold text-destructive">
            To confirm, please type the key ID: <span className="font-mono bg-destructive/10 p-1 rounded-sm break-all">{keyId}</span>
          </Label>
          <Input
            id="key-id-confirm"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Enter key ID to confirm"
            disabled={isDeleting}
            className="border-destructive focus-visible:ring-destructive"
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            disabled={isDeleting || !isConfirmed}
          >
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {isDeleting ? 'Deleting...' : 'Permanently Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
