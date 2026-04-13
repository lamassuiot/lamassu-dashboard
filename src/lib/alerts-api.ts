// src/lib/alerts-api.ts

'use client'; // This can be a client-side library function

import { get_ALERTS_API_BASE_URL } from './api-domains';
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


export async function fetchLatestAlerts(): Promise<ApiAlertEvent[]> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/events/latest`);

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to fetch alerts. HTTP error ${response.status}`;
    try {
      errorJson = await response.json();
      if (errorJson && errorJson.message) {
        errorMessage = `Failed to fetch alerts: ${errorJson.message}`;
      }
    } catch (e) {
      console.error("Failed to parse error response as JSON for alerts:", e);
    }
    throw new Error(errorMessage);
  }

  const data: ApiAlertEvent[] = await response.json();
  return data;
}

export async function fetchSystemSubscriptions(): Promise<ApiSubscription[]> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscriptions`);

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to fetch subscriptions. HTTP error ${response.status}`;
     try {
      errorJson = await response.json();
      if (errorJson && errorJson.message) {
        errorMessage = `Failed to fetch subscriptions: ${errorJson.message}`;
      }
    } catch (e) {
      console.error("Failed to parse error response as JSON for subscriptions:", e);
    }
    throw new Error(errorMessage);
  }

  const data: ApiSubscription[] = await response.json();
  return data;
}

export async function subscribeToAlert(payload: SubscriptionPayload): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to subscribe. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Subscription failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      console.error("Failed to parse error response as JSON for subscription:", e);
    }
    throw new Error(errorMessage);
  }
}

export async function updateSubscription(subscriptionId: string, payload: SubscriptionPayload): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to update subscription. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) {
      console.error("Failed to parse error response as JSON for subscription update:", e);
    }
    throw new Error(errorMessage);
  }
}

export async function unsubscribeFromAlert(subscriptionId: string): Promise<void> {
  const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/unsubscribe/${subscriptionId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to unsubscribe. HTTP error ${response.status}`;
    try {
      errorJson = await response.json();
      if (errorJson && errorJson.message) {
        errorMessage = `Failed to unsubscribe: ${errorJson.message}`;
      }
    } catch (e) {
      console.error("Failed to parse error response as JSON for unsubscribe:", e);
    }
    throw new Error(errorMessage);
  }
}
