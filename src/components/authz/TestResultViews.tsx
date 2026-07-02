'use client';

import { ChevronRight, ShieldCheck, ShieldX, TestTube2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Principal } from '@/types/authz';

export function EmptyResult({ message = 'Run a test to see results' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2.5 text-muted-foreground">
      <TestTube2 className="h-8 w-8 opacity-20" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function FullResponse({ data }: { data: unknown }) {
  return (
    <details className="group rounded-md border overflow-hidden">
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        View full response
      </summary>
      <pre className="border-t bg-muted/40 px-4 py-3 overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

export function DecisionBanner({ allowed, label, detail }: { allowed: boolean; label: string; detail: string }) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-md border-l-4 px-4 py-3',
      allowed
        ? 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
        : 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
    )}>
      {allowed
        ? <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        : <ShieldX className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />}
      <div>
        <p className={cn(
          'text-sm font-semibold leading-tight',
          allowed ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
        )}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

export function ResultTable({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-border">
        {rows.map(({ label, value }) => (
          <tr key={label}>
            <td className="py-2 pr-6 align-top text-xs font-medium text-muted-foreground w-28 whitespace-nowrap">{label}</td>
            <td className="py-2 text-xs">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MatchedPrincipals({ ids, principals }: { ids: string[]; principals: Principal[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Matched Principals</p>
      <div className="flex flex-wrap gap-1.5">
        {ids.length > 0
          ? ids.map((id) => {
              const principal = principals.find((p) => p.id === id);
              return (
                <Badge key={id} variant="secondary" className="flex flex-col items-start gap-0 px-2 py-1 cursor-pointer hover:bg-secondary/80 h-auto">
                  <span className="text-xs font-normal leading-tight">{principal?.name || id}</span>
                  {principal?.name && <span className="text-[10px] font-mono text-muted-foreground leading-tight">{id}</span>}
                </Badge>
              );
            })
          : <span className="text-xs text-muted-foreground italic">No principals matched</span>}
      </div>
    </div>
  );
}
