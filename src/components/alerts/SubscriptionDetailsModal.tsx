
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

interface SubscriptionDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  subscription: ApiSubscription | null;
  onDelete: (subscriptionId: string) => void;
  onEdit: (subscription: ApiSubscription) => void;
  isDeleting: boolean;
}

export const SubscriptionDetailsModal: React.FC<SubscriptionDetailsModalProps> = ({
  isOpen,
  onOpenChange,
  subscription,
  onDelete,
  onEdit,
  isDeleting,
}) => {
  if (!subscription) return null;

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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Subscription Details</DialogTitle>
          <DialogDescription>
            Viewing details for subscription: <span className="font-mono text-xs">{subscription.id}</span>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4 py-4">
                <DetailItem label="Event Type" value={<Badge variant="secondary">{subscription.event_type}</Badge>} />
                <DetailItem label="Subscribed On" value={format(parseISO(subscription.subscription_ts), 'PPpp')} />
                
                <h4 className="font-semibold text-foreground pt-2 border-t mt-2">Channel</h4>
                <DetailItem label="Type" value={subscription.channel.type} />
                <DetailItem label="Name" value={subscription.channel.name} />
                {subscription.channel.config.email && <DetailItem label="Email" value={subscription.channel.config.email} />}
                {subscription.channel.config.url && <DetailItem label="URL" value={subscription.channel.config.url} isMono />}
                {subscription.channel.config.method && <DetailItem label="Method" value={subscription.channel.config.method} />}

                {subscription.conditions && subscription.conditions.length > 0 ? (
                    <>
                        <h4 className="font-semibold text-foreground pt-2 border-t mt-2">Conditions</h4>
                        {subscription.conditions.map((cond, index) => (
                            <div key={index} className="space-y-2">
                                <DetailItem label="Type" value={<Badge variant="outline">{cond.type}</Badge>} />
                                <CodeBlock content={getConditionContent(cond.type, cond.condition)} title="Condition" />
                            </div>
                        ))}
                    </>
                ) : (
                    <>
                        <h4 className="font-semibold text-foreground pt-2 border-t mt-2">Conditions</h4>
                        <p className="text-sm text-muted-foreground">No conditions applied to this subscription.</p>
                    </>
                )}
            </div>
        </ScrollArea>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            <div>
                 <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Unsubscribe
                </Button>
            </div>
            <div className="flex space-x-2">
                <DialogClose asChild>
                    <Button type="button" variant="outline">Close</Button>
                </DialogClose>
                <Button variant="default" onClick={handleEdit}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
