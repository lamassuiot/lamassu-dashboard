import { describe, expect, it } from 'vitest';
import { FlaskConical, Puzzle } from 'lucide-react';
import type { ModuleDescriptor } from '@lamassu/mfe-sdk';
import { mergeNavigation, type NavGroup } from './navigation';
import { resolveModuleIcon } from './module-icons';

const Icon = () => null;
const base = (): NavGroup[] => [
  { items: [{ href: '/', label: 'Home', icon: Icon }] },
  { label: 'PKI', items: [{ href: '/certificates', label: 'Certificates', icon: Icon }] },
  { label: 'TOOLS', items: [{ href: '/openapi-spec', label: 'OpenAPI Spec', icon: Icon }] },
];
const module = (over: Omit<Partial<ModuleDescriptor>, 'nav'> & { nav?: Partial<ModuleDescriptor['nav']> } = {}): ModuleDescriptor => ({
  name: 'poc_service',
  entry: '/ui/modules/poc-service/remoteEntry.js',
  basePath: '/poc-service',
  ...over,
  nav: { group: 'ENTERPRISE', label: 'PoC Service', icon: 'flask-conical', ...over.nav },
});

describe('mergeNavigation', () => {
  it('appends a module to an existing group with the same label', () => {
    const merged = mergeNavigation(base(), [module({ nav: { group: 'PKI' } })]);
    expect(merged).toHaveLength(3);
    expect(merged[1].items.map((i) => i.href)).toEqual(['/certificates', '/poc-service']);
  });

  it('creates a new group after all native ones and shares it between modules, in manifest order', () => {
    const merged = mergeNavigation(base(), [
      module(),
      module({ name: 'second', basePath: '/second', nav: { label: 'Second' } }),
    ]);
    expect(merged.map((g) => g.label)).toEqual([undefined, 'PKI', 'TOOLS', 'ENTERPRISE']);
    expect(merged[3].items.map((i) => i.href)).toEqual(['/poc-service', '/second']);
  });

  it('maps basePath to href, resolves the icon and copies uiAuthzCapabilities', () => {
    const [item] = mergeNavigation(base(), [module({ nav: { uiAuthzCapabilities: 'pki.poc.thing' } })])[3].items;
    expect(item).toEqual({ href: '/poc-service', label: 'PoC Service', icon: FlaskConical, uiAuthzCapabilities: 'pki.poc.thing' });
  });

  it('skips a module whose basePath equals an existing item href', () => {
    const merged = mergeNavigation(base(), [module({ basePath: '/certificates' })]);
    expect(merged).toEqual(base());
  });

  it('does not mutate the base configuration', () => {
    const original = base();
    const snapshot = structuredClone(original.map((g) => ({ ...g, items: g.items.map(({ icon: _icon, ...rest }) => rest) })));
    mergeNavigation(original, [module({ nav: { group: 'PKI' } }), module({ name: 'b', basePath: '/b' })]);
    expect(original.map((g) => ({ ...g, items: g.items.map(({ icon: _icon, ...rest }) => rest) }))).toEqual(snapshot);
  });
});

describe('resolveModuleIcon', () => {
  it('resolves a known lucide icon name', () => {
    expect(resolveModuleIcon('flask-conical')).toBe(FlaskConical);
  });

  it('falls back to Puzzle for unknown or missing names', () => {
    expect(resolveModuleIcon('does-not-exist')).toBe(Puzzle);
    expect(resolveModuleIcon(undefined)).toBe(Puzzle);
  });
});
