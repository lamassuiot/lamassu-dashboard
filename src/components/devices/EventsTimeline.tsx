'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Loader2, RefreshCw, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDeviceEvents, type DeviceEvent } from '@/lib/devices-api';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface EventsTimelineProps {
  deviceId: string;
  onCreateEvent: () => void;
}

const eventTypeColors: Record<string, string> = {
  'lamassu.io/device-event/lifecycle/status/update': 'bg-blue-100 text-blue-700 dark:bg-blue-700/30 dark:text-blue-300',
  'lamassu.io/device-event/idslot/status/update': 'bg-purple-100 text-purple-700 dark:bg-purple-700/30 dark:text-purple-300',
  'lamassu.io/device-event/idslot/shadow/update': 'bg-amber-100 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300',
  'default': 'bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300',
};

const getEventTypeColor = (eventType?: string): string => {
  if (!eventType) return eventTypeColors['default'];
  return eventTypeColors[eventType] || eventTypeColors['default'];
};

const getEventTypeName = (eventType?: string): string => {
  if (!eventType) return 'Unknown';
  const parts = eventType.split('/');
  return parts[parts.length - 1] || eventType;
};

export function EventsTimeline({ deviceId, onCreateEvent }: EventsTimelineProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalEvents, setTotalEvents] = useState(0);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(false);

  // Expanded events for JSON viewer
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const loadEvents = async (resetPage = false) => {
    if (!isAuthenticated() || !user?.access_token) {
      setError('User not authenticated');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const currentPage = resetPage ? 1 : page;
      params.set('page', currentPage.toString());
      params.set('page_size', pageSize.toString());
      params.set('sort', 'timestamp'); // Sort by oldest first

      const response = await fetchDeviceEvents(deviceId, user.access_token, params);
      
      if (resetPage) {
        setEvents(response.list || []);
        setPage(1);
      } else {
        setEvents(prev => [...prev, ...(response.list || [])]);
      }
      
      setTotalEvents(response.list?.length || 0);
      setHasMore(!!response.next);

    } catch (err: any) {
      setError(err.message || 'Failed to load events');
      toast({
        title: 'Error',
        description: err.message || 'Failed to load events',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, pageSize]);

  const handleRefresh = () => {
    loadEvents(true);
  };

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
    loadEvents(false);
  };

  const toggleEventExpanded = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const handleExportEvents = () => {
    // Export events as JSON
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `device-${deviceId}-events-${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Export Complete',
      description: `Exported ${events.length} events`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Events Timeline</h3>
          <Badge variant="secondary">{totalEvents} total</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportEvents}
            disabled={!events || events.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Events List */}
      {isLoading && (!events || events.length === 0) ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading events...</p>
          </div>
        </div>
      ) : error && (!events || events.length === 0) ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-destructive">
              <p>Error: {error}</p>
            </div>
          </CardContent>
        </Card>
      ) : !events || events.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No events found for this device.</p>
              <p className="text-sm mt-1">Create a new event to get started.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative space-y-4">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

            {events.map((event, index) => {
              const isExpanded = expandedEvents.has(event.id);
              return (
                <Card key={event.id} className="relative ml-10">
                  {/* Timeline dot */}
                  <div className="absolute -left-[26px] top-6 h-3 w-3 rounded-full bg-primary border-2 border-background" />

                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div>
                          <h3 className="font-semibold text-sm">{event.type || 'Unknown Event'}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {event.source && (
                              <p className="text-xs text-muted-foreground">{event.source}</p>
                            )}
                            {event.slot_id && (
                              <>
                                {event.source && <span className="text-xs text-muted-foreground/50">•</span>}
                                <p className="text-xs text-muted-foreground font-mono">Slot {event.slot_id}</p>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="font-medium text-sm leading-relaxed">{event.message}</p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap text-right">
                        <div>{format(parseISO(event.timestamp), 'MMM d, yyyy HH:mm:ss')}</div>
                        <div className="text-xs opacity-75">{formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true })}</div>
                      </div>
                    </div>
                  </CardHeader>

                  {event.structured_field && (
                    <CardContent className="pt-0">
                      <Collapsible open={isExpanded} onOpenChange={() => toggleEventExpanded(event.id)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 text-xs">
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3 mr-1" />
                                Hide Details
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3 mr-1" />
                                Show Details
                              </>
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                            {JSON.stringify(event.structured_field, null, 2)}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>Load More Events</>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
