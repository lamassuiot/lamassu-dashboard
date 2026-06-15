'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight,
  FileKey2,
  Landmark,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelineEventRendererProps } from './types';
import {
  TimelineCertificatePanel,
  TimelineStructuredDataPanel,
} from './shared';

const formatAwsAction = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const parseShadowActionStates = (description?: string) => {
  // Guard against ReDoS: legitimate action-state strings are short; reject anything implausibly long.
  if (!description || description.length > 2_000) return new Map<string, string>();

  const matches = description.matchAll(/([A-Z_]+)\s+\(([^)]+)\)/g);
  const parsed = new Map<string, string>();

  for (const match of matches) {
    const [, action, state] = match;
    parsed.set(action, state);
  }

  return parsed;
};

const getAwsActionMeta = (action: string) => {
  switch (action) {
    case 'UPDATE_CERTIFICATE':
      return {
        label: 'Update Certificate',
        hint: 'Sync the latest device certificate to the shadow.',
        Icon: FileKey2,
      };
    case 'UPDATE_TRUST_ANCHOR_LIST':
      return {
        label: 'Update Trust Anchor List',
        hint: 'Sync the trust anchor bundle published to the device.',
        Icon: Landmark,
      };
    default:
      return {
        label: formatAwsAction(action),
        hint: 'Connector remediation action.',
        Icon: RefreshCw,
      };
  }
};

const getAwsActionStateClassName = (state?: string) => {
  switch (state) {
    case 'added':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    case 'updated':
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300';
    case 'retained':
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const formatAwsStructuredValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return null;
};

const findAwsStructuredValue = (
  source: unknown,
  candidateKeys: string[],
  seen = new WeakSet<object>(),
): string | null => {
  const normalizedKeys = new Set(candidateKeys.map((key) => key.toLowerCase()));

  const visit = (value: unknown): string | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const match = visit(item);
        if (match) return match;
      }

      return null;
    }

    if (!isRecord(value)) return null;

    if (seen.has(value)) return null;
    seen.add(value);

    for (const [key, nestedValue] of Object.entries(value)) {
      if (normalizedKeys.has(key.toLowerCase())) {
        const match = formatAwsStructuredValue(nestedValue);
        if (match) return match;
      }
    }

    for (const nestedValue of Object.values(value)) {
      const match = visit(nestedValue);
      if (match) return match;
    }

    return null;
  };

  return visit(source);
};

const extractAwsConnectionDetails = (structuredData: unknown) => {
  const detailDefinitions = [
    {
      label: 'Thing',
      keys: ['thingName', 'thing_name', 'thing', 'thingId', 'thing_id'],
    },
    {
      label: 'Client ID',
      keys: ['clientId', 'client_id', 'clientID', 'client'],
    },
    {
      label: 'Principal',
      keys: [
        'principalId',
        'principal_id',
        'principalIdentifier',
        'principal_identifier',
        'principal',
      ],
    },
    {
      label: 'IP Address',
      keys: [
        'ipAddress',
        'ip_address',
        'sourceIp',
        'source_ip',
        'sourceIPAddress',
        'ip',
      ],
    },
    {
      label: 'Reason',
      keys: [
        'disconnectReason',
        'disconnect_reason',
        'reason',
        'statusReason',
        'status_reason',
        'message',
      ],
    },
    {
      label: 'Session',
      keys: [
        'sessionPresent',
        'session_present',
        'cleanSession',
        'clean_session',
        'persistentSession',
        'persistent_session',
      ],
    },
  ] as const;

  const details: Array<{ label: string; value: string }> = [];

  for (const detail of detailDefinitions) {
    const value = findAwsStructuredValue(structuredData, [...detail.keys]);
    if (value) {
      details.push({ label: detail.label, value });
    }
  }

  return details;
};

