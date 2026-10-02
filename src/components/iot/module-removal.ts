// When a software module can be removed from a distribution set, mirroring the backends' own rules so
// the action is offered exactly when it would be accepted:
//
//  - the os module is mandatory in every composition, on both backends, so it never can be;
//  - native freezes a set version's composition once it is built (RemoveSoftwareModule refuses);
//  - hawkBit allows it until the set has been ASSIGNED to a device, built or not (refuseIfAssigned).
//    The API carries no "assigned" flag, but hawkBit locks a set's modules on first assignment, so a
//    locked module is the signal. The backend still has the final word, and its refusal is shown.

export function moduleRemovalBlockedReason({
  type,
  locked,
  packIsBuilt,
  backend,
}: {
  type: string;
  locked?: boolean;
  packIsBuilt: boolean;
  backend: string | null;
}): string | null {
  if (type === 'os') return 'The OS module is mandatory in every distribution set';
  if (backend === 'hawkbit') {
    return locked ? 'This set has been assigned to devices — create a new version to change it' : null;
  }
  return packIsBuilt ? 'This version is already built — create a new version to change its composition' : null;
}
