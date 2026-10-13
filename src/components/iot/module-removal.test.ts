import { describe, expect, it } from 'vitest';
import { moduleRemovalBlockedReason } from './module-removal';

// Each case is a backend rule the action has to mirror: offering Remove where the backend refuses
// gives an error for a choice the UI presented as valid, and hiding it where the backend allows it
// leaves the operator with no way to change a composition they are entitled to change.
describe('moduleRemovalBlockedReason', () => {
  it('never allows the os module, on either backend', () => {
    for (const backend of ['native', 'hawkbit']) {
      expect(moduleRemovalBlockedReason({ type: 'os', packIsBuilt: false, backend })).toMatch(/mandatory/);
    }
  });

  it('native: allowed while the version is not built, refused once it is', () => {
    expect(moduleRemovalBlockedReason({ type: 'application', packIsBuilt: false, backend: 'native' })).toBeNull();
    expect(moduleRemovalBlockedReason({ type: 'application', packIsBuilt: true, backend: 'native' })).toMatch(/already built/);
  });

  it('hawkbit: the set version\'s lock decides, not the module\'s', () => {
    // A new version still linking last release's module: the module is locked (an older version was
    // assigned), the new set version is not — swapping that module is exactly what it is for.
    expect(moduleRemovalBlockedReason({ type: 'application', packIsBuilt: true, locked: true, packLocked: false, backend: 'hawkbit' })).toBeNull();
    expect(moduleRemovalBlockedReason({ type: 'application', packIsBuilt: true, locked: false, packLocked: true, backend: 'hawkbit' })).toMatch(/assigned/);
  });

  it('hawkbit without the set state: falls back to the module lock', () => {
    expect(moduleRemovalBlockedReason({ type: 'application', packIsBuilt: true, locked: false, backend: 'hawkbit' })).toBeNull();
    expect(moduleRemovalBlockedReason({ type: 'application', packIsBuilt: true, locked: true, backend: 'hawkbit' })).toMatch(/assigned/);
  });
});
