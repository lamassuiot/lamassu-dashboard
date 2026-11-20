import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from 'react';
import { Loader2, SquareTerminal } from 'lucide-react';
import { BottomDockPanel } from '@/components/shared/BottomDockPanel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConfig } from '@/contexts/ConfigContext';
import { TerminalContext } from './TerminalContext';

const UnkernelTerminal = lazy(() => import('./UnkernelTerminal'));

export function DashboardTerminal({
  children,
}: Readonly<{ children: (trigger: ReactNode) => ReactNode }>) {
  const { config } = useConfig();
  const [open, setOpen] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);
  const [script, setScript] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /** Opens the terminal and has it prepare `script` (it only writes the file; the user runs it). */
  const sendToTerminal = useCallback((nextScript: string) => {
    setScript(nextScript);
    setExpandSignal(value => value + 1);
    setOpen(true);
  }, []);
  /** The terminal took the script; a newer one sent meanwhile stays. */
  const handleScriptReady = useCallback((sent: string) => {
    setScript(current => (current === sent ? null : current));
  }, []);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setScript(null);
      trigger.current?.focus();
    }
  };

  if (config?.EXPERIMENTAL_WBTERM !== true) return children(null);

  return (
    <TerminalContext.Provider value={sendToTerminal}>
      {children(
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Terminal"
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
              wispUrl={config?.LAMASSU_TERMINAL_WISP_URL?.trim()}
              script={script}
              onScriptReady={handleScriptReady}
            />
          </Suspense>
        </BottomDockPanel>
      )}
    </TerminalContext.Provider>
  );
}
