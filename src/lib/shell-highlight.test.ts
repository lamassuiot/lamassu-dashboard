import { describe, it, expect } from 'vitest';
import { highlightShell, type ShellToken } from './shell-highlight';

const kinds = (tokens: ShellToken[]) => tokens.filter((t) => t.kind !== 'text').map((t) => [t.kind, t.value]);

describe('highlightShell', () => {
  it('classifies commands, flags, strings and continuations', () => {
    const [first, second, third] = highlightShell('curl --fail \\\n  --header "Accept: x" \\\n  "https://h"');
    expect(first.kind).toBe('command');
    expect(kinds(first.tokens)).toEqual([['command', 'curl'], ['flag', '--fail'], ['continuation', '\\']]);
    expect(second.kind).toBe('continuation');
    expect(kinds(second.tokens)).toEqual([['flag', '--header'], ['string', '"Accept: x"'], ['continuation', '\\']]);
    expect(third.kind).toBe('continuation');
  });

  it('treats the word after a pipe as a command', () => {
    const [, second] = highlightShell('openssl base64 -d \\\n  | openssl pkcs7 -print_certs');
    expect(kinds(second.tokens)).toEqual([['operator', '|'], ['command', 'openssl'], ['flag', '-print_certs']]);
  });

  it('recognises comments, blank lines, variables and assignments', () => {
    const lines = highlightShell('# note\n\nHOST=x\necho $HOST');
    expect(lines.map((l) => l.kind)).toEqual(['comment', 'blank', 'command', 'command']);
    expect(kinds(lines[2].tokens)).toEqual([['variable', 'HOST'], ['operator', '=']]);
    expect(kinds(lines[3].tokens)).toEqual([['command', 'echo'], ['variable', '$HOST']]);
  });

  it('keeps heredoc bodies verbatim', () => {
    const lines = highlightShell("cat > f.conf << 'EOF'\n[section]\nkey = 1 # not a comment\nEOF\nexport A=1");
    expect(lines.map((l) => l.kind)).toEqual(['command', 'heredoc', 'heredoc', 'heredoc', 'command']);
    expect(lines[2].tokens).toEqual([{ kind: 'heredoc', value: 'key = 1 # not a comment' }]);
  });

  it('treats 2> redirections as operators', () => {
    const [line] = highlightShell('openssl s_client </dev/null 2>/dev/null');
    expect(kinds(line.tokens)).toEqual([['command', 'openssl'], ['operator', '<'], ['operator', '2>']]);
  });
});
