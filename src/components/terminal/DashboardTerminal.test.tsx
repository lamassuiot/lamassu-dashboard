import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardTerminal } from './DashboardTerminal';
import { useSendToTerminal } from './TerminalContext';

const state = vi.hoisted(() => ({
  config: null as Record<string, unknown> | null,
  props: [] as { wispUrl?: string; script: string | null; onScriptReady: (script: string) => void }[],
  mounted: 0,
  unmounted: 0,
}));

vi.mock('@/contexts/ConfigContext', () => ({
  useConfig: () => ({ config: state.config, isConfigLoaded: true, isLoading: false }),
}));

// The dock portals into a slot of the app layout; here it only renders its children.
vi.mock('@/components/shared/BottomDockPanel', async () => {
  return {
    BottomDockPanel: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => (
      <section aria-label="Terminal dock">
        <button type="button" onClick={() => onOpenChange(false)}>Close panel</button>
        {children}
      </section>
    ),
  };
});

vi.mock('./UnkernelTerminal', async () => {
  const { useEffect } = await import('react');
  function UnkernelTerminalStub(props: { wispUrl?: string; script: string | null; onScriptReady: (script: string) => void }) {
    state.props.push(props);
    useEffect(() => {
      state.mounted += 1;
      return () => { state.unmounted += 1; };
    }, []);
    return <div data-testid="unkernel" />;
  }
  return { default: UnkernelTerminalStub };
});

let send: ((script: string) => void) | null = null;
function Consumer() {
  send = useSendToTerminal();
  return null;
}

function renderTerminal() {
  return render(
    <TooltipProvider>
      <DashboardTerminal>
        {trigger => (
          <>
            {trigger}
            <Consumer />
          </>
        )}
      </DashboardTerminal>
    </TooltipProvider>,
  );
}

const lastProps = () => state.props[state.props.length - 1]!;

describe('DashboardTerminal', () => {
  beforeEach(() => {
    state.config = { EXPERIMENTAL_WBTERM: true, LAMASSU_TERMINAL_WISP_URL: '  wss://wisp.example/  ' };
    state.props = [];
    state.mounted = 0;
    state.unmounted = 0;
    send = null;
  });
  afterEach(() => vi.clearAllMocks());

  it.each([undefined, false, 'true'])('renders no trigger and no terminal unless EXPERIMENTAL_WBTERM is true (%s)', async experimental => {
    state.config = { EXPERIMENTAL_WBTERM: experimental };
    renderTerminal();

    expect(screen.queryByRole('button', { name: 'Terminal' })).toBeNull();
    expect(send).toBeNull();
    expect(screen.queryByTestId('unkernel')).toBeNull();
  });

  it('mounts the terminal when the trigger is clicked, with the trimmed Wisp URL', async () => {
    renderTerminal();
    expect(screen.queryByTestId('unkernel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));

    expect(await screen.findByTestId('unkernel')).toBeInTheDocument();
    expect(lastProps().wispUrl).toBe('wss://wisp.example/');
    expect(lastProps().script).toBeNull();
  });

  it('opens the dock and hands the script over when sendToTerminal is called', async () => {
    renderTerminal();

    act(() => send!('echo hi'));

    expect(await screen.findByTestId('unkernel')).toBeInTheDocument();
    expect(lastProps().script).toBe('echo hi');
  });

  it('stops passing the script once the terminal has taken it', async () => {
    renderTerminal();
    act(() => send!('echo hi'));
    await screen.findByTestId('unkernel');

    act(() => lastProps().onScriptReady('echo hi'));

    expect(lastProps().script).toBeNull();
  });

  it('keeps a newer script when the terminal reports an older one', async () => {
    renderTerminal();
    act(() => send!('first'));
    await screen.findByTestId('unkernel');
    act(() => send!('second'));

    act(() => lastProps().onScriptReady('first'));

    expect(lastProps().script).toBe('second');
  });

  it('unmounts the terminal when the dock closes', async () => {
    renderTerminal();
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    await screen.findByTestId('unkernel');
    expect(state.mounted).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));

    expect(screen.queryByTestId('unkernel')).toBeNull();
    expect(state.unmounted).toBe(1);
  });

  it('returns focus to the trigger when the dock closes', async () => {
    renderTerminal();
    const trigger = screen.getByRole('button', { name: 'Terminal' });
    fireEvent.click(trigger);
    await screen.findByTestId('unkernel');

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));

    expect(trigger).toHaveFocus();
  });
});
