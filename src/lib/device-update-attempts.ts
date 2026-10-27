import type { DevicePackUpdate } from '@/types/iot';

/** When an update attempt last moved: its end, else its start, else its creation (ISO, or ''). */
export function attemptTime(a: DevicePackUpdate): string {
  return a.timestamp_completed || a.timestamp_init || a.created_at || '';
}

/**
 * Each device's newest update attempt across all its distribution sets, from the per-(device, set)
 * attempts GET /devices/distribution-set-updates/latest returns. Cancelled attempts are skipped: the
 * update was withdrawn rather than tried, so it says nothing about how the device's last update went.
 *
 * This is the single definition of a device's "last update" — the OTA Devices page's per-device
 * status and the OTA Dashboard's failed-devices count both use it, so the count always matches the
 * list its link opens.
 */
export function newestAttemptByDevice(attempts: DevicePackUpdate[]): Map<string, DevicePackUpdate> {
  const newest = new Map<string, DevicePackUpdate>();
  for (const a of attempts) {
    if (a.status === 'cancelled') continue;
    const prev = newest.get(a.device_id);
    if (!prev || attemptTime(a) > attemptTime(prev)) newest.set(a.device_id, a);
  }
  return newest;
}

/** Devices whose last update (see newestAttemptByDevice) failed. */
export function devicesWithFailedLastUpdate(attempts: DevicePackUpdate[]): string[] {
  return [...newestAttemptByDevice(attempts).values()].filter((a) => a.status === 'failed').map((a) => a.device_id);
}
