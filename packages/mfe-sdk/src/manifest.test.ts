import { describe, expect, it, vi } from 'vitest';
import { parseManifest } from './manifest';

const valid = {
  name: 'poc_service',
  entry: '/ui/modules/poc-service/remoteEntry.js',
  basePath: '/poc-service',
  nav: { group: 'ENTERPRISE', label: 'PoC Service', icon: 'flask-conical', uiAuthzCapabilities: 'pki.poc.thing' },
};

const manifest = (modules: unknown[], version: unknown = 1) => ({ version, modules });

describe('parseManifest', () => {
  it('returns valid descriptors unchanged', () => {
    expect(parseManifest(manifest([valid]))).toEqual([valid]);
  });

  it('accepts a module without optional nav fields', () => {
    const minimal = { ...valid, nav: { group: 'ENTERPRISE', label: 'PoC Service' } };
    expect(parseManifest(manifest([minimal]))).toEqual([minimal]);
  });

  it.each([
    ['version 2', manifest([valid], 2)],
    ['a string', 'nope'],
    ['null', null],
    ['modules not an array', { version: 1, modules: {} }],
  ])('returns [] for %s', (_label, raw) => {
    expect(parseManifest(raw)).toEqual([]);
  });

  it.each([
    ['name with a dash', { ...valid, name: 'poc-service' }],
    ['name starting with a digit', { ...valid, name: '1abc' }],
    ['basePath without a leading slash', { ...valid, basePath: 'poc' }],
    ['basePath equal to /', { ...valid, basePath: '/' }],
    ['empty entry', { ...valid, entry: '' }],
    ['empty nav.label', { ...valid, nav: { ...valid.nav, label: '' } }],
    ['empty nav.group', { ...valid, nav: { ...valid.nav, group: '' } }],
    ['missing nav', { name: 'x', entry: '/x.js', basePath: '/x' }],
    ['entry that is not a URL ("http://")', { ...valid, entry: 'http://' }],
    ['entry with a space in the host', { ...valid, entry: 'https://exa mple.com/x.js' }],
    ['entry using the data: scheme', { ...valid, entry: 'data:text/javascript,alert(1)' }],
    ['entry using the javascript: scheme', { ...valid, entry: 'javascript:alert(1)' }],
    ['entry using the ftp: scheme', { ...valid, entry: 'ftp://host/remoteEntry.js' }],
  ])('drops an entry with %s, reports it once and keeps valid siblings', (_label, bad) => {
    const other = { ...valid, name: 'other', basePath: '/other' };
    const onInvalid = vi.fn();
    expect(parseManifest(manifest([bad, other]), onInvalid)).toEqual([other]);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a path', '/ui/modules/poc-service/remoteEntry.js'],
    ['an http URL', 'http://localhost:9010/remoteEntry.js'],
    ['an https URL', 'https://cdn.example.com/x/remoteEntry.js'],
  ])('accepts an entry that is %s', (_label, entry) => {
    expect(parseManifest(manifest([{ ...valid, entry }]))).toHaveLength(1);
  });

  it('normalizes a trailing slash in basePath', () => {
    expect(parseManifest(manifest([{ ...valid, basePath: '/poc/' }]))[0].basePath).toBe('/poc');
  });

  it('drops a later entry with a duplicate name and reports it', () => {
    const onInvalid = vi.fn();
    const dup = { ...valid, basePath: '/another' };
    expect(parseManifest(manifest([valid, dup]), onInvalid)).toEqual([valid]);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it('drops a later entry with a duplicate basePath and reports it', () => {
    const onInvalid = vi.fn();
    const dup = { ...valid, name: 'another' };
    expect(parseManifest(manifest([valid, dup]), onInvalid)).toEqual([valid]);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });
});
