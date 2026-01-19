'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createDeviceEvent, type CreateDeviceEventPayload } from '@/lib/devices-api';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  onEventCreated: () => void;
}

const eventTypeSuggestions = [
  { value: 'lamassu.io/device-event/lifecycle/status/update', label: 'Lifecycle Status Update' },
  { value: 'lamassu.io/device-event/idslot/status/update', label: 'ID Slot Status Update' },
  { value: 'lamassu.io/device-event/idslot/shadow/update', label: 'Shadow Update' },
  { value: 'custom', label: 'Custom Event Type' },
];

export function CreateEventModal({ isOpen, onClose, deviceId, onEventCreated }: CreateEventModalProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eventType, setEventType] = useState('lamassu.io/device-event/lifecycle/status/update');
  const [customEventType, setCustomEventType] = useState('');
  const [message, setMessage] = useState('');
  const [timestamp, setTimestamp] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [slotId, setSlotId] = useState('');
  const [source, setSource] = useState('');
  const [structuredField, setStructuredField] = useState('');
  const [structuredFieldError, setStructuredFieldError] = useState<string | null>(null);

  const handleReset = () => {
    setEventType('lamassu.io/device-event/lifecycle/status/update');
    setCustomEventType('');
    setMessage('');
    setTimestamp(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setSlotId('');
    setSource('');
    setStructuredField('');
    setStructuredFieldError(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const validateStructuredField = (jsonString: string): boolean => {
    if (!jsonString.trim()) {
      setStructuredFieldError(null);
      return true;
    }

    try {
      JSON.parse(jsonString);
      setStructuredFieldError(null);
      return true;
    } catch (error) {
      setStructuredFieldError('Invalid JSON format');
      return false;
    }
  };

  const handleStructuredFieldChange = (value: string) => {
    setStructuredField(value);
    if (value.trim()) {
      validateStructuredField(value);
    } else {
      setStructuredFieldError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAuthenticated() || !user?.access_token) {
      toast({
        title: 'Error',
        description: 'You must be authenticated to create an event',
        variant: 'destructive',
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Message is required',
        variant: 'destructive',
      });
      return;
    }

    if (eventType === 'custom' && !customEventType.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Custom event type is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate structured field if provided
    if (structuredField.trim() && !validateStructuredField(structuredField)) {
      toast({
        title: 'Validation Error',
        description: 'Structured field must be valid JSON',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateDeviceEventPayload = {
        timestamp: new Date(timestamp).toISOString(),
        event_type: eventType === 'custom' ? customEventType : eventType,
        message: message.trim(),
      };

      if (slotId.trim()) {
        payload.slot_id = slotId.trim();
      }

      if (source.trim()) {
        payload.source = source.trim();
      }

      if (structuredField.trim()) {
        payload.structured_field = JSON.parse(structuredField);
      }

      await createDeviceEvent(deviceId, payload, user.access_token);

      toast({
        title: 'Event Created',
        description: 'Device event has been created successfully',
      });

      handleReset();
      onEventCreated();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create event',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Device Event</DialogTitle>
          <DialogDescription>
            Manually create a custom event for this device. All timestamps are in ISO 8601 format.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-type">Event Type *</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger id="event-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventTypeSuggestions.map((suggestion) => (
                  <SelectItem key={suggestion.value} value={suggestion.value}>
                    {suggestion.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {eventType === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="custom-event-type">Custom Event Type *</Label>
              <Input
                id="custom-event-type"
                placeholder="e.g., com.example/custom-event"
                value={customEventType}
                onChange={(e) => setCustomEventType(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Use a namespaced format like: domain/category/action
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="timestamp">Timestamp *</Label>
            <div className="relative">
              <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="timestamp"
                type="datetime-local"
                className="pl-8"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message *</Label>
            <Textarea
              id="message"
              placeholder="Describe what happened..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slot-id">Slot ID (Optional)</Label>
              <Input
                id="slot-id"
                placeholder="e.g., identity, tls-client"
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Source (Optional)</Label>
              <Input
                id="source"
                placeholder="e.g., manual, system"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="structured-field">Structured Field (Optional JSON)</Label>
            <Textarea
              id="structured-field"
              placeholder='{"key": "value", "status": "updated"}'
              value={structuredField}
              onChange={(e) => handleStructuredFieldChange(e.target.value)}
              rows={4}
              className={structuredFieldError ? 'border-destructive' : ''}
            />
            {structuredFieldError ? (
              <p className="text-xs text-destructive">{structuredFieldError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Optional JSON object for additional structured data
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !!structuredFieldError}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Event'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
