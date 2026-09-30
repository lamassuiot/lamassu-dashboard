import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const SLOW_HINT = /taking longer than usual/i;

// The loading-sequence clock is module state, so each test gets a fresh copy of the module.
async function loadLoader() {
  vi.resetModules();
  return (await import('./FullPageLoader')).FullPageLoader;
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('FullPageLoader slow-loading hints', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
  });
  afterEach(() => vi.useRealTimers());

  it('keeps counting when one loading stage hands over to the next', async () => {
    const FullPageLoader = await loadLoader();
    const { rerender } = render(<FullPageLoader key="config" title="Loading Configuration" message="Reading…" />);
    await advance(6_000);

    // Swap stages without a gap, as the layout does between configuration, session and permissions.
    rerender(<FullPageLoader key="session" title="Checking Session" message="Verifying…" />);
    await advance(5_000);

    expect(screen.getByText(SLOW_HINT)).toBeInTheDocument();
  });

  it('starts a new sequence when a loader appears after the app has been shown', async () => {
    const FullPageLoader = await loadLoader();
    const first = render(<FullPageLoader title="Loading Application" message="Preparing…" />);
    await advance(2_000);
    first.unmount();

    // The user works in the dashboard for a while, then signs out.
    await advance(60_000);
    render(<FullPageLoader title="Signing Out" message="Ending your session…" />);
    await advance(1_000);

    expect(screen.queryByText(SLOW_HINT)).not.toBeInTheDocument();
    expect(screen.getByText('Ending your session…')).toBeInTheDocument();

    await advance(10_000);
    expect(screen.getByText(SLOW_HINT)).toBeInTheDocument();
  });
});