const AwsConnectionEventRenderer: React.FC<TimelineEventRendererProps> = ({
  event,
  onRevoke,
  onReactivate,
}) => {
  const isConnected = event.eventType === 'CONNECTED';
  const Icon = isConnected ? Wifi : WifiOff;
  const details = extractAwsConnectionDetails(event.structuredData);
  const defaultDescription = isConnected
    ? 'AWS IoT Core accepted a device connection.'
    : 'AWS IoT Core closed the device connection.';

  const shellClassName = isConnected
    ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20'
    : 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/20';

  const iconClassName = isConnected
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300'
    : 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300';

  const badgeClassName = isConnected
    ? 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200'
    : 'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200';

  return (
    <>
      <div className={cn('mt-2 rounded-lg border px-3 py-3', shellClassName)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                iconClassName,
              )}
            >
              <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {isConnected ? 'Connection established' : 'Connection closed'}
              </p>
              <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
                {event.description || defaultDescription}
              </p>
            </div>
          </div>

          <Badge variant="outline" className={badgeClassName}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        {details.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {details.map((detail) => (
              <div
                key={detail.label}
                className="rounded-md border border-border/70 bg-background px-3 py-2"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {detail.label}
                </p>
                <p className="mt-1 break-all font-mono text-[13px] text-foreground">
                  {detail.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {event.structuredData ? (
        <details className="mt-2 rounded-lg border bg-card/70 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
            <span>Raw Payload</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </summary>
          <div className="mt-2">
            <TimelineStructuredDataPanel structuredData={event.structuredData} />
          </div>
        </details>
      ) : null}

      {event.certificate ? (
        <TimelineCertificatePanel
          certificate={event.certificate}
          onRevoke={onRevoke}
          onReactivate={onReactivate}
        />
      ) : event.details ? (
        <div className="mt-1.5 text-xs text-muted-foreground">{event.details}</div>
      ) : null}
    </>
  );
};

const AwsShadowUpdatedEventRenderer: React.FC<TimelineEventRendererProps> = ({
  event,
  onRevoke,
  onReactivate,
}) => {
  const structuredActions = Array.isArray((event.structuredData as { actions?: unknown } | null)?.actions)
    ? ((event.structuredData as { actions: unknown[] }).actions.filter(
        (action): action is string => typeof action === 'string',
      ))
    : [];
  const actionStates = parseShadowActionStates(event.description);
  const mergedActions = Array.from(
    new Set([...structuredActions, ...Array.from(actionStates.keys())]),
  );

  return (
    <>
      {mergedActions.length > 0 && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {mergedActions.map((action) => {
            const meta = getAwsActionMeta(action);
            const state = actionStates.get(action);

            return (
              <div
                key={action}
                className="rounded-lg border border-border/70 bg-background/85 p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 rounded-md bg-sky-100 p-2 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                      <meta.Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {meta.label}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {meta.hint}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={getAwsActionStateClassName(state)}
                  >
                    {state ? state.charAt(0).toUpperCase() + state.slice(1) : 'Listed'}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {event.structuredData ? (
        <details className="mt-2 rounded-lg border bg-card/70 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Raw Payload</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </summary>
          <div className="mt-2">
            <TimelineStructuredDataPanel structuredData={event.structuredData} />
          </div>
        </details>
      ) : null}

      {event.certificate ? (
        <TimelineCertificatePanel
          certificate={event.certificate}
          onRevoke={onRevoke}
          onReactivate={onReactivate}
        />
      ) : event.details ? (
        <div className="mt-1.5 text-xs text-muted-foreground">{event.details}</div>
      ) : null}
    </>
  );
};

export const AwsDeviceEventRenderer: React.FC<TimelineEventRendererProps> = ({
  event,
  onRevoke,
  onReactivate,
}) => {
  if (event.eventType === 'CONNECTED' || event.eventType === 'DISCONNECTED') {
    return (
      <AwsConnectionEventRenderer
        event={event}
        onRevoke={onRevoke}
        onReactivate={onReactivate}
      />
    );
  }

  if (event.eventType === 'SHADOW-UPDATED') {
    return (
      <AwsShadowUpdatedEventRenderer
        event={event}
        onRevoke={onRevoke}
        onReactivate={onReactivate}
      />
    );
  }

  const actions = Array.isArray((event.structuredData as { actions?: unknown } | null)?.actions)
    ? ((event.structuredData as { actions: unknown[] }).actions.filter(
        (action): action is string => typeof action === 'string',
      ))
    : [];

  return (
    <>
      <div className="mt-2 rounded-lg border border-sky-200/70 bg-sky-50/60 px-3 py-3 dark:border-sky-900/60 dark:bg-sky-950/20">
        <div className="text-[11px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
          AWS IoT Connector
        </div>

        {event.description && (
          <p className="mt-1.5 break-words text-sm leading-relaxed text-foreground/90">
            {event.description}
          </p>
        )}

        {actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {actions.map((action) => (
              <Badge
                key={action}
                variant="outline"
                className="border-sky-300/80 bg-background/70 text-sky-800 dark:border-sky-800 dark:text-sky-200"
              >
                {formatAwsAction(action)}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <TimelineStructuredDataPanel structuredData={event.structuredData} />

      {event.certificate ? (
        <TimelineCertificatePanel
          certificate={event.certificate}
          onRevoke={onRevoke}
          onReactivate={onReactivate}
        />
      ) : event.details ? (
        <div className="mt-1.5 text-xs text-muted-foreground">{event.details}</div>
      ) : null}
    </>
  );
};
