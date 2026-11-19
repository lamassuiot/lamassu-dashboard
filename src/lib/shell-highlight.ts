// Minimal POSIX shell tokenizer for read-only command snippets. It is not a parser:
// it only classifies enough to colour commands, flags, strings, variables, operators,
// comments and heredoc bodies the way documentation sites do.

export type ShellTokenKind =
  | 'command'
  | 'flag'
  | 'string'
  | 'variable'
  | 'operator'
  | 'comment'
  | 'continuation'
  | 'heredoc'
  | 'text';

export interface ShellToken {
  kind: ShellTokenKind;
  value: string;
}

export type ShellLineKind = 'command' | 'continuation' | 'comment' | 'heredoc' | 'blank';

export interface ShellLine {
  kind: ShellLineKind;
  tokens: ShellToken[];
}

const OPERATORS = ['&&', '||', '>>', '2>', '<<', '|', '>', '<', ';', '$(', '(', ')'];
/** Operators after which the next word is a new command. */
const COMMAND_SEPARATORS = new Set(['&&', '||', '|', ';', '$(', '(']);

function readQuoted(line: string, start: number): number {
  const quote = line[start];
  let i = start + 1;
  while (i < line.length && line[i] !== quote) {
    if (quote === '"' && line[i] === '\\') i++;
    i++;
  }
  return Math.min(i + 1, line.length);
}

function readVariable(line: string, start: number): number {
  if (line[start + 1] === '{') {
    const end = line.indexOf('}', start);
    return end === -1 ? line.length : end + 1;
  }
  let i = start + 1;
  while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) i++;
  return i;
}

function readWord(line: string, start: number): number {
  let i = start;
  while (i < line.length && !/[\s|&;<>()'"]/.test(line[i])) {
    if (line[i] === '$' && i > start) break;
    i++;
  }
  return Math.max(i, start + 1);
}

interface TokenizeResult {
  tokens: ShellToken[];
  heredocDelimiter: string | null;
}

function tokenizeLine(line: string, startsCommand: boolean): TokenizeResult {
  const tokens: ShellToken[] = [];
  let expectCommand = startsCommand;
  let heredocDelimiter: string | null = null;
  let pendingHeredoc = false;
  let i = 0;

  const push = (kind: ShellTokenKind, value: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && kind === 'text') last.value += value;
    else tokens.push({ kind, value });
  };

  while (i < line.length) {
    const ch = line[i];

    if (/\s/.test(ch)) {
      let j = i;
      while (j < line.length && /\s/.test(line[j])) j++;
      push('text', line.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '\\' && i === line.length - 1) {
      push('continuation', ch);
      i++;
      continue;
    }

    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      push('comment', line.slice(i));
      break;
    }

    if (ch === "'" || ch === '"') {
      const end = readQuoted(line, i);
      const value = line.slice(i, end);
      if (pendingHeredoc) {
        heredocDelimiter = value.slice(1, -1);
        pendingHeredoc = false;
      }
      push('string', value);
      expectCommand = false;
      i = end;
      continue;
    }

    const op = OPERATORS.find((o) => line.startsWith(o, i));
    if (op) {
      push('operator', op);
      if (op === '<<') pendingHeredoc = true;
      if (COMMAND_SEPARATORS.has(op)) expectCommand = true;
      i += op.length;
      continue;
    }

    if (ch === '$') {
      const end = readVariable(line, i);
      push('variable', line.slice(i, end));
      expectCommand = false;
      i = end;
      continue;
    }

    const end = readWord(line, i);
    const word = line.slice(i, end);
    i = end;

    if (pendingHeredoc) {
      heredocDelimiter = word;
      pendingHeredoc = false;
      push('string', word);
    } else if (expectCommand && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      // Leading assignment: `NAME=value cmd` keeps expecting the command afterwards.
      const eq = word.indexOf('=');
      push('variable', word.slice(0, eq));
      push('operator', '=');
      push('text', word.slice(eq + 1));
    } else if (expectCommand) {
      push('command', word);
      expectCommand = false;
    } else if (word.startsWith('-')) {
      push('flag', word);
    } else {
      push('text', word);
    }
  }

  return { tokens, heredocDelimiter };
}

export function highlightShell(source: string): ShellLine[] {
  const lines: ShellLine[] = [];
  let continuing = false;
  let heredoc: string | null = null;

  for (const line of source.split('\n')) {
    if (heredoc !== null) {
      const closes = line.trim() === heredoc;
      lines.push({ kind: 'heredoc', tokens: [{ kind: closes ? 'operator' : 'heredoc', value: line }] });
      if (closes) heredoc = null;
      continue;
    }

    if (!line.trim()) {
      lines.push({ kind: 'blank', tokens: [] });
      continuing = false;
      continue;
    }

    const trimmed = line.trimStart();
    if (!continuing && trimmed.startsWith('#')) {
      lines.push({ kind: 'comment', tokens: [{ kind: 'comment', value: line }] });
      continue;
    }

    const kind: ShellLineKind = continuing ? 'continuation' : 'command';
    const { tokens, heredocDelimiter } = tokenizeLine(line, !continuing);
    lines.push({ kind, tokens });
    continuing = line.trimEnd().endsWith('\\');
    if (heredocDelimiter !== null) heredoc = heredocDelimiter;
  }

  return lines;
}
