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
    event_type: string;
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
            webhook_url?: string;
            webhook_method?: 'POST' | 'PUT';
            // Backward-compatible fields for existing persisted subscriptions.
            url?: string;
            method?: 'POST' | 'PUT';
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
            webhook_url?: string;
            webhook_method?: 'POST' | 'PUT';
        };
    };
}


export async function fetchLatestAlerts(_token: string | undefined, params?: URLSearchParams): Promise<ApiPaginatedResponse<ApiAlertEvent>> {
  const url = `${get_ALERTS_API_BASE_URL()}/events/latest${params ? `?${params}` : ''}`;
  const response = await apiFetch(url);
  const data = await handleApiError<ApiPaginatedResponse<ApiAlertEvent>>(response, 'Failed to fetch alerts');
  return data ?? { list: [], next: null };
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
  await handleApiError(response, 'Failed to subscribe');
}

export async function updateSubscription(subscriptionId: string, payload: SubscriptionPayload): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handleApiError(response, 'Failed to update subscription');
}

export async function unsubscribeFromAlert(subscriptionId: string): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/unsubscribe/${subscriptionId}`, {
    method: 'POST',
  });
  await handleApiError(response, 'Failed to unsubscribe');
}
