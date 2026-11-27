import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ChevronRight, SquareTerminal } from 'lucide-react';
import { Collapsible } from 'radix-ui';
import type { EnrollmentActivity } from '@/lib/est-background';
import './enrollment-console.css';

const STATUS = {
  idle: { label: 'Ready', dot: 'bg-zinc-500' },
  running: { label: 'Running', dot: 'bg-primary' },
  complete: { label: 'Completed', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', dot: 'bg-red-400' },
};

const SNAKE_LENGTH = 26;
const SNAKE_LAYER_COUNT = 20;
const SNAKE_LAYERS = Array.from({ length: SNAKE_LAYER_COUNT }, (_, layer) => {
  const progress = layer / SNAKE_LAYER_COUNT;
  const previousOpacity = progress ** 1.5;
  const nextOpacity = ((layer + 1) / SNAKE_LAYER_COUNT) ** 1.5;
  return {
    length: SNAKE_LENGTH * (1 - progress),
    // Opacity needed to reach the next stop after compositing over the layers below.
    opacity: (nextOpacity - previousOpacity) / (1 - previousOpacity),
  };
});

interface EnrollmentConsoleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: readonly EnrollmentActivity[];
  status: keyof typeof STATUS;
  inspection?: string;
  error?: string | null;
}

export function EnrollmentConsole({ open, onOpenChange, activity, status, inspection, error }: Readonly<EnrollmentConsoleProps>) {
  const logRef = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const { label, dot } = STATUS[status];

  useLayoutEffect(() => {
    if (activity.length === 0 || error) followOutput.current = true;
    const log = logRef.current;
    if (open && log && followOutput.current) log.scrollTop = log.scrollHeight;
  }, [open, activity, inspection, error, status]);

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={onOpenChange}
      className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-black text-zinc-200"
    >
      {status === 'running' && <div role="progressbar" aria-label="Enrolling device" className="sr-only" />}
      <Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-2 bg-zinc-900 px-3 py-2.5 text-left hover:bg-zinc-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-zinc-400 group-data-[state=open]:rotate-90" />
        <SquareTerminal aria-hidden="true" className="size-4 shrink-0 text-zinc-400" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">Terminal output</span>
        <span className="flex items-center gap-2 font-mono text-xs text-zinc-300">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />
          {label}
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content className="border-t border-zinc-800">
        <div
          ref={logRef}
          role="log"
          aria-label="Enrollment activity"
          className="max-h-64 overflow-y-auto overscroll-contain px-4 py-3 font-mono text-xs leading-relaxed"
          onScroll={({ currentTarget: log }) => {
            followOutput.current = log.scrollHeight - log.scrollTop - log.clientHeight < 16;
          }}
        >
          {activity.length === 0 && (
            <p className="text-zinc-400">
              {status === 'running' ? 'Starting Unkernel…' : status === 'failed' ? 'Stopped before the first command ran.' : 'Start enrollment to see activity here.'}
            </p>
          )}
          {activity.length > 0 && (
            <ol className="space-y-3">
              {activity.map(({ label, command }, index) => (
                <li
                  key={label}
                  aria-current={status === 'running' && index === activity.length - 1 ? 'step' : undefined}
                  className="group/step space-y-1"
                >
                  <div className="flex gap-2 text-zinc-400 group-aria-[current=step]/step:text-amber-300">
                    <span aria-hidden="true" className="select-none">›</span>
                    <span>{label}</span>
                  </div>
                  {command && (
                    <div className="flex gap-2">
                      <span aria-hidden="true" className="select-none text-emerald-400">$</span>
                      <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words"><code>{command}</code></pre>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {inspection && (
            <pre className="mt-3 whitespace-pre-wrap break-words border-t border-zinc-800 pt-3 text-zinc-300">{inspection}</pre>
          )}
          {error && (
            <pre aria-live="off" className="mt-3 whitespace-pre-wrap break-words border-t border-zinc-800 pt-3 text-red-400">{error}</pre>
          )}
        </div>
      </Collapsible.Content>
      {status === 'running' && (
        <svg aria-hidden="true" className="enrollment-snake pointer-events-none absolute inset-0 size-full fill-none stroke-primary">
          {/* Shorter strokes end at the same point, building opacity toward the head. */}
          {SNAKE_LAYERS.map(({ length, opacity }) => (
            <rect
              key={length}
              pathLength={100}
              strokeDasharray={`${length} ${100 - length}`}
              strokeLinecap="round"
              strokeOpacity={opacity}
              style={{ '--enrollment-snake-tail-offset': length - SNAKE_LENGTH } as CSSProperties}
            />
          ))}
        </svg>
      )}
    </Collapsible.Root>
  );
}
