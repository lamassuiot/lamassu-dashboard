'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { revocationReasons, type RevocationReason } from '@/lib/revocation-reasons';
import { ScrollArea } from '../ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface RevocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reasonValue: string) => void;
  itemName: string;
  itemType: 'CA' | 'Certificate';
  isConfirming?: boolean;
}

export const RevocationModal: React.FC<RevocationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType,
  isConfirming = false,
}) => {
  const [selectedReasonValue, setSelectedReasonValue] = useState<string>(revocationReasons[0].value);
  const [selectedReasonDetails, setSelectedReasonDetails] = useState<RevocationReason | undefined>(revocationReasons[0]);
  const [confirmationText, setConfirmationText] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset to default reason when modal opens
      setSelectedReasonValue(revocationReasons[0].value);
      setSelectedReasonDetails(revocationReasons[0]);
      setConfirmationText('');
    }
  }, [isOpen]);

  useEffect(() => {
    const reason = revocationReasons.find(r => r.value === selectedReasonValue);
    setSelectedReasonDetails(reason);
  }, [selectedReasonValue]);

  const handleConfirm = () => {
    if (selectedReasonValue) {
      onConfirm(selectedReasonValue);
    }
  };

  const isCaRevocationAndUnconfirmed = itemType === 'CA' && confirmationText !== itemName;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConfirming) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <AlertTriangle className="mr-2 h-6 w-6 text-destructive" />
            Confirm Revocation: {itemType === 'CA' ? 'Certification Authority' : 'Certificate'}
          </DialogTitle>
          <DialogDescription>
            You are about to revoke the {itemType === 'CA' ? 'Certification Authority' : 'certificate'} "<strong className="break-all">{itemName}</strong>". This action cannot be easily undone. Please select a reason for revocation.
          </DialogDescription>
        </DialogHeader>

        {itemType === 'CA' && (
            <Alert variant="warning" className="bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <AlertTitle className="text-orange-700 dark:text-orange-300">Warning: Critical Action</AlertTitle>
                <AlertDescription className="text-orange-600 dark:text-orange-400">
                    Revoking a Certification Authority is a critical action. It will invalidate all certificates issued by this CA, potentially causing widespread outages for devices and services that trust it.
                </AlertDescription>
            </Alert>
        )}

        <div className="py-4 space-y-4">
          <div>
            <Label htmlFor="revocationReasonSelect" className="text-base">Revocation Reason</Label>
            <Select value={selectedReasonValue} onValueChange={setSelectedReasonValue} disabled={isConfirming}>
              <SelectTrigger id="revocationReasonSelect" className="w-full mt-1">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-60">
                {revocationReasons.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          {selectedReasonDetails && (
            <div className="mt-2 p-3 bg-muted/50 border rounded-md">
              <p className="text-sm font-medium text-foreground">{selectedReasonDetails.label}</p>
              <p className="text-xs text-muted-foreground">{selectedReasonDetails.description}</p>
            </div>
          )}

          {itemType === 'CA' && (
            <div className="pt-2 space-y-2">
                <Label htmlFor="ca-name-confirm" className="font-bold text-destructive">
                    To confirm, please type the CA name: <span className="font-mono bg-destructive/10 p-1 rounded-sm break-all">{itemName}</span>
                </Label>
                <Input
                    id="ca-name-confirm"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="Enter CA name to confirm"
                    disabled={isConfirming}
                    className="border-destructive focus-visible:ring-destructive"
                    autoComplete="off"
                />
            </div>
          )}

        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isConfirming}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={!selectedReasonValue || isConfirming || isCaRevocationAndUnconfirmed}>
            {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isConfirming ? 'Revoking...' : 'Confirm Revocation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
