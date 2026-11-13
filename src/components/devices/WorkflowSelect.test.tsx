import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowSelect, hawkbitActionNote, installModeOf, DEFAULT_LAUNCH_WORKFLOW } from './WorkflowSelect';

// The workflow choice is NOT inert in hawkbit mode: the backend normalises it and maps it to
// hawkBit's DDI actionType, which changes what the device does. These assert the UI says so, since
// "Phased" there means "the device may postpone", not "rolled out in waves" — and "Canary" maps to
// the same actionType as Direct, which is exactly the kind of silent degradation worth stating.

const { fetchWorkflowsMock, isSupportedMock } = vi.hoisted(() => ({
  fetchWorkflowsMock: vi.fn(),
  isSupportedMock: vi.fn(),
}));

vi.mock('@/lib/iot-api', () => ({ fetchWorkflows: fetchWorkflowsMock }));
vi.mock('@/contexts/UpdatesCapabilitiesContext', () => ({
  useUpdatesCapabilities: () => ({ isSupported: isSupportedMock, isLoading: false }),
}));

describe('hawkbitActionNote', () => {
  it('maps direct to the forced action type', () => {
    expect(hawkbitActionNote('wfx.workflow.dau.direct')).toMatch(/"forced"/);
    expect(hawkbitActionNote('direct')).toMatch(/installs as soon as it polls/i);
  });

  it('maps phased to the soft action type, i.e. the device may postpone', () => {
    expect(hawkbitActionNote('wfx.workflow.dau.phased')).toMatch(/"soft"/);
    expect(hawkbitActionNote('phased')).toMatch(/confirm or postpone/i);
  });

  it('says an unmapped workflow is sent as Forced', () => {
    // Canary is the real case: it batches via the rollout group, but its action type is Forced.
    const note = hawkbitActionNote('wfx.workflow.dau.canary');
    expect(note).toMatch(/sent as Forced/i);
    expect(note).toMatch(/rollout groups/i);
  });
});

describe('installModeOf', () => {
  it('names hawkBit\'s install modes: phased is Soft, everything else Forced', () => {
    expect(installModeOf('wfx.workflow.dau.phased').label).toBe('Soft');
    expect(installModeOf('phased').label).toBe('Soft');
    expect(installModeOf('wfx.workflow.dau.direct').label).toBe('Forced');
    expect(installModeOf('wfx.workflow.dau.canary').label).toBe('Forced');
    expect(installModeOf(undefined).label).toBe('Forced');
  });
});

describe('WorkflowSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // hawkbit mode: no WFX, so the workflow list comes back empty.
    fetchWorkflowsMock.mockResolvedValue([]);
  });

  it('explains the hawkBit action type where WFX workflows are unsupported', async () => {
    isSupportedMock.mockImplementation((k: string) => k !== 'workflows');
    render(<WorkflowSelect value={DEFAULT_LAUNCH_WORKFLOW} onChange={() => {}} />);

    await waitFor(() => expect(screen.getByText(/hawkBit action type "forced"/i)).toBeTruthy());
  });

  it('offers the install modes by name where WFX workflows are unsupported', async () => {
    isSupportedMock.mockImplementation((k: string) => k !== 'workflows');
    render(<WorkflowSelect value="wfx.workflow.dau.phased" onChange={() => {}} />);

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Soft'));
    expect(screen.getByText(/may confirm or postpone the install/i)).toBeTruthy();
  });

  it('shows no action-type note where WFX workflows really exist', async () => {
    isSupportedMock.mockReturnValue(true);
    fetchWorkflowsMock.mockResolvedValue([{ name: 'wfx.workflow.dau.direct' }]);
    render(<WorkflowSelect value={DEFAULT_LAUNCH_WORKFLOW} onChange={() => {}} />);

    await waitFor(() => expect(fetchWorkflowsMock).toHaveBeenCalled());
    // A real workflow engine drives the behaviour, so an actionType note would be wrong there.
    expect(screen.queryByText(/hawkBit action type/i)).toBeNull();
  });

  it('reflects the selected value, so switching updates the explanation', async () => {
    isSupportedMock.mockImplementation((k: string) => k !== 'workflows');
    const { rerender } = render(<WorkflowSelect value="wfx.workflow.dau.direct" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/"forced"/)).toBeTruthy());

    rerender(<WorkflowSelect value="wfx.workflow.dau.phased" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/"soft"/)).toBeTruthy());
  });
});
