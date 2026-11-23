import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UnkernelTerminal from './UnkernelTerminal';

const fake = vi.hoisted(() => {
  interface Session {
    stop: ReturnType<typeof vi.fn>;
    sendScript: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
  }
  const sessions: Session[] = [];
  const state = {
    mountError: null as Error | null,
    sendScript: (_script: string): Promise<{ command: string }> => Promise.resolve({ command: 'cd /tmp/est-enroll.AbC123 && sh ./enroll.sh' }),
  };
  const mountUnkernel = vi.fn(async (_root: HTMLElement, _opts?: { wisp?: string }) => {
    if (state.mountError) throw state.mountError;
    const session: Session = {
      stop: vi.fn(async () => {}),
      sendScript: vi.fn((script: string) => state.sendScript(script)),
      focus: vi.fn(),
    };
    sessions.push(session);
    return session;
  });
  return { sessions, state, mountUnkernel };
});

vi.mock('./unkernel/mount', () => ({ mountUnkernel: fake.mountUnkernel }));
vi.mock('./unkernel/unkernel.css', () => ({}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/toast', () => ({ sileo: toast }));

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const live = () => fake.sessions.filter(session => session.stop.mock.calls.length === 0);
const abortError = () => new DOMException('Replaced by a newer script.', 'AbortError');

describe('UnkernelTerminal', () => {
  beforeEach(() => {
    fake.sessions.length = 0;
    fake.state.mountError = null;
    fake.state.sendScript = () => Promise.resolve({ command: 'cd /tmp/est-enroll.AbC123 && sh ./enroll.sh' });
    fake.mountUnkernel.mockClear();
    toast.success.mockClear();
    toast.error.mockClear();
  });

  it('mounts the shell in its root element with the Wisp URL, after the effect, and stops it on unmount', async () => {
    const { container, unmount } = render(<UnkernelTerminal wispUrl="wss://wisp.example/" script={null} onScriptReady={vi.fn()} />);
    // Not inside the effect: the shell renders with flushSync, which React forbids there.
    expect(fake.mountUnkernel).not.toHaveBeenCalled();

    await settle();

    expect(fake.mountUnkernel).toHaveBeenCalledTimes(1);
    const [root, options] = fake.mountUnkernel.mock.calls[0]!;
    expect(root).toBe(container.querySelector('.unkernel-root'));
    expect(options).toEqual({ wisp: 'wss://wisp.example/' });

    unmount();
    await settle();

    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it('ends with exactly one live session after StrictMode runs the effects twice', async () => {
    const { unmount } = render(
      <StrictMode>
        <UnkernelTerminal script={null} onScriptReady={vi.fn()} />
      </StrictMode>,
    );
    await settle();

    expect(fake.mountUnkernel).toHaveBeenCalledTimes(1);
    expect(live()).toHaveLength(1);

    unmount();
    await settle();

    expect(live()).toHaveLength(0);
  });

  it('stops a session whose mount was still pending when the terminal closed', async () => {
    const { unmount } = render(<UnkernelTerminal script={null} onScriptReady={vi.fn()} />);
    unmount();
    await settle();

    expect(live()).toHaveLength(0);
  });

  it('prepares the script, reports it taken and shows the command with a Copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onScriptReady = vi.fn();
    render(<UnkernelTerminal script="echo hi" onScriptReady={onScriptReady} />);
    await settle();

    expect(fake.sessions[0]!.sendScript).toHaveBeenCalledWith('echo hi');
    expect(onScriptReady).toHaveBeenCalledWith('echo hi');
    expect(await screen.findByText('cd /tmp/est-enroll.AbC123 && sh ./enroll.sh')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('cd /tmp/est-enroll.AbC123 && sh ./enroll.sh'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('sends a script that arrives after the shell is up', async () => {
    const { rerender } = render(<UnkernelTerminal script={null} onScriptReady={vi.fn()} />);
    await settle();
    expect(fake.sessions[0]!.sendScript).not.toHaveBeenCalled();

    rerender(<UnkernelTerminal script="echo later" onScriptReady={vi.fn()} />);
    await settle();

    expect(fake.sessions[0]!.sendScript).toHaveBeenCalledWith('echo later');
  });

  it('does not show an AbortError (a newer script or closing replaced it) as a failure', async () => {
    fake.state.sendScript = () => Promise.reject(abortError());
    render(<UnkernelTerminal script="echo hi" onScriptReady={vi.fn()} />);
    await settle();

    expect(fake.sessions[0]!.sendScript).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows an inline error with Retry when the script could not be prepared, and Retry sends it again', async () => {
    fake.state.sendScript = () => Promise.reject(new Error('Unable to prepare the enrollment script.'));
    render(<UnkernelTerminal script="echo hi" onScriptReady={vi.fn()} />);
    await settle();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to prepare the enrollment script.');

    fake.state.sendScript = () => Promise.resolve({ command: 'cd /tmp/est-enroll.Zz9 && sh ./enroll.sh' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('cd /tmp/est-enroll.Zz9 && sh ./enroll.sh')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fake.sessions[0]!.sendScript).toHaveBeenCalledTimes(2);
    expect(fake.sessions[0]!.sendScript).toHaveBeenLastCalledWith('echo hi');
  });

  it('retains a pending script when mounting fails and prepares it after Retry', async () => {
    fake.state.mountError = new Error('boom');
    const ready = vi.fn();
    render(<UnkernelTerminal script="echo retained" onScriptReady={ready} />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to start the terminal.');
    fake.state.mountError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fake.sessions[0]?.sendScript).toHaveBeenCalledWith('echo retained'));
    expect(ready).toHaveBeenCalledWith('echo retained');
  });

  it('shows an error with Retry when the shell cannot be mounted, and Retry mounts it again', async () => {
    fake.state.mountError = new Error('boom');
    render(<UnkernelTerminal script={null} onScriptReady={vi.fn()} />);
    await settle();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to start the terminal.');

    fake.state.mountError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settle();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(live()).toHaveLength(1);
  });
});
