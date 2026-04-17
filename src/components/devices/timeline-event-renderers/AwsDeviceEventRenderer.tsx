'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, FileKey2, Landmark, RefreshCw } from 'lucide-react';
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
  if (!description) return new Map<string, string>();

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
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
    case 'retained':
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
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
                    <div className="mt-0.5 rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
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
      <div className="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-3 dark:border-amber-900/60 dark:bg-amber-950/20">
        <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
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
                className="border-amber-300/80 bg-background/70 text-amber-800 dark:border-amber-800 dark:text-amber-200"
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
