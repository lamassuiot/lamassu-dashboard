
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Edit } from 'lucide-react';
import type { ApiSubscription } from '@/lib/alerts-api';
import { DetailItem } from '../shared/DetailItem';
import { CodeBlock } from '../shared/CodeBlock';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface SubscriptionDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  subscription: ApiSubscription | null;
  onDelete: (subscriptionId: string) => void;
  onEdit: (subscription: ApiSubscription) => void;
  isDeleting: boolean;
  presentation?: 'dialog' | 'inline';
  className?: string;
}

export const SubscriptionDetailsModal: React.FC<SubscriptionDetailsModalProps> = ({
  isOpen,
  onOpenChange,
  subscription,
  onDelete,
  onEdit,
  isDeleting,
  presentation = 'dialog',
  className,
}) => {
  if (!subscription) return null;
  const webhookUrl = subscription.channel.config.webhook_url || subscription.channel.config.url;
  const webhookMethod = subscription.channel.config.webhook_method || subscription.channel.config.method;

  const handleDelete = () => {
    onDelete(subscription.id);
  }

  const handleEdit = () => {
    onEdit(subscription);
  }

  const getConditionContent = (conditionType: string, conditionValue: string): string => {
    if (conditionType === 'JSON-SCHEMA') {
      try {
        // It's a schema, so it should be valid JSON. Let's prettify it.
        return JSON.stringify(JSON.parse(conditionValue), null, 2);
      } catch (e) {
        console.error("Failed to parse condition value as JSON:", e);
        // If it's not valid JSON for some reason, show the raw string.
        return conditionValue;
      }
    }
    // For other types like JAVASCRIPT or JSON-PATH, just show the raw string.
    return conditionValue;
  };

  const panelContent = (
    <>
      <div className="border-b p-6 pb-4">
        <h2 className="text-lg font-semibold">Subscription Details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Viewing details for subscription: <span className="font-mono text-xs">{subscription.id}</span>
        </p>
      </div>

      <ScrollArea className="max-h-[60vh] flex-1 p-6 pt-4">
        <div className="space-y-4 py-2 pr-2">
          <DetailItem label="Event Type" value={<Badge variant="secondary">{subscription.event_type}</Badge>} />
          <DetailItem label="Subscribed On" value={format(parseISO(subscription.subscription_ts), 'PPpp')} />

          <h4 className="mt-2 border-t pt-2 font-semibold text-foreground">Channel</h4>
          <DetailItem label="Type" value={subscription.channel.type} />
          <DetailItem label="Name" value={subscription.channel.name} />
          {subscription.channel.config.email && <DetailItem label="Email" value={subscription.channel.config.email} />}
          {webhookUrl && <DetailItem label="URL" value={webhookUrl} isMono />}
          {webhookMethod && <DetailItem label="Method" value={webhookMethod} />}

          {subscription.conditions && subscription.conditions.length > 0 ? (
            <>
              <h4 className="mt-2 border-t pt-2 font-semibold text-foreground">Conditions</h4>
              {subscription.conditions.map((cond, index) => (
                <div key={index} className="space-y-2">
                  <DetailItem label="Type" value={<Badge variant="outline">{cond.type}</Badge>} />
                  <CodeBlock content={getConditionContent(cond.type, cond.condition)} title="Condition" />
                </div>
              ))}
            </>
          ) : (
            <>
              <h4 className="mt-2 border-t pt-2 font-semibold text-foreground">Conditions</h4>
              <p className="text-sm text-muted-foreground">No conditions applied to this subscription.</p>
            </>
          )}
        </div>
      </ScrollArea>

      <div className="flex w-full items-center justify-between gap-2 border-t p-6 pt-4">
        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Unsubscribe
        </Button>
        <div className="flex space-x-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="default" onClick={handleEdit}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </Button>
        </div>
      </div>
    </>
  );

  if (presentation === 'inline') {
    if (!isOpen) return null;

    return (
      <div className="flex h-full min-h-[540px] flex-col rounded-lg border bg-background">
        {panelContent}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-xl', className)}>
        <DialogHeader className="sr-only">
          <DialogTitle>Subscription Details</DialogTitle>
          <DialogDescription>
            Viewing details for subscription: {subscription.id}
          </DialogDescription>
        </DialogHeader>
        {panelContent}
        <DialogFooter className="sr-only">
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
