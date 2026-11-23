import { describe, expect, it } from 'vitest';
import { resolveWispUrl, withAccessToken } from './wisp-url';

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

describe('withAccessToken', () => {
  it('adds the token to a URL on the page origin', () => {
    expect(withAccessToken('wss://dash.example.com/wisp/', 'abc.def', https)).toBe('wss://dash.example.com/wisp/?access_token=abc.def');
  });

  it('replaces a token already there and keeps other parameters', () => {
    expect(withAccessToken('wss://dash.example.com/wisp/?x=1&access_token=old', 'new', https)).toBe(
      'wss://dash.example.com/wisp/?x=1&access_token=new',
    );
  });

  it('encodes the token', () => {
    expect(withAccessToken('wss://dash.example.com/wisp/', 'a b&c', https)).toBe('wss://dash.example.com/wisp/?access_token=a+b%26c');
  });

  it('never gives the token to another origin', () => {
    expect(withAccessToken('wss://wisp.example/', 'secret', https)).toBe('wss://wisp.example/');
    expect(withAccessToken('wss://dash.example.com.evil.test/wisp/', 'secret', https)).toBe('wss://dash.example.com.evil.test/wisp/');
  });

  it('leaves the URL alone without a token, without a URL, or when it does not parse', () => {
    expect(withAccessToken('wss://dash.example.com/wisp/', null, https)).toBe('wss://dash.example.com/wisp/');
    expect(withAccessToken('wss://dash.example.com/wisp/', '', https)).toBe('wss://dash.example.com/wisp/');
    expect(withAccessToken(undefined, 'secret', https)).toBeUndefined();
    expect(withAccessToken('not a url', 'secret', https)).toBe('not a url');
  });
});
