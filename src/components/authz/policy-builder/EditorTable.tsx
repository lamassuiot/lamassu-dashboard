import type { ReactNode } from 'react';
import { Table } from '@/components/ui/table';

/** Header row for editable tables: no hover, muted small labels. */
export const headRowClass =
  'hover:bg-transparent [&>th]:h-9 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground';

/** Editable table framed by top and bottom borders only, flush with the surrounding fields. */
export function EditorTable({ children }: { children: ReactNode }) {
  return (
    <div className="border-y">
      <Table>{children}</Table>
    </div>
  );
}
