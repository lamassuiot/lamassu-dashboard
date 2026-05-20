'use client';

import { apiFetch } from './api-client';
import { get_WFX_API_BASE_URL, handleApiError } from './api-domains';

// ─── Schema Types ────────────────────────────────────────────────────────────

export interface WfxPagination {
    limit: number;
    offset: number;
    total: number;
}

export interface WfxJobStatus {
    state: string;
    clientId?: string;
    progress?: number;
    message?: string;
    definitionHash?: string;
    context?: Record<string, unknown>;
}

export interface WfxState {
    name: string;
    description?: string;
}

export interface WfxGroup {
    name: string;
    description?: string;
    states: string[];
}

export interface WfxTransition {
    from: string;
    to: string;
    eligible: 'CLIENT' | 'WFX';
    action?: 'IMMEDIATE' | 'WAIT';
    description?: string;
}

export interface WfxWorkflow {
    name: string;
    description?: string;
    states: WfxState[];
    groups?: WfxGroup[];
    transitions: WfxTransition[];
}

export interface WfxHistory {
    mtime?: string;
    status?: WfxJobStatus;
    definition?: Record<string, unknown>;
}

export interface WfxJob {
    id: string;
    clientId?: string;
    workflow?: WfxWorkflow;
    tags?: string[];
    definition?: Record<string, unknown>;
    status?: WfxJobStatus;
    stime?: string | null;
    mtime?: string | null;
    history?: WfxHistory[];
}

export interface PaginatedJobList {
    pagination?: WfxPagination;
    content: WfxJob[];
}

export interface PaginatedWorkflowList {
    pagination?: WfxPagination;
    content: WfxWorkflow[];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Returns the group name that contains the given state, or undefined. */
export function resolveJobGroup(job: WfxJob): string | undefined {
    const state = job.status?.state;
    if (!state || !job.workflow?.groups) return undefined;
    return job.workflow.groups.find(g => g.states.includes(state))?.name;
}

// ─── Jobs API ─────────────────────────────────────────────────────────────────

export interface ListJobsParams {
    limit?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
    state?: string;
    group?: string;
    clientId?: string;
    workflow?: string;
    tag?: string;
}

export async function fetchJobs(params: ListJobsParams = {}): Promise<PaginatedJobList> {
    const q = new URLSearchParams({ pagination: 'true' });
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.sort) q.set('sort', params.sort);
    if (params.state) q.set('state', params.state);
    if (params.group) q.set('group', params.group);
    if (params.clientId) q.set('clientId', params.clientId);
    if (params.workflow) q.set('workflow', params.workflow);
    if (params.tag) q.set('tag', params.tag);

    const response = await apiFetch(`${get_WFX_API_BASE_URL()}/jobs?${q}`);
    return handleApiError(response, 'Failed to fetch jobs');
}

export async function fetchJob(id: string): Promise<WfxJob> {
    const response = await apiFetch(`${get_WFX_API_BASE_URL()}/jobs/${encodeURIComponent(id)}`);
    return handleApiError(response, 'Failed to fetch job');
}

// ─── Workflows API ────────────────────────────────────────────────────────────

export interface ListWorkflowsParams {
    limit?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
}

export async function fetchWorkflows(params: ListWorkflowsParams = {}): Promise<PaginatedWorkflowList> {
    const q = new URLSearchParams({ pagination: 'true' });
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.sort) q.set('sort', params.sort);

    const response = await apiFetch(`${get_WFX_API_BASE_URL()}/workflows?${q}`);
    return handleApiError(response, 'Failed to fetch workflows');
}

export async function fetchWorkflow(name: string): Promise<WfxWorkflow> {
    const response = await apiFetch(`${get_WFX_API_BASE_URL()}/workflows/${encodeURIComponent(name)}`);
    return handleApiError(response, 'Failed to fetch workflow');
}
