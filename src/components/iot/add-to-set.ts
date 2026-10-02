/**
 * Whether a distribution set can take one more software module, and if not, why.
 *
 * Used by the "Add to distribution set" dialog to grey out the sets that cannot, instead of hiding
 * them or offering them and then failing. The reasons mirror what the backend refuses:
 *  - the set already holds the module;
 *  - the backend froze its composition because devices were targeted (hawkBit: `locked`, set when a
 *    campaign is created or a device is assigned the set);
 *  - native freezes composition at the build, so a built set is closed (hawkBit does not: a built
 *    set nobody was sent can still change).
 */
export interface SetState {
  built: boolean;
  /** hawkBit's own lock. Absent/false on native. */
  locked: boolean;
}

export function setBlockedReason(opts: {
  alreadyHoldsModule: boolean;
  set: SetState;
  freezesAtBuild: boolean;
}): string | null {
  if (opts.alreadyHoldsModule) return 'already has this module';
  if (opts.set.locked) return 'already sent to devices';
  if (opts.freezesAtBuild && opts.set.built) return 'already built';
  return null;
}
