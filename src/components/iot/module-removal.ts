// When a software module can be removed from a distribution set, mirroring the backends' own rules so
// the action is offered exactly when it would be accepted:
//
//  - the os module is mandatory in every composition, on both backends, so it never can be;
//  - native freezes a set version's composition once it is built (RemoveSoftwareModule refuses);
//  - hawkBit allows it until the SET VERSION has been assigned to a device, built or not
//    (refuseIfAssigned checks the set's own lock). The set's `locked` is the signal. A module's own
//    lock is not: hawkBit locks a module once ANY set holding it is assigned, so a new set version
//    that still links last release's module showed its modules as locked — and Unlink disabled — on
//    the very version that exists to swap them. The module lock is only a fallback for a caller that
//    does not know the set's state. The backend still has the final word, and its refusal is shown.

export function moduleRemovalBlockedReason({
  type,
  locked,
  packLocked,
  packIsBuilt,
  backend,
}: {
  type: string;
  /** The module's own lock (fallback only — see above). */
  locked?: boolean;
  /** The set version's lock (UpdatePack.locked); decides on hawkBit when known. */
  packLocked?: boolean;
  packIsBuilt: boolean;
  backend: string | null;
}): string | null {
  if (type === 'os') return 'The OS module is mandatory in every distribution set';
  if (backend === 'hawkbit') {
    return (packLocked ?? locked) ? 'This set has been assigned to devices — create a new version to change it' : null;
  }
  return packIsBuilt ? 'This version is already built — create a new version to change its composition' : null;
}
