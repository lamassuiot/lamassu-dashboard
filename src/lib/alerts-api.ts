// src/lib/alerts-api.ts

'use client'; // This can be a client-side library function

import { get_ALERTS_API_BASE_URL } from './api-domains';

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


export async function fetchLatestAlerts(accessToken: string): Promise<ApiAlertEvent[]> {
  const response = await fetch(`${get_ALERTS_API_BASE_URL()}/events/latest`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

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

export async function fetchSystemSubscriptions(accessToken: string): Promise<ApiSubscription[]> {
  const response = await fetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscriptions`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

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

export async function subscribeToAlert(payload: SubscriptionPayload, accessToken: string): Promise<void> {
  const response = await fetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to subscribe. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Subscription failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) { /* ignore json parse error */ }
    throw new Error(errorMessage);
  }
}

export async function updateSubscription(subscriptionId: string, payload: SubscriptionPayload, accessToken: string): Promise<void> {
  const response = await fetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorJson;
    let errorMessage = `Failed to update subscription. Status: ${response.status}`;
    try {
      errorJson = await response.json();
      errorMessage = `Update failed: ${errorJson.err || errorJson.message || 'Unknown error'}`;
    } catch (e) { /* ignore json parse error */ }
    throw new Error(errorMessage);
  }
}

export async function unsubscribeFromAlert(subscriptionId: string, accessToken: string): Promise<void> {
  const response = await fetch(`${get_ALERTS_API_BASE_URL()}/user/_lms_system/unsubscribe/${subscriptionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
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
      // Ignore parsing error
    }
    throw new Error(errorMessage);
  }
}
