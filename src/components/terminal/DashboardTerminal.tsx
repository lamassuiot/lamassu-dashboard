import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, SquareTerminal } from 'lucide-react';
import { BottomDockPanel } from '@/components/shared/BottomDockPanel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConfig } from '@/contexts/ConfigContext';
import { getStoredAccessToken, isAuthEnabled } from '@/lib/auth-session';
import { RunInTerminalContext, TerminalContext, type TerminalCommand } from './TerminalContext';
import { resolveWispUrl, withAccessToken } from './wisp-url';
import { BackgroundCommandContext, type BackgroundCommand } from './background';
import { sileo } from '@/lib/toast';

const UnkernelTerminal = lazy(() => import('./UnkernelTerminal'));

export function DashboardTerminal({
  children,
}: Readonly<{ children: (trigger: ReactNode) => ReactNode }>) {
  const { config } = useConfig();
  const [open, setOpen] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);
  const [script, setScript] = useState<string | null>(null);
  const [command, setCommand] = useState<TerminalCommand | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openRef = useRef(false);
  const background = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => background.current?.abort(), []);

  // Read when the shell starts, and again on every Reboot: the stored token is the renewed one.
  const configuredWisp = config?.LAMASSU_TERMINAL_WISP_URL;
  const wispUrl = useCallback(
    () => withAccessToken(resolveWispUrl(configuredWisp), isAuthEnabled() ? getStoredAccessToken() : null),
    [configuredWisp],
  );

  /** Opens the terminal and has it prepare `script` (it only writes the file; the user runs it). */
  const sendToTerminal = useCallback((nextScript: string) => {
    if (background.current) {
      sileo.error({ title: 'A background task is running. Try again when it finishes.' });
      return;
    }
    openRef.current = true;
    setScript(nextScript);
    setExpandSignal(value => value + 1);
    setOpen(true);
  }, []);
  /** The terminal took the script; a newer one sent meanwhile stays. */
  const handleScriptReady = useCallback((sent: string) => {
    setScript(current => (current === sent ? null : current));
  }, []);
  const runInTerminal = useCallback((source: string) => {
    if (background.current) {
      sileo.error({ title: 'A background task is running. Try again when it finishes.' });
      return;
    }
    openRef.current = true;
    setCommand({ source });
    setExpandSignal(value => value + 1);
    setOpen(true);
  }, []);
  const handleCommandTaken = useCallback((taken: TerminalCommand) => {
    setCommand(current => current === taken ? null : current);
  }, []);
  const handleOpenChange = (next: boolean) => {
    if (next && background.current) return;
    openRef.current = next;
    setOpen(next);
    if (!next) {
      setScript(null);
      setCommand(null);
      trigger.current?.focus();
    }
  };

  const runBackground = useCallback<BackgroundCommand>(async (file, args, input, onStderr) => {
    if (openRef.current) throw new Error('Close the terminal before running a background task.');
    if (background.current) throw new Error('Another background task is already running.');
    const controller = new AbortController();
    background.current = controller;
    setBusy(true);
    const timer = window.setTimeout(() => controller.abort(), 90000);
    const root = document.createElement('div');
    root.className = 'unkernel-root fixed -left-[10000px] top-0 h-[400px] w-[800px]';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
    let session: import('./unkernel/mount').UnkernelSession | undefined;
    try {
      const { mountUnkernel } = await import('./unkernel/mount');
      await import('./unkernel/unkernel.css');
      if (controller.signal.aborted) throw new Error('Background task cancelled.');
      session = await mountUnkernel(root, { wisp: wispUrl });
      return await session.exec(file, args, controller.signal, input, onStderr);
    } finally {
      window.clearTimeout(timer);
      try {
        await session?.stop();
      } finally {
        root.remove();
        background.current = null;
        setBusy(false);
      }
    }
  }, [wispUrl]);

  if (config?.EXPERIMENTAL_WBTERM !== true) return children(null);

  return (
    <TerminalContext.Provider value={sendToTerminal}>
    <RunInTerminalContext.Provider value={runInTerminal}>
    <BackgroundCommandContext.Provider value={runBackground}>
      {children(
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Terminal"
              disabled={busy}
              aria-expanded={open}
              aria-controls={open ? 'dashboard-terminal' : undefined}
              className="text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground aria-expanded:bg-header-foreground/15"
              onClick={() => handleOpenChange(!open)}
            >
              <SquareTerminal aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Terminal</TooltipContent>
        </Tooltip>
      )}
      {open && (
        <BottomDockPanel
          id="dashboard-terminal"
          open={open}
          onOpenChange={handleOpenChange}
          storageKey="terminal"
          target="terminal"
          title="Terminal"
          icon={<SquareTerminal className="size-4 text-muted-foreground" aria-hidden="true" />}
          defaultHeightRatio={0.36}
          minHeight={152}
          headerClassName="gap-2 px-3 py-0.5 md:px-3"
          expandSignal={expandSignal}
        >
          <Suspense fallback={
            <div role="status" className="flex h-full items-center gap-2 bg-black px-4 text-sm text-white">
              <Loader2 className="size-4 animate-spin" /> Loading terminal…
            </div>
          }>
            <UnkernelTerminal
              wispUrl={wispUrl}
              script={script}
              onScriptReady={handleScriptReady}
              command={command}
              onCommandTaken={handleCommandTaken}
            />
          </Suspense>
        </BottomDockPanel>
      )}
    </BackgroundCommandContext.Provider>
    </RunInTerminalContext.Provider>
    </TerminalContext.Provider>
  );
}
