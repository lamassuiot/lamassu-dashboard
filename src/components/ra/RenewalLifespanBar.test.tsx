import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  buildRenewalTimeline,
  parseDurationToSeconds,
  RenewalLifespanBar,
} from './RenewalLifespanBar';

describe('RenewalLifespanBar', () => {
  it('parses compound duration values', () => {
    expect(parseDurationToSeconds('1y2w3d4h5m6s')).toBe(33_019_506);
    expect(parseDurationToSeconds('31d')).toBe(2_678_400);
    expect(parseDurationToSeconds('invalid')).toBeNull();
  });

  it('positions milestones across the certificate validity', () => {
    const timeline = buildRenewalTimeline('1y', '100d', '31d', '7d');

    expect(timeline.status).toBe('ready');
    if (timeline.status !== 'ready') return;

    expect(timeline.reenrollmentPosition).toBeGreaterThan(3);
    expect(timeline.preventivePosition).toBeGreaterThan(timeline.reenrollmentPosition);
    expect(timeline.criticalPosition).toBeGreaterThan(timeline.preventivePosition);
    expect(timeline.criticalPosition).toBeLessThan(97);
  });

  it('renders all lifecycle milestones', () => {
    render(
      <RenewalLifespanBar
        certificateValidity={{ type: 'Duration', value: '1y' }}
        issuanceProfileName="Device profile"
        reenrollmentWindow="100d"
        preventiveDelta="31d"
        criticalDelta="7d"
      />
    );

    expect(screen.getByText('Certificate issued')).toBeInTheDocument();
    expect(screen.getByText('Valid for 1y')).toBeInTheDocument();
    expect(screen.getByText('Re-enrollment opens')).toBeInTheDocument();
    expect(screen.getByText('Preventive event')).toBeInTheDocument();
    expect(screen.getByText('Critical event')).toBeInTheDocument();
    expect(screen.getByText('Certificate expires')).toBeInTheDocument();
  });

  it('explains invalid milestone ordering', () => {
    render(
      <RenewalLifespanBar
        certificateValidity={{ type: 'Duration', value: '1y' }}
        reenrollmentWindow="30d"
        preventiveDelta="60d"
        criticalDelta="7d"
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Use descending renewal deltas: re-enrollment window, preventive, then critical.'
    );
  });

  it('clamps milestones that occur before certificate issuance', () => {
    const timeline = buildRenewalTimeline('30d', '100d', '31d', '7d');

    expect(timeline.status).toBe('ready');
    if (timeline.status !== 'ready') return;

    expect(timeline.reenrollmentPosition).toBe(3);
    expect(timeline.preventivePosition).toBe(3);
    expect(timeline.warning).toContain('exceed the 30d certificate validity');
  });

  it('shows fixed-date validity without inventing an issuance date', () => {
    render(
      <RenewalLifespanBar
        certificateValidity={{ type: 'Date', value: '2030-01-01T00:00:00Z' }}
        reenrollmentWindow="100d"
        preventiveDelta="31d"
        criticalDelta="7d"
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Valid until 2030-01-01T00:00:00Z'
    );
  });

  it('explains indefinite profile validity', () => {
    render(
      <RenewalLifespanBar
        certificateValidity={{ type: 'Indefinite' }}
        reenrollmentWindow="100d"
        preventiveDelta="31d"
        criticalDelta="7d"
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'This issuance profile has indefinite validity'
    );
  });
});
