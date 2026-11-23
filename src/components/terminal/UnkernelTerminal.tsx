import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { sileo } from '@/lib/toast';
import { mountUnkernel, type UnkernelSession } from './unkernel/mount';
import './unkernel/unkernel.css';

interface UnkernelTerminalProps {
  wispUrl?: string;
  /** Script to prepare in the guest (Send to terminal); `onScriptReady` tells the parent it was taken. */
  script: string | null;
  onScriptReady: (script: string) => void;
}

interface Failure {
  message: string;
  retry: () => void;
}

const SCRIPT_FAILED = 'Unable to prepare the enrollment script.';
const MOUNT_FAILED = 'Unable to start the terminal.';

const isAbort = (error: unknown) => (error as { name?: string } | null)?.name === 'AbortError';

/**
 * Mounts are one at a time: the shell keeps one KW and one data disk lock per page, and
 * mountUnkernel() only knows the sessions whose stop() already started.
 */
let mounts: Promise<unknown> = Promise.resolve();

export default function UnkernelTerminal({ wispUrl, script, onScriptReady }: Readonly<UnkernelTerminalProps>) {
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<Promise<UnkernelSession | null> | null>(null);
  const latestSend = useRef(0);
  const undelivered = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let cancelled = false;
    // After a microtask: React forbids flushSync (the shell renders with it) inside an effect. A
    // StrictMode mount, stop and mount skips the first one here, so exactly one session lives.
    const mounted = mounts.then(async () => {
      if (cancelled) return null;
      try {
        const started = await mountUnkernel(root, { wisp: wispUrl });
        if (!cancelled) return started;
        void started.stop();
      } catch {
        if (!cancelled) setFailure({ message: MOUNT_FAILED, retry: () => { setFailure(null); setAttempt(value => value + 1); } });
      }
      return null;
    });
    // The queue only orders the mounts: it must not keep a closed session (and its kernel) reachable.
    mounts = mounted.then(() => undefined);
    session.current = mounted;
    return () => {
      cancelled = true;
      latestSend.current += 1;
      if (session.current === mounted) session.current = null;
      void mounted.then(started => started?.stop());
    };
  }, [wispUrl, attempt]);

  const deliver = useCallback((text: string) => {
    const pending = session.current;
    if (!pending) return;
    const id = ++latestSend.current;
    undelivered.current = text;
    void pending.then(async started => {
      if (!started || latestSend.current !== id) return;
      setFailure(null);
      try {
        const { command } = await started.sendScript(text);
        if (latestSend.current === id) { undelivered.current = null; setPrepared(command); }
      } catch (error) {
        // A newer script, or closing the terminal, replaces this one: not a failure.
        if (isAbort(error) || latestSend.current !== id) return;
        setFailure({ message: SCRIPT_FAILED, retry: () => deliver(text) });
      }
    });
  }, []);

  useEffect(() => {
    if (script !== null) {
      deliver(script);
      onScriptReady(script);
    }
  }, [script, deliver, onScriptReady]);

  useEffect(() => {
    if (attempt > 0 && undelivered.current !== null) deliver(undelivered.current);
  }, [attempt, deliver]);

  const copy = async () => {
    if (prepared === null) return;
    try {
      await navigator.clipboard.writeText(prepared);
      sileo.success({ title: 'Copied' });
    } catch {
      sileo.error({ title: 'Copy failed' });
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground">
      {failure && (
        <div role="alert" className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-xs">
          <p className="min-w-0 flex-1 truncate">{failure.message}</p>
          <Button type="button" size="xs" variant="secondary" onClick={failure.retry}>Retry</Button>
        </div>
      )}
      {!failure && prepared !== null && (
        <div role="status" className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-xs">
          <span className="shrink-0 text-muted-foreground">Script ready. Run:</span>
          <code className="min-w-0 flex-1 truncate font-mono" title={prepared}>{prepared}</code>
          <Button type="button" size="xs" variant="secondary" onClick={() => void copy()}>Copy</Button>
        </div>
      )}
      <div ref={host} className="unkernel-root min-h-0 flex-1" />
    </div>
  );
}
