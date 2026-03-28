
import { get_AUDIT_LOGS_API_BASE_URL } from './api-domains';

// ── Data types ───────────────────────────────────────────────────────────────

export interface AuditEventData extends Record<string, unknown> {
  has_error?: boolean;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface AuditEvent {
  type: string;
  user_id?: string;
  resource?: string;
  timestamp?: string;
  specversion?: string;
  id?: string;
  source?: string;
  datacontenttype?: string;
  time?: string;
  data?: AuditEventData;
  spanid?: string;
  traceid?: string;
}

export interface LegacyAuditEvent {
  type: string;
  user_id: string;
  resource: string;
  timestamp?: string;
}

export interface EventLeaf {
  index: number;
  leaf_hash: string;
  event: AuditEvent;
}

export interface EventsListResponse {
  from: number;
  count: number;
  tree_size: number;
  root_hash: string;
  events: EventLeaf[];
}

export interface AppendEventResponse {
  tree_size: number;
  root_hash: string;
}

export interface SingleEventResponse {
  index: number;
  leaf_hash: string;
  tree_size: number;
  root_hash: string;
  event: AuditEvent;
}

export interface MerklePathStep {
  level: number;
  sibling_hash: string;
}

export interface InclusionProofResponse {
  leaf_index: number;
  tree_size: number;
  root_hash: string;
  leaf_hash: string;
  verified: boolean;
  merkle_path: MerklePathStep[];
}

export interface CheckpointResponse {
  tree_size: number;
  root_hash: string;
  signed_checkpoint: string;
}

export interface VerifyEventResponse {
  verified: boolean;
  leaf_index?: number;
  tree_size: number;
  root_hash: string;
  detail?: string;
}

export interface TamperCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface TamperCheckResponse {
  tamper_detected: boolean;
  tree_size: number;
  root_hash: string;
  checks: TamperCheckResult[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export interface AuditEventSummaryRow {
  label: string;
  mono?: boolean;
  value: string;
}

async function handleResponse<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) {
    let msg = `${context}: HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = `${context}: ${body.error}`;
    } catch { /* ignore parse error */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function getNestedString(value: unknown, path: string[]) {
  let current = value;

  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' && current.trim().length > 0 ? current.trim() : undefined;
}

export function isLegacyAuditEvent(event: AuditEvent): event is LegacyAuditEvent {
  return typeof event.user_id === 'string' && typeof event.resource === 'string';
}

export function getAuditEventTimestamp(event: AuditEvent) {
  return firstNonEmpty(event.time, event.timestamp);
}

export function getAuditEventSubject(event: AuditEvent) {
  return firstNonEmpty(
    event.user_id,
    getNestedString(event.data, ['output', 'subject', 'common_name']),
    getNestedString(event.data, ['output', 'issuer_metadata', 'id']),
    getNestedString(event.data, ['input', 'CAID']),
  );
}

export function getAuditEventResource(event: AuditEvent) {
  return firstNonEmpty(
    event.resource,
    getNestedString(event.data, ['output', 'issuer_metadata', 'id']),
    getNestedString(event.data, ['output', 'serial_number']),
    getNestedString(event.data, ['input', 'IssuanceProfileID']),
    event.source,
  );
}

export function getAuditEventSummaryRows(event: AuditEvent): AuditEventSummaryRow[] {
  if (isLegacyAuditEvent(event)) {
    return [
      { label: 'user', mono: true, value: event.user_id },
      { label: 'res', value: event.resource },
      { label: 'time', value: getAuditEventTimestamp(event) ?? 'Server timestamp' },
    ];
  }

  return [
    { label: 'src', mono: true, value: event.source ?? 'Unknown source' },
    { label: 'id', mono: true, value: event.id ?? event.traceid ?? 'Unavailable' },
    { label: 'time', value: getAuditEventTimestamp(event) ?? 'Server timestamp' },
  ];
}

/** Build the JSON payload used for append / verify requests. */
export function canonicalEventJson(event: AuditEvent): string {
  if (!isLegacyAuditEvent(event)) {
    return JSON.stringify(event);
  }

  const obj: Record<string, string> = {
    type: event.type,
    user_id: event.user_id,
    resource: event.resource,
  };
  if (event.timestamp) obj.timestamp = event.timestamp;
  return JSON.stringify(obj);
}

// ── API functions ────────────────────────────────────────────────────────────

export async function fetchEvents(from = 0, limit = 50): Promise<EventsListResponse> {
  const url = `${get_AUDIT_LOGS_API_BASE_URL()}/events?from=${from}&limit=${limit}`;
  const res = await fetch(url);
  return handleResponse<EventsListResponse>(res, 'Fetch events');
}

export async function fetchEventByIndex(index: number): Promise<SingleEventResponse> {
  const url = `${get_AUDIT_LOGS_API_BASE_URL()}/events/${index}`;
  const res = await fetch(url);
  return handleResponse<SingleEventResponse>(res, `Fetch event ${index}`);
}

export async function fetchInclusionProof(index: number): Promise<InclusionProofResponse> {
  const url = `${get_AUDIT_LOGS_API_BASE_URL()}/events/${index}/proof`;
  const res = await fetch(url);
  return handleResponse<InclusionProofResponse>(res, `Fetch proof for event ${index}`);
}

export async function fetchCheckpoint(): Promise<CheckpointResponse> {
  const url = `${get_AUDIT_LOGS_API_BASE_URL()}/checkpoint`;
  const res = await fetch(url);
  return handleResponse<CheckpointResponse>(res, 'Fetch checkpoint');
}

export async function appendEvent(event: LegacyAuditEvent): Promise<AppendEventResponse> {
  const body = canonicalEventJson(event);
  const res = await fetch(`${get_AUDIT_LOGS_API_BASE_URL()}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return handleResponse<AppendEventResponse>(res, 'Append event');
}

export async function verifyEvent(event: AuditEvent): Promise<VerifyEventResponse> {
  const body = canonicalEventJson(event);
  const res = await fetch(`${get_AUDIT_LOGS_API_BASE_URL()}/events/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return handleResponse<VerifyEventResponse>(res, 'Verify event');
}

export async function tamperCheck(original: AuditEvent, tampered: AuditEvent): Promise<TamperCheckResponse> {
  const body = JSON.stringify({ original, tampered });
  const res = await fetch(`${get_AUDIT_LOGS_API_BASE_URL()}/events/tamper-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return handleResponse<TamperCheckResponse>(res, 'Tamper check');
}
