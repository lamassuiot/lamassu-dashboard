'use client';

import React, { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Check, Copy, Loader2, Mail, Pencil, Trash2, Users, Webhook } from 'lucide-react';
import type { ApiSubscription } from '@/lib/alerts-api';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface SubscriptionDetailsDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  subscription: ApiSubscription | null;
  onDelete: (subscriptionId: string) => void;
  onEdit: (subscription: ApiSubscription) => void;
  isDeleting: boolean;
}

const CHANNEL_META: Record<ApiSubscription['channel']['type'], { label: string; icon: React.ElementType }> = {
  EMAIL: { label: 'Email', icon: Mail },
  TEAMS_WEBHOOK: { label: 'Microsoft Teams', icon: Users },
  WEBHOOK: { label: 'Webhook', icon: Webhook },
};

const CONDITION_LABELS: Record<string, string> = {
  'JSON-PATH': 'JSON Path',
  'JSON-SCHEMA': 'JSON Schema',
  JAVASCRIPT: 'Javascript',
};

const getConditionContent = (conditionType: string, conditionValue: string): string => {
  if (conditionType === 'JSON-SCHEMA') {
    try {
      return JSON.stringify(JSON.parse(conditionValue), null, 2);
    } catch {
      // Not valid JSON for some reason, show the raw string.
      return conditionValue;
    }
  }
  // For other types like JAVASCRIPT or JSON-PATH, just show the raw string.
  return conditionValue;
};

const formatTimestamp = (value: string): string => {
  try {
    return format(parseISO(value), 'PPpp');
  } catch {
    return value;
  }
};

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

const DetailRow: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className="flex items-start justify-between gap-4 text-sm">
    <dt className="shrink-0 text-muted-foreground">{label}</dt>
    <dd className={cn('min-w-0 text-right font-medium break-words', className)}>{children}</dd>
  </div>
);

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      sileo.error({ title: 'Copy failed' });
    }
  };

  return (
    <Button variant="ghost" size="icon-xs" onClick={handleCopy} aria-label={label} title={label}>
      {copied ? <Check /> : <Copy />}
    </Button>
  );
};

export const SubscriptionDetailsDrawer: React.FC<SubscriptionDetailsDrawerProps> = ({
  isOpen,
  onOpenChange,
  subscription,
  onDelete,
  onEdit,
  isDeleting,
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setIsConfirmOpen(false);
  }, [isOpen]);

  const channel = subscription?.channel;
  const channelMeta = channel ? CHANNEL_META[channel.type] : null;
  const ChannelIcon = channelMeta?.icon ?? Webhook;
  const webhookUrl = channel?.config.webhook_url || channel?.config.url;
  const webhookMethod = channel?.config.webhook_method || channel?.config.method;
  const channelTarget = channel?.config.email || webhookUrl;
  const conditions = subscription?.conditions ?? [];

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-2/3 data-[side=right]:lg:w-1/2 data-[side=right]:xl:w-1/3 data-[side=right]:sm:max-w-none"
        >
          <SheetHeader className="border-b p-6 pr-14 text-left">
            <SheetTitle>Subscription details</SheetTitle>
            <SheetDescription>
              {subscription ? (
                <>Notifications sent when <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{subscription.event_type}</code> occurs.</>
              ) : (
                'No subscription selected.'
              )}
            </SheetDescription>
          </SheetHeader>

          {subscription && channel && (
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <Section title="Channel">
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <ChannelIcon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{channel.name || channelMeta?.label}</p>
                    {channelTarget && (
                      <p className="truncate text-sm text-muted-foreground" title={channelTarget}>{channelTarget}</p>
                    )}
                  </div>
                  <Badge variant="secondary">{channelMeta?.label ?? channel.type}</Badge>
                </div>
                {(webhookMethod || webhookUrl) && (
                  <dl className="space-y-3">
                    {webhookMethod && (
                      <DetailRow label="Method">
                        <Badge variant="muted" className="font-mono">{webhookMethod}</Badge>
                      </DetailRow>
                    )}
                    {webhookUrl && <DetailRow label="URL" className="break-all font-mono text-xs font-normal">{webhookUrl}</DetailRow>}
                  </dl>
                )}
              </Section>

              <Separator />

              <Section title="Details">
                <dl className="space-y-3">
                  <DetailRow label="Event type" className="font-mono text-xs">{subscription.event_type}</DetailRow>
                  <DetailRow label="Subscribed">{formatTimestamp(subscription.subscription_ts)}</DetailRow>
                  <DetailRow label="Subscription ID">
                    <span className="inline-flex max-w-full items-center gap-1">
                      <span className="truncate font-mono text-xs font-normal" title={subscription.id}>{subscription.id}</span>
                      <CopyButton value={subscription.id} label="Copy subscription ID" />
                    </span>
                  </DetailRow>
                </dl>
              </Section>

              <Separator />

              <Section
                title="Conditions"
                action={conditions.length > 0 ? <Badge variant="secondary">{conditions.length}</Badge> : undefined}
              >
                {conditions.length > 0 ? (
                  <div className="space-y-4">
                    {conditions.map((cond, index) => {
                      const content = getConditionContent(cond.type, cond.condition);
                      return (
                        <div key={index} className="overflow-hidden rounded-lg border">
                          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                            <span className="text-xs font-medium text-muted-foreground">{CONDITION_LABELS[cond.type] ?? cond.type}</span>
                            <CopyButton value={content} label="Copy condition" />
                          </div>
                          <pre className="max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                            {content}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No conditions. Every occurrence of this event triggers a notification.
                  </p>
                )}
              </Section>
            </div>
          )}

          <SheetFooter className="flex-row items-center justify-between border-t p-6">
            <Button variant="destructive" onClick={() => setIsConfirmOpen(true)} disabled={!subscription || isDeleting}>
              <Trash2 data-icon="inline-start" /> Unsubscribe
            </Button>
            <Button onClick={() => subscription && onEdit(subscription)} disabled={!subscription}>
              <Pencil data-icon="inline-start" /> Edit
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isConfirmOpen} onOpenChange={(open) => { if (!isDeleting) setIsConfirmOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubscribe from this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {channel?.name || channelMeta?.label} will stop receiving notifications for{' '}
              <span className="font-mono text-xs">{subscription?.event_type}</span>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                // Keep the dialog open (with its spinner) until the parent finishes and closes the drawer.
                event.preventDefault();
                if (subscription) onDelete(subscription.id);
              }}
            >
              {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Unsubscribing...</> : 'Unsubscribe'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
