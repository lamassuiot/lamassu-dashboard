import { describe, it, expect } from 'vitest';
import { highlightPem } from './pem-highlight';

const CERT = '-----BEGIN CERTIFICATE-----\nMIIB\nAAAA\n-----END CERTIFICATE-----';

describe('highlightPem', () => {
  it('classifies boundaries and body lines', () => {
    expect(highlightPem(CERT)).toEqual([
      { kind: 'boundary', edge: 'BEGIN', label: 'CERTIFICATE' },
      { kind: 'body', text: 'MIIB' },
      { kind: 'body', text: 'AAAA' },
      { kind: 'boundary', edge: 'END', label: 'CERTIFICATE' },
    ]);
  });

  it('accepts multi-word labels', () => {
    const [begin] = highlightPem('-----BEGIN EC PRIVATE KEY-----\nAA\n-----END EC PRIVATE KEY-----');
    expect(begin).toEqual({ kind: 'boundary', edge: 'BEGIN', label: 'EC PRIVATE KEY' });
  });

  it('treats text outside blocks as metadata', () => {
    const bundle = `subject=CN = leaf\r\n${CERT}\n\nsubject=CN = root\n${CERT}`;
    const lines = highlightPem(bundle);
    expect(lines[0]).toEqual({ kind: 'meta', text: 'subject=CN = leaf' });
    expect(lines[5]).toEqual({ kind: 'blank' });
    expect(lines.filter((l) => l.kind === 'boundary')).toHaveLength(4);
  });
});
