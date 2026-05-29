
'use client';

import { get_ALERTS_API_BASE_URL } from './api-domains';
import { apiFetch } from './api-client';

export interface ApiEventLog {
    id: string;
    event_type: string;
    category: 'audit' | 'general';
    received_at: string;
    expires_at?: string;
    event: object;
}

export interface ApiEventLogListResponse {
    list: ApiEventLog[];
    next: string | null;
}

export interface EventRetentionConfig {
    audit_event_ttl: string;
}

export interface EventLogFilters {
    event_type?: string;
    received_at_after?: string;
    received_at_before?: string;
    sort_by?: string;
    sort_mode?: 'asc' | 'desc';
    page_size?: number;
    bookmark?: string;
}

function buildQueryParams(filters: EventLogFilters): URLSearchParams {
    const params = new URLSearchParams();

    if (filters.event_type) {
        params.append('filter', `event_type[eq]=${filters.event_type}`);
    }
    if (filters.received_at_after) {
        params.append('filter', `received_at[af]=${filters.received_at_after}`);
    }
    if (filters.received_at_before) {
        params.append('filter', `received_at[bf]=${filters.received_at_before}`);
    }
    if (filters.sort_by) params.set('sort_by', filters.sort_by);
    if (filters.sort_mode) params.set('sort_mode', filters.sort_mode);
    if (filters.page_size !== undefined) params.set('page_size', String(filters.page_size));
    if (filters.bookmark) params.set('bookmark', filters.bookmark);

    return params;
}

export async function fetchEventLogs(filters?: EventLogFilters): Promise<ApiEventLogListResponse> {
    const params = filters ? buildQueryParams(filters) : new URLSearchParams();
    const qs = params.toString();
    const url = `${get_ALERTS_API_BASE_URL()}/events${qs ? `?${qs}` : ''}`;

    const response = await apiFetch(url);
    if (!response.ok) {
        let errorMessage = `Failed to fetch event logs. HTTP error ${response.status}`;
        try {
            const errorJson = await response.json();
            if (errorJson?.message) errorMessage = `Failed to fetch event logs: ${errorJson.message}`;
        } catch (e) {
            console.error('Failed to parse error response:', e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function fetchEventById(eventId: string): Promise<ApiEventLog> {
    const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/events/${encodeURIComponent(eventId)}`);
    if (!response.ok) {
        let errorMessage = `Failed to fetch event. HTTP error ${response.status}`;
        try {
            const errorJson = await response.json();
            if (errorJson?.message) errorMessage = `Failed to fetch event: ${errorJson.message}`;
        } catch (e) {
            console.error('Failed to parse error response:', e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function fetchEventRetentionConfig(): Promise<EventRetentionConfig> {
    const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/config/event-retention`);
    if (!response.ok) {
        let errorMessage = `Failed to fetch retention config. HTTP error ${response.status}`;
        try {
            const errorJson = await response.json();
            if (errorJson?.message) errorMessage = `Failed to fetch retention config: ${errorJson.message}`;
        } catch (e) {
            console.error('Failed to parse error response:', e);
        }
        throw new Error(errorMessage);
    }
    return response.json();
}

export async function updateEventRetentionConfig(config: EventRetentionConfig): Promise<void> {
    const response = await apiFetch(`${get_ALERTS_API_BASE_URL()}/config/event-retention`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!response.ok) {
        let errorMessage = `Failed to update retention config. HTTP error ${response.status}`;
        try {
            const errorJson = await response.json();
            if (errorJson?.message) errorMessage = `Failed to update retention config: ${errorJson.message}`;
        } catch (e) {
            console.error('Failed to parse error response:', e);
        }
        throw new Error(errorMessage);
    }
}
