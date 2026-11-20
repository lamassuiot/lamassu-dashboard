import { describe, expect, it } from 'vitest';
import { resolveWispUrl } from './wisp-url';

const https = { protocol: 'https:', host: 'dash.example.com' };
const http = { protocol: 'http:', host: 'localhost:9002' };

describe('resolveWispUrl', () => {
  it('leaves an unset or blank value unset', () => {
    expect(resolveWispUrl(undefined, https)).toBeUndefined();
    expect(resolveWispUrl('   ', https)).toBeUndefined();
  });

  it('keeps absolute URLs, trimmed', () => {
    expect(resolveWispUrl('  wss://wisp.example/ ', https)).toBe('wss://wisp.example/');
    expect(resolveWispUrl('ws://10.0.0.5:3000/', https)).toBe('ws://10.0.0.5:3000/');
  });

  it('resolves a path against the page origin', () => {
    expect(resolveWispUrl('/wisp/', https)).toBe('wss://dash.example.com/wisp/');
    expect(resolveWispUrl('/wisp/', http)).toBe('ws://localhost:9002/wisp/');
  });

  it('does not treat a protocol-relative URL as a path', () => {
    expect(resolveWispUrl('//wisp.example/', https)).toBe('//wisp.example/');
  });
});
