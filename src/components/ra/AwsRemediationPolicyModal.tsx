
'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

interface AwsRemediationPolicyModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (accountId: string) => void;
  defaultAccountId?: string;
}

export const AwsRemediationPolicyModal: React.FC<AwsRemediationPolicyModalProps> = ({
  isOpen,
  onOpenChange,
  onConfirm,
  defaultAccountId = '',
}) => {
  const [accountId, setAccountId] = useState(defaultAccountId);

  useEffect(() => {
    if (isOpen) {
      setAccountId(defaultAccountId);
    }
  }, [isOpen, defaultAccountId]);

  const accountIdError = !accountId.trim()
    ? 'AWS Account ID required. Enter the account that will own the remediation policy.'
    : null;

  const handleConfirmClick = () => {
    if (accountIdError) return;
    onConfirm(accountId.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" />
            Add Remediation Policy
          </DialogTitle>
          <DialogDescription>
            Enter the AWS Account ID to generate the required permissions policy for device shadow management.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-4">
          <Label htmlFor="aws-account-id">AWS Account ID</Label>
          <Input
            id="aws-account-id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="e.g., 123456789012"
            aria-invalid={!!accountIdError}
            aria-describedby={accountIdError ? 'aws-account-id-error' : undefined}
          />
          {accountIdError && (
            <FormFieldError
              id="aws-account-id-error"
              title="AWS Account ID required."
              description="Enter the account that will own the remediation policy."
            />
          )}
        </div>
        <FormValidationSummary errors={accountIdError ? [accountIdError] : []} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirmClick} disabled={!!accountIdError}>
            Generate & Add Policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
