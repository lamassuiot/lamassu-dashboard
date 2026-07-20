'use client';

import React from 'react';

const DURATION_REGEX = /^(?=.*\d)(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/;
const DURATION_PART_REGEX = /(\d+)([ywdhms])/g;
const TIMELINE_START = 3;
const TIMELINE_END = 97;

const durationUnitSeconds: Record<string, number> = {
  y: 365 * 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  d: 24 * 60 * 60,
  h: 60 * 60,
  m: 60,
  s: 1,
};

export function parseDurationToSeconds(value: string): number | null {
  if (!DURATION_REGEX.test(value)) return null;

  let seconds = 0;
  for (const match of value.matchAll(DURATION_PART_REGEX)) {
    seconds += Number.parseInt(match[1], 10) * durationUnitSeconds[match[2]];
  }

  return seconds;
}

export type CertificateValidity =
  | { type: 'Duration'; value: string }
  | { type: 'Date'; value: string }
  | { type: 'Indefinite' };

type RenewalTimeline =
  | {
      status: 'ready';
      reenrollmentPosition: number;
      preventivePosition: number;
      criticalPosition: number;
      warning?: string;
    }
  | {
      status: 'invalid';
      message: string;
    };

export function buildRenewalTimeline(
  certificateValidity: string,
  reenrollmentWindow: string,
  preventiveDelta: string,
  criticalDelta: string
): RenewalTimeline {
  const validitySeconds = parseDurationToSeconds(certificateValidity);
  const reenrollmentSeconds = parseDurationToSeconds(reenrollmentWindow);
  const preventiveSeconds = parseDurationToSeconds(preventiveDelta);
  const criticalSeconds = parseDurationToSeconds(criticalDelta);

  if (
    validitySeconds === null
    || reenrollmentSeconds === null
    || preventiveSeconds === null
    || criticalSeconds === null
    || validitySeconds === 0
    || reenrollmentSeconds === 0
  ) {
    return {
      status: 'invalid',
      message: 'Enter valid durations to preview the renewal lifecycle.',
    };
  }

  if (
    preventiveSeconds > reenrollmentSeconds
    || criticalSeconds > preventiveSeconds
  ) {
    return {
      status: 'invalid',
      message: 'Use descending renewal deltas: re-enrollment window, preventive, then critical.',
    };
  }

  const timelineWidth = TIMELINE_END - TIMELINE_START;
  const positionFromDelta = (delta: number) => (
    TIMELINE_START
    + ((validitySeconds - Math.min(delta, validitySeconds)) / validitySeconds) * timelineWidth
  );
  const hasPreIssuanceMilestones = [
    reenrollmentSeconds,
    preventiveSeconds,
    criticalSeconds,
  ].some((delta) => delta > validitySeconds);

  return {
    status: 'ready',
    reenrollmentPosition: positionFromDelta(reenrollmentSeconds),
    preventivePosition: positionFromDelta(preventiveSeconds),
    criticalPosition: positionFromDelta(criticalSeconds),
    ...(hasPreIssuanceMilestones && {
      warning: `Some renewal milestones exceed the ${certificateValidity} certificate validity and are shown at issuance.`,
    }),
  };
}

interface RenewalLifespanBarProps {
  certificateValidity: CertificateValidity | null;
  issuanceProfileName?: string;
  reenrollmentWindow: string;
  preventiveDelta: string;
  criticalDelta: string;
}

export function RenewalLifespanBar({
  certificateValidity,
  issuanceProfileName,
  reenrollmentWindow,
  preventiveDelta,
  criticalDelta,
}: RenewalLifespanBarProps) {
  const durationValidity = certificateValidity?.type === 'Duration'
    ? certificateValidity.value
    : null;
  const timeline = durationValidity
    ? buildRenewalTimeline(
        durationValidity,
        reenrollmentWindow,
        preventiveDelta,
        criticalDelta
      )
    : null;

  const profileContext = issuanceProfileName
    ? `Based on ${issuanceProfileName}. `
    : '';
  const timelineSegments = timeline?.status === 'ready'
    ? [
        { from: TIMELINE_START, to: timeline.reenrollmentPosition, className: 'stroke-border' },
        { from: timeline.reenrollmentPosition, to: timeline.preventivePosition, className: 'stroke-primary' },
        { from: timeline.preventivePosition, to: timeline.criticalPosition, className: 'stroke-muted-foreground' },
        { from: timeline.criticalPosition, to: TIMELINE_END, className: 'stroke-destructive' },
      ]
    : [];
  const timelineMarkers = timeline?.status === 'ready'
    ? [
        { position: TIMELINE_START, className: 'stroke-foreground' },
        { position: timeline.reenrollmentPosition, className: 'stroke-primary' },
        { position: timeline.preventivePosition, className: 'stroke-muted-foreground' },
        { position: timeline.criticalPosition, className: 'stroke-destructive' },
        { position: TIMELINE_END, className: 'stroke-foreground' },
      ]
    : [];
  const milestoneItems = durationValidity
    ? [
        { label: 'Certificate issued', value: `Valid for ${durationValidity}`, className: 'border-foreground' },
        { label: 'Re-enrollment opens', value: `${reenrollmentWindow} before expiry`, className: 'border-primary' },
        { label: 'Preventive event', value: `${preventiveDelta} before expiry`, className: 'border-muted-foreground' },
        { label: 'Critical event', value: `${criticalDelta} before expiry`, className: 'border-destructive' },
        { label: 'Certificate expires', value: '0 remaining', className: 'border-foreground' },
      ]
    : [];

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <p className="text-sm font-medium">Certificate lifespan</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {profileContext}Milestones are positioned from certificate issuance to expiry.
        </p>
      </div>

      {timeline?.status === 'ready' && durationValidity ? (
        <>
          <svg
            aria-label={`Certificate lifespan: issued with ${durationValidity} validity, re-enrollment opens ${reenrollmentWindow} before expiry, preventive event at ${preventiveDelta}, critical event at ${criticalDelta}, then certificate expiry.`}
            className="h-8 w-full overflow-visible"
            preserveAspectRatio="none"
            role="img"
            viewBox="0 0 100 20"
          >
            {timelineSegments.map((segment) => (
              <line
                key={`${segment.from}-${segment.to}-${segment.className}`}
                className={segment.className}
                vectorEffect="non-scaling-stroke"
                strokeWidth="4"
                x1={segment.from}
                x2={segment.to}
                y1="10"
                y2="10"
              />
            ))}
            {timelineMarkers.map((marker) => (
              <line
                key={`${marker.position}-${marker.className}`}
                className={marker.className}
                vectorEffect="non-scaling-stroke"
                strokeWidth="2"
                x1={marker.position}
                x2={marker.position}
                y1="4"
                y2="16"
              />
            ))}
          </svg>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
            {milestoneItems.map((milestone) => (
              <div key={milestone.label} className={`border-l-2 pl-2 ${milestone.className}`}>
                <p className="text-xs font-medium">{milestone.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{milestone.value}</p>
              </div>
            ))}
          </div>
          {timeline.warning ? (
            <p className="text-xs text-muted-foreground" role="status">{timeline.warning}</p>
          ) : null}
        </>
      ) : certificateValidity?.type === 'Date' ? (
        <div className="space-y-1 text-xs" role="status">
          <p className="font-medium">Valid until {certificateValidity.value}</p>
          <p className="text-muted-foreground">A fixed expiry date does not define a proportional lifespan from issuance.</p>
        </div>
      ) : certificateValidity?.type === 'Indefinite' ? (
        <p className="text-xs text-muted-foreground" role="status">
          This issuance profile has indefinite validity, so expiry-based milestones cannot be positioned.
        </p>
      ) : timeline?.status === 'invalid' ? (
        <p className="text-xs text-destructive" role="status">{timeline.message}</p>
      ) : (
        <p className="text-xs text-muted-foreground" role="status">
          Select an issuance profile to preview the certificate lifespan.
        </p>
      )}
    </div>
  );
}
