import { describe, expect, it } from 'vitest';
import { setBlockedReason } from './add-to-set';

const open = { built: false, locked: false };

describe('setBlockedReason', () => {
  it('lets an editable set take the module', () => {
    expect(setBlockedReason({ alreadyHoldsModule: false, set: open, freezesAtBuild: false })).toBeNull();
    expect(setBlockedReason({ alreadyHoldsModule: false, set: open, freezesAtBuild: true })).toBeNull();
  });

  it('refuses a set that already holds the module, whatever its state', () => {
    expect(setBlockedReason({ alreadyHoldsModule: true, set: open, freezesAtBuild: false })).toBe('already has this module');
    expect(setBlockedReason({ alreadyHoldsModule: true, set: { built: true, locked: true }, freezesAtBuild: true })).toBe('already has this module');
  });

  it('refuses a set the backend locked because devices were targeted', () => {
    expect(setBlockedReason({ alreadyHoldsModule: false, set: { built: true, locked: true }, freezesAtBuild: false })).toBe('already sent to devices');
    expect(setBlockedReason({ alreadyHoldsModule: false, set: { built: false, locked: true }, freezesAtBuild: false })).toBe('already sent to devices');
  });

  it('closes a built set on native, where composition freezes at the build', () => {
    expect(setBlockedReason({ alreadyHoldsModule: false, set: { built: true, locked: false }, freezesAtBuild: true })).toBe('already built');
  });

  it('keeps a built set open on hawkBit until devices are targeted', () => {
    expect(setBlockedReason({ alreadyHoldsModule: false, set: { built: true, locked: false }, freezesAtBuild: false })).toBeNull();
  });

  it('says "sent to devices" before "built" when both apply on native', () => {
    expect(setBlockedReason({ alreadyHoldsModule: false, set: { built: true, locked: true }, freezesAtBuild: true })).toBe('already sent to devices');
  });
});
