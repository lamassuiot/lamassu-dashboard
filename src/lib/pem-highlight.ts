// Line classifier for PEM text (single objects or bundles such as certificate chains).

export type PemLine =
  | { kind: 'boundary'; edge: 'BEGIN' | 'END'; label: string }
  /** Explanatory text around blocks, e.g. `subject=` lines from `openssl -print_certs`. */
  | { kind: 'meta'; text: string }
  | { kind: 'body'; text: string }
  | { kind: 'blank' };

const BOUNDARY = /^-----(BEGIN|END) ([A-Z0-9 #]+)-----\s*$/;

export function highlightPem(source: string): PemLine[] {
  let insideBlock = false;
  return source.split('\n').map((raw): PemLine => {
    const line = raw.replace(/\r$/, '');
    const match = BOUNDARY.exec(line.trim());
    if (match) {
      const edge = match[1] as 'BEGIN' | 'END';
      insideBlock = edge === 'BEGIN';
      return { kind: 'boundary', edge, label: match[2] };
    }
    if (!line.trim()) return { kind: 'blank' };
    return insideBlock ? { kind: 'body', text: line } : { kind: 'meta', text: line };
  });
}

