'use client';

import React, { useEffect, useState } from 'react';
import { History, Loader2, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { MerkleTreeExplorer } from '@/components/audit-logs/MerkleTreeExplorer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import {
  appendEvent,
  verifyEvent,
  type LegacyAuditEvent,
  type VerifyEventResponse,
} from '@/lib/audit-logs-api';

interface AppendDialogProps {
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  open: boolean;
}

function AppendEventDialog({ open, onOpenChange, onSuccess }: AppendDialogProps) {
  const [form, setForm] = useState<LegacyAuditEvent>({ type: '', user_id: '', resource: '', timestamp: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.type || !form.user_id || !form.resource) {
      sileo.error({
        title: 'Validation Error',
        description: 'Type, User ID, and Resource are required.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: LegacyAuditEvent = {
        type: form.type,
        user_id: form.user_id,
        resource: form.resource,
      };

      if (form.timestamp) payload.timestamp = form.timestamp;

      const result = await appendEvent(payload);
      sileo.success({
        title: 'Event Appended',
        description: `Tree size is now ${result.tree_size}.`,
      });
      setForm({ type: '', user_id: '', resource: '', timestamp: '' });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      sileo.error({
        title: 'Failed to Append',
        description: err instanceof Error ? err.message : 'Unexpected error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = (id: keyof LegacyAuditEvent, label: string, placeholder: string, required = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`append-${id}`}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={`append-${id}`}
        placeholder={placeholder}
        value={form[id] ?? ''}
        onChange={(inputEvent) => setForm((current) => ({ ...current, [id]: inputEvent.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Append Audit Event</DialogTitle>
          <DialogDescription>
            Add a new immutable event to the Merkle log. Fields are committed in canonical order.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {field('type', 'Event Type', 'e.g. LOGIN, DATA_ACCESS', true)}
          {field('user_id', 'User ID', 'Actor who performed the action', true)}
          {field('resource', 'Resource', 'e.g. /records/patient-42', true)}
          {field('timestamp', 'Timestamp (optional)', 'RFC 3339 — leave blank for server time')}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Append
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface VerifyDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  prefill?: LegacyAuditEvent | null;
}

function VerifyEventDialog({ open, onOpenChange, prefill }: VerifyDialogProps) {
  const [form, setForm] = useState<LegacyAuditEvent>({ type: '', user_id: '', resource: '', timestamp: '' });
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyEventResponse | null>(null);

  useEffect(() => {
    if (open && prefill) {
      setForm({
        type: prefill.type,
        user_id: prefill.user_id,
        resource: prefill.resource,
        timestamp: prefill.timestamp ?? '',
      });
      setResult(null);
    }

    if (!open) {
      setResult(null);
      setForm({ type: '', user_id: '', resource: '', timestamp: '' });
    }
  }, [open, prefill]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.type || !form.user_id || !form.resource) {
      sileo.error({
        title: 'Validation Error',
        description: 'Type, User ID, and Resource are required.',
      });
      return;
    }

    setIsVerifying(true);
    setResult(null);

    try {
      const payload: LegacyAuditEvent = {
        type: form.type,
        user_id: form.user_id,
        resource: form.resource,
      };

      if (form.timestamp) payload.timestamp = form.timestamp;

      setResult(await verifyEvent(payload));
    } catch (err) {
      sileo.error({
        title: 'Verification Failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const field = (id: keyof LegacyAuditEvent, label: string, placeholder: string, required = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`verify-${id}`}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={`verify-${id}`}
        placeholder={placeholder}
        value={form[id] ?? ''}
        onChange={(inputEvent) => setForm((current) => ({ ...current, [id]: inputEvent.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify Event Inclusion</DialogTitle>
          <DialogDescription>
            Cryptographically verify that an event exists in the current log. The exact bytes must
            match what was originally appended.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerify} className="space-y-4">
          {field('type', 'Event Type', 'LOGIN', true)}
          {field('user_id', 'User ID', 'actor-user-id', true)}
          {field('resource', 'Resource', '/records/patient-42', true)}
          {field('timestamp', 'Timestamp', 'RFC 3339 — only if included when appended')}

          {result && (
            <div
              className={cn(
                'space-y-1 rounded-md border p-3',
                result.verified ? 'border-chart-2/40 bg-chart-2/10' : 'border-destructive/40 bg-destructive/10',
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                {result.verified ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-chart-2" />
                    Event verified
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    Not verified
                  </>
                )}
              </div>
              {result.verified && result.leaf_index !== undefined && (
                <p className="text-xs text-muted-foreground">Leaf index: {result.leaf_index}</p>
              )}
              {!result.verified && result.detail && (
                <p className="text-xs text-destructive">{result.detail}</p>
              )}
              <p className="font-mono text-xs text-muted-foreground">Tree size: {result.tree_size}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={isVerifying}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AuditLogsPage() {
  const [isAppendOpen, setIsAppendOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="w-full space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-headline font-semibold">Audit Logs</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tamper-evident audit log backed by a Trillian Merkle tree. Proofs and hashes are
              shown exactly as returned by the API.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setIsVerifyOpen(true)} variant="outline" size="sm">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Verify Event
          </Button>
          <Button onClick={() => setIsAppendOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Append Event
          </Button>
        </div>
      </div>

      <MerkleTreeExplorer refreshToken={refreshToken} />

      <AppendEventDialog
        open={isAppendOpen}
        onOpenChange={setIsAppendOpen}
        onSuccess={() => setRefreshToken((current) => current + 1)}
      />
      <VerifyEventDialog open={isVerifyOpen} onOpenChange={setIsVerifyOpen} />
    </div>
  );
}
