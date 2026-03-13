
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, Info, Loader2, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { fetchLatestAlerts, fetchSystemSubscriptions, unsubscribeFromAlert, type ApiSubscription } from '@/lib/alerts-api';
import { AlertsTable } from '@/components/alerts/AlertsTable';
import { sileo } from '@/lib/toast';
import { SubscribeToAlertModal } from '@/components/alerts/SubscribeToAlertModal';
import { SubscriptionDetailsModal } from '@/components/alerts/SubscriptionDetailsModal';
import { AuditUserInfoPanel } from '@/components/alerts/AuditUserInfoPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import { SplitPanelLayout } from '@/components/shared/SplitPanelLayout';


// This is the structure the UI component expects.
export interface AlertEvent {
  id: string; // Will be mapped from event_types
  type: string; // Will be mapped from event_types
  lastSeen: string; // Will be mapped from seen_at
  eventCounter: number; // Will be mapped from counter
  activeSubscriptions: { id: string, display: string }[]; // Updated to include subscription ID
  payload: object; // Will be mapped from event
}

// Sorting state
export type SortableAlertColumn = 'type' | 'lastSeen' | 'eventCounter';
export type SortDirection = 'asc' | 'desc';
export interface AlertSortConfig {
    column: SortableAlertColumn;
    direction: SortDirection;
}

type RightPanelMode = 'subscribe' | 'audit-user' | 'subscription-details' | null;

type EventCategoryFilter = 'AUDIT' | 'API';

const EVENT_CATEGORY_OPTIONS: { label: string; value: EventCategoryFilter }[] = [
  { label: 'Audit Events', value: 'AUDIT' },
  { label: 'API Events', value: 'API' },
];

const getEventCategory = (event: AlertEvent): EventCategoryFilter => {
  const eventType = event.type.toLowerCase();
  return eventType.startsWith('audit.') ? 'AUDIT' : 'API';
};

