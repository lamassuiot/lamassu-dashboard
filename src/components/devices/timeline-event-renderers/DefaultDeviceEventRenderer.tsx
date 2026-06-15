'use client';

import React from 'react';
import type { TimelineEventRendererProps } from './types';
import {
  TimelineCertificatePanel,
  TimelineStructuredDataPanel,
} from './shared';

export const DefaultDeviceEventRenderer: React.FC<TimelineEventRendererProps> = ({
  event,
  onRevoke,
  onReactivate,
}) => (
  <>
    {event.description && (
      <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
        {event.description}
      </p>
    )}

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
