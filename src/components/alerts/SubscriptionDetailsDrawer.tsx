'use client';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil } from 'lucide-react';
import type { ApiSubscription } from '@/lib/alerts-api';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { format, parseISO } from 'date-fns';

interface SubscriptionDetailsDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  subscription: ApiSubscription | null;
  onDelete: (subscriptionId: string) => void;
  onEdit: (subscription: ApiSubscription) => void;
  isDeleting: boolean;
}

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

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold text-foreground">{children}</h3>
);

export const SubscriptionDetailsDrawer: React.FC<SubscriptionDetailsDrawerProps> = ({
  isOpen,
  onOpenChange,
  subscription,
  onDelete,
  onEdit,
  isDeleting,
}) => {
  const webhookUrl = subscription?.channel.config.webhook_url || subscription?.channel.config.url;
  const webhookMethod = subscription?.channel.config.webhook_method || subscription?.channel.config.method;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 data-[side=right]:w-full data-[side=right]:sm:w-[60vw] data-[side=right]:lg:w-[40vw] data-[side=right]:sm:max-w-none"
      >
        <SheetHeader className="border-b px-6 py-5 pr-14 text-left">
          <SheetTitle>Subscription Details</SheetTitle>
          <SheetDescription>
            {subscription ? <span className="font-mono text-xs">{subscription.id}</span> : 'No subscription selected.'}
          </SheetDescription>
        </SheetHeader>

        {subscription && (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
            <section className="space-y-1">
              <SectionTitle>General</SectionTitle>
              <DetailInfoRows>
                <DetailInfoRow label="Event Type" value={<Badge variant="secondary">{subscription.event_type}</Badge>} />
                <DetailInfoRow label="Subscribed On" value={format(parseISO(subscription.subscription_ts), 'PPpp')} />
              </DetailInfoRows>
            </section>

            <section className="space-y-1">
              <SectionTitle>Channel</SectionTitle>
              <DetailInfoRows>
                <DetailInfoRow label="Type" value={<Badge variant="secondary">{subscription.channel.type}</Badge>} />
                <DetailInfoRow label="Name" value={subscription.channel.name} />
                {subscription.channel.config.email && <DetailInfoRow label="Email" value={subscription.channel.config.email} />}
                {webhookUrl && <DetailInfoRow label="URL" value={<span className="font-mono text-xs">{webhookUrl}</span>} />}
                {webhookMethod && <DetailInfoRow label="Method" value={webhookMethod} />}
              </DetailInfoRows>
            </section>

            <section className="space-y-3">
              <SectionTitle>Conditions</SectionTitle>
              {subscription.conditions && subscription.conditions.length > 0 ? (
                subscription.conditions.map((cond, index) => (
                  <div key={index} className="space-y-2">
                    <Badge variant="secondary">{cond.type}</Badge>
                    <CodeBlock content={getConditionContent(cond.type, cond.condition)} title="Condition" />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No conditions applied to this subscription.</p>
              )}
            </section>
          </div>
        )}

        <SheetFooter className="flex-row items-center justify-between border-t px-6 py-4">
          <Button variant="destructive" onClick={() => subscription && onDelete(subscription.id)} disabled={!subscription || isDeleting}>
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Unsubscribe
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={() => subscription && onEdit(subscription)} disabled={!subscription}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
