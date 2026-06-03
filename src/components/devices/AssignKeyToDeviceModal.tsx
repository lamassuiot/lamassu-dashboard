'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, KeyRound, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { assignKeyToDevice } from '@/lib/device-inventory-api';
import { fetchSymmetricKeys, type SymmetricKey } from '@/lib/symkms-api';
import type { AssignKeyToDeviceRequest } from '@/types/device-inventory';

interface AssignKeyToDeviceModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  onSuccess: () => void;
}



export const AssignKeyToDeviceModal: React.FC<AssignKeyToDeviceModalProps> = ({
  isOpen,
  onOpenChange,
  deviceId,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [availableKeys, setAvailableKeys] = useState<SymmetricKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const loadKeys = useCallback(async () => {
    if (!user?.access_token) return;
    setIsLoadingKeys(true);
    try {
      const userId = user.profile?.sub || user.profile?.email || 'default-user';
      const response = await fetchSymmetricKeys(userId, user.access_token, { pageSize: 100 });
      setAvailableKeys(response.list);
    } catch (err) {
      console.error('Failed to load symmetric keys:', err);
      toast({
        title: 'Error',
        description: 'Failed to load available symmetric keys.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingKeys(false);
    }
  }, [user?.access_token, toast]);

  useEffect(() => {
    if (isOpen) {
      loadKeys();
      setSelectedKeyId('');
      setPurpose('');
      setExpiresAt('');
    }
  }, [isOpen, loadKeys]);

  const handleAssign = async () => {
    if (!user?.access_token || !selectedKeyId) return;

    const effectivePurpose = purpose.trim();
    if (!effectivePurpose) {
      toast({
        title: 'Validation Error',
        description: 'Please specify a purpose for the key assignment.',
        variant: 'destructive',
      });
      return;
    }

    setIsAssigning(true);
    try {
      const request: AssignKeyToDeviceRequest = {
        purpose: effectivePurpose,
      };
      if (expiresAt) {
        request.expires_at = new Date(expiresAt).toISOString();
      }

      await assignKeyToDevice(deviceId, selectedKeyId, request, user.access_token);

      toast({
        title: 'Key Assigned',
        description: `Key "${selectedKeyId}" has been assigned to device "${deviceId}" with purpose "${effectivePurpose}".`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Assignment Failed',
        description: err.message || 'An error occurred while assigning the key.',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Assign Key to Device
          </DialogTitle>
          <DialogDescription>
            Assign a symmetric key to device <strong>{deviceId}</strong> with a specific purpose.
            This binds the key under the device&apos;s inventory for <strong>per-device</strong> encryption.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            This creates a binding under the <strong>device serial</strong> (<code className="text-xs">{deviceId}</code>).
            For <strong>shared-mode</strong> SWU encryption the binding must be under the <strong>user ID</strong> instead &mdash;
            use the encryption settings in the SWU creation form, which handles this automatically.
          </span>
        </div>

        <div className="space-y-4 py-4">
          {/* Key Selection */}
          <div className="space-y-2">
            <Label htmlFor="key-select">Symmetric Key</Label>
            {isLoadingKeys ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading available keys...
              </div>
            ) : (
              <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                <SelectTrigger id="key-select">
                  <SelectValue placeholder="Select a symmetric key..." />
                </SelectTrigger>
                <SelectContent>
                  {availableKeys.map((key) => (
                    <SelectItem key={key.id} value={key.id}>
                      {key.id} ({key.algorithm})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isLoadingKeys && availableKeys.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No symmetric keys available. Create one first in the Symmetric Keys section.
              </p>
            )}
          </div>

          {/* Purpose */}
          <div className="space-y-2">
            <Label htmlFor="purpose-input">Purpose</Label>
            <Input
              id="purpose-input"
              placeholder="e.g. ASCON-DEMO, firmware-encryption"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Free-form label identifying this key binding.
              For per-device SWU encryption, each device needs a binding with the same purpose.
            </p>
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <Label htmlFor="expires-at">Expires At (optional)</Label>
            <Input
              id="expires-at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for no expiration.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAssigning}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={isAssigning || !selectedKeyId || !purpose.trim()}
          >
            {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
