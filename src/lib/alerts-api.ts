// src/lib/alerts-api.ts

'use client'; // This can be a client-side library function

import { get_ALERTS_API_BASE_URL, handleApiError } from './api-domains';
import { apiFetch } from './api-client';

export interface ApiAlertEventData {
    specversion: string;
    id: string;
    source: string;
    type: string;
    datacontenttype: string;
    time: string;
    data: object;
}

export interface ApiAlertEvent {
    event_types: string;
    event: ApiAlertEventData;
    seen_at: string;
    counter: number;
}

export interface ApiPaginatedResponse<T> {
  next: string | null;
  list: T[];
}

export interface ApiSubscription {
    id: string;
    user_id: string;
    event_type: string;
    subscription_ts: string;
    conditions: {
        type: string;
        condition: string;
    }[];
    channel: {
        type: 'EMAIL' | 'WEBHOOK' | 'TEAMS_WEBHOOK';
        name: string;
        config: {
            email?: string;
            url?: string;
            method?: 'POST' | 'PUT';
            name?: string;
        };
    };
}

export interface SubscriptionPayload {
    event_type: string;
    conditions: {
        type: string;
        condition: string;
    }[];
    channel: {
        type: 'EMAIL' | 'WEBHOOK' | 'TEAMS_WEBHOOK';
        name: string;
        config: {
            email?: string;
            url?: string;
            method?: 'POST' | 'PUT';
            name?: string;
        };
    };
}


export async function fetchLatestAlerts(params?: URLSearchParams): Promise<ApiPaginatedResponse<ApiAlertEvent>> {
  const query = params && params.toString().length > 0 ? `?${params.toString()}` : '';
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/events/latest${query}`);
  return handleApiError(response, 'Failed to fetch alerts');
}

export async function fetchSystemSubscriptions(): Promise<ApiSubscription[]> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscriptions`);
  return handleApiError(response, 'Failed to fetch subscriptions');
}

export async function subscribeToAlert(payload: SubscriptionPayload): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await handleApiError(response, 'Subscription failed');
  }
}

export async function updateSubscription(subscriptionId: string, payload: SubscriptionPayload): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await handleApiError(response, 'Failed to update subscription');
  }
}

export async function unsubscribeFromAlert(subscriptionId: string): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/unsubscribe/${subscriptionId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    await handleApiError(response, 'Failed to unsubscribe');
  }
}