export default function AlertsPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<ApiSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sorting and Filtering state
  const [sortConfig, setSortConfig] = useState<AlertSortConfig>({ column: 'lastSeen', direction: 'desc' });
  const [filterText, setFilterText] = useState('');
  const [showWithSubscriptionsOnly, setShowWithSubscriptionsOnly] = useState(false);
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategoryFilter[]>(
    EVENT_CATEGORY_OPTIONS.map((option) => option.value)
  );
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // State for the new subscription modal
  const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);
  const [eventTypeToSubscribe, setEventTypeToSubscribe] = useState<string | null>(null);
  const [samplePayloadToSubscribe, setSamplePayloadToSubscribe] = useState<object | null>(null);
  const [subscriptionToEdit, setSubscriptionToEdit] = useState<ApiSubscription | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>(null);
  const [auditEventForUserInfo, setAuditEventForUserInfo] = useState<AlertEvent | null>(null);


  const [selectedSubscriptionForDetails, setSelectedSubscriptionForDetails] = useState<ApiSubscription | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);


  const performUnsubscribe = async (subscriptionId: string) => {
    if (!user?.access_token) {
        sileo.error({ title: 'Authentication Error', description: 'You must be logged in to unsubscribe.' });
        return;
    }
    
    setIsDeleting(true);

    try {
        await unsubscribeFromAlert(subscriptionId, user.access_token);
        
        sileo.success({ title: 'Success', description: 'You have been unsubscribed from the alert.' });
        
        if (rightPanelMode === 'subscription-details') {
          setRightPanelMode(null);
          setSelectedSubscriptionForDetails(null);
        }
        
        loadAlertsData(); // Re-sync with the server
    } catch (e: any) {
        sileo.error({ title: 'Unsubscribe Failed', description: e.message });
    } finally {
        setIsDeleting(false);
    }
  };
  
  const handleOpenSubscribeModal = (event: AlertEvent) => {
    setSubscriptionToEdit(null); // Ensure we are in "create" mode
    setEventTypeToSubscribe(event.type);
    setSamplePayloadToSubscribe(event.payload);
    setIsSubscribeModalOpen(true);
    setRightPanelMode('subscribe');
  };
  
  const handleOpenEditModal = (subscription: ApiSubscription) => {
    const associatedEvent = events.find(e => e.type === subscription.event_type);
    setSubscriptionToEdit(subscription);
    setEventTypeToSubscribe(subscription.event_type);
    setSamplePayloadToSubscribe(associatedEvent?.payload || {});
    setSelectedSubscriptionForDetails(null);
    setIsSubscribeModalOpen(true); // Open subscribe modal in edit mode
    setRightPanelMode('subscribe');
  };
  
  const handleSubscriptionSuccess = () => {
    setIsSubscribeModalOpen(false);
    setRightPanelMode(null);
    setEventTypeToSubscribe(null);
    setSamplePayloadToSubscribe(null);
    setSubscriptionToEdit(null);
    sileo.success({ title: "Success!", description: "Subscription details saved." });
    loadAlertsData(); // Refresh data to show new subscription
  }

  const handleSubscribePanelOpenChange = (isOpen: boolean) => {
    setIsSubscribeModalOpen(isOpen);

    if (!isOpen) {
      setRightPanelMode(null);
      setEventTypeToSubscribe(null);
      setSamplePayloadToSubscribe(null);
      setSubscriptionToEdit(null);
    } else {
      setRightPanelMode('subscribe');
    }
  };

  const handleOpenAuditUserInfo = (event: AlertEvent) => {
    setAuditEventForUserInfo(event);
    setIsSubscribeModalOpen(false);
    setRightPanelMode('audit-user');
  };

  const handleCloseRightPanel = () => {
    setRightPanelMode(null);
    setIsSubscribeModalOpen(false);
    setAuditEventForUserInfo(null);
    setSelectedSubscriptionForDetails(null);
    setEventTypeToSubscribe(null);
    setSamplePayloadToSubscribe(null);
    setSubscriptionToEdit(null);
  };

  const handleViewSubscriptionDetails = (subscriptionId: string) => {
    const sub = allSubscriptions.find(s => s.id === subscriptionId);
    if (sub) {
      setSelectedSubscriptionForDetails(sub);
      setIsSubscribeModalOpen(false);
      setAuditEventForUserInfo(null);
      setRightPanelMode('subscription-details');
    } else {
      sileo.error({ title: 'Error', description: 'Could not find subscription details.'});
    }
  };

  const handleDetailsPanelOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setRightPanelMode(null);
      setSelectedSubscriptionForDetails(null);
      return;
    }

    setRightPanelMode('subscription-details');
  };


  const loadAlertsData = useCallback(async () => {
    if (!isAuthenticated() || !user?.access_token) {
        if (!authLoading) setError("User not authenticated.");
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [apiEvents, apiSubscriptions] = await Promise.all([
        fetchLatestAlerts(user.access_token),
        fetchSystemSubscriptions(user.access_token),
      ]);
      
      setAllSubscriptions(apiSubscriptions);

      const subscriptionsMap = new Map<string, { id: string, display: string }[]>();
      for (const sub of apiSubscriptions) {
        if (!subscriptionsMap.has(sub.event_type)) {
          subscriptionsMap.set(sub.event_type, []);
        }
        
        let displayValue: string = sub.channel.type;
        const webhookUrl = sub.channel.config.webhook_url || sub.channel.config.url;
        if (sub.channel.type === 'EMAIL' && sub.channel.config.email) {
          displayValue = `${sub.channel.type}: ${sub.channel.config.email}`;
        } else if ((sub.channel.type === 'WEBHOOK' || sub.channel.type === 'TEAMS_WEBHOOK') && sub.channel.name) {
          displayValue = `${sub.channel.type}: ${sub.channel.name}`;
        } else if (webhookUrl) {
          try {
            displayValue = `${sub.channel.type}: ${new URL(webhookUrl).hostname}`;
          } catch {
            displayValue = `${sub.channel.type}: ${webhookUrl}`;
          }
        }
        
        const subscriptionDisplay = {
            id: sub.id,
            display: displayValue,
        };
        subscriptionsMap.get(sub.event_type)?.push(subscriptionDisplay);
      }

      const uiEvents = apiEvents.map((apiAlert): AlertEvent => ({
        id: apiAlert.event_types,
        type: apiAlert.event_types,
        lastSeen: apiAlert.seen_at,
        eventCounter: apiAlert.counter,
        activeSubscriptions: subscriptionsMap.get(apiAlert.event_types) || [],
        payload: apiAlert.event,
      }));

      setEvents(uiEvents);
    } catch (e: any) {
      setError(e.message || "Failed to load alert events or subscriptions.");
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, authLoading]);

  useEffect(() => {
    if (!authLoading) {
        loadAlertsData();
    }
  }, [loadAlertsData, authLoading]);

  const handleSort = (column: SortableAlertColumn) => {
    setSortConfig(currentConfig => ({
        column,
        direction: currentConfig.column === column && currentConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredAndSortedEvents = useMemo(() => {
    let processedEvents = [...events];

    if (eventCategoryFilter.length > 0) {
      processedEvents = processedEvents.filter((event) => eventCategoryFilter.includes(getEventCategory(event)));
    }

    // Filtering
    if (filterText) {
        processedEvents = processedEvents.filter(event =>
            event.type.toLowerCase().includes(filterText.toLowerCase())
        );
    }

    if (showWithSubscriptionsOnly) {
        processedEvents = processedEvents.filter(event => event.activeSubscriptions.length > 0);
    }

    // Sorting
    processedEvents.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.column) {
            case 'lastSeen':
                aValue = new Date(a.lastSeen).getTime();
                bValue = new Date(b.lastSeen).getTime();
                break;
            case 'eventCounter':
                aValue = a.eventCounter;
                bValue = b.eventCounter;
                break;
            case 'type':
            default:
                aValue = a.type.toLowerCase();
                bValue = b.type.toLowerCase();
                break;
        }
        
        if (aValue < bValue) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    return processedEvents;
  }, [events, filterText, showWithSubscriptionsOnly, sortConfig, eventCategoryFilter]);

  const totalPages = useMemo(() => Math.ceil(filteredAndSortedEvents.length / pageSize), [filteredAndSortedEvents.length, pageSize]);
  
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedEvents.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedEvents, currentPage, pageSize]);

  useEffect(() => {
      if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
      } else if (totalPages === 0 && currentPage !== 1) {
        setCurrentPage(1);
      }
  }, [totalPages, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, showWithSubscriptionsOnly, sortConfig, pageSize, eventCategoryFilter]);


  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Authenticating...</p>
      </div>
    );
  }

  return (
    <>
    <div className="w-full space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Info className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Alerts</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={loadAlertsData} variant="secondary" disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Monitor and get notified when operations are requested to the PKI.
      </p>

      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="w-full lg:w-auto lg:min-w-[240px] space-y-1.5">
            <Label htmlFor="event-category-filter">Filter by Source</Label>
            <MultiSelectDropdown
              id="event-category-filter"
              options={EVENT_CATEGORY_OPTIONS}
              allOptionValues={EVENT_CATEGORY_OPTIONS.map((option) => option.value)}
              selectedValues={eventCategoryFilter}
              onChange={setEventCategoryFilter as (selected: string[]) => void}
              buttonText="Filter by source..."
            />
          </div>

          <div className="flex-1 space-y-1.5">
              <Label htmlFor="alert-filter">Filter by Event Type</Label>
              <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                      id="alert-filter"
                      placeholder="e.g., ca_created"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      className="pl-10"
                  />
              </div>
          </div>

                  <div className="flex items-end pb-1 lg:pb-2">
            <div className="flex items-center space-x-2">
                <Checkbox id="show-with-subs" checked={showWithSubscriptionsOnly} onCheckedChange={(checked) => setShowWithSubscriptionsOnly(Boolean(checked))} />
                <Label htmlFor="show-with-subs" className="font-normal whitespace-nowrap">
                    Only show events with subscriptions
                </Label>
            </div>
          </div>
                </div>

      <SplitPanelLayout
        isPanelOpen={!!rightPanelMode}
        onPanelOpenChange={(isOpen) => {
          if (!isOpen) handleCloseRightPanel();
        }}
        mobilePanelAsDialog
        panel={
          rightPanelMode === 'subscribe' && isSubscribeModalOpen ? (
            <SubscribeToAlertModal
              isOpen={isSubscribeModalOpen}
              onOpenChange={handleSubscribePanelOpenChange}
              eventType={eventTypeToSubscribe}
              samplePayload={samplePayloadToSubscribe}
              onSuccess={handleSubscriptionSuccess}
              subscriptionToEdit={subscriptionToEdit}
              presentation="inline"
            />
          ) : rightPanelMode === 'audit-user' ? (
            <AuditUserInfoPanel event={auditEventForUserInfo} onClose={handleCloseRightPanel} />
          ) : rightPanelMode === 'subscription-details' ? (
            <SubscriptionDetailsModal
              isOpen={rightPanelMode === 'subscription-details' && !!selectedSubscriptionForDetails}
              onOpenChange={handleDetailsPanelOpenChange}
              subscription={selectedSubscriptionForDetails}
              onDelete={performUnsubscribe}
              onEdit={handleOpenEditModal}
              isDeleting={isDeleting}
              presentation="inline"
            />
          ) : null
        }
      >
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading events...</p>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Events</AlertTitle>
              <AlertDescription>
                {error}
                <Button variant="link" onClick={loadAlertsData} className="p-0 h-auto ml-1">Try again?</Button>
              </AlertDescription>
            </Alert>
          ) : filteredAndSortedEvents.length > 0 ? (
            <>
              <AlertsTable 
                  events={paginatedEvents} 
                  onSubscriptionClick={handleViewSubscriptionDetails} 
                  onSubscribe={handleOpenSubscribeModal}
                  onViewAuditUser={handleOpenAuditUserInfo}
                  sortConfig={sortConfig}
                  onSort={handleSort}
              />
              <div className="flex justify-between items-center mt-4">
                <div className="flex items-center space-x-2">
                    <Label htmlFor="pageSizeSelectAlerts" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                    <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                        <SelectTrigger id="pageSizeSelectAlerts" className="w-[80px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages > 0 ? totalPages : 1}
                    </span>
                    <Button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} variant="outline" size="sm">
                        <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <Button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} variant="outline" size="sm">
                        Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <h3 className="text-lg font-semibold text-muted-foreground">{filterText ? 'No Matching Events Found' : 'No Events Found'}</h3>
              <p className="text-sm text-muted-foreground">
                {filterText ? 'Try adjusting your filter.' : 'No system events have been recorded yet.'}
              </p>
            </div>
          )}
      </SplitPanelLayout>
    </div>
    </>
  );
}
