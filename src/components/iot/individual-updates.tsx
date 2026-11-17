'use client';

import React from 'react';
import Link from '@/components/shared/RouterLink';
import { format, parseISO } from 'date-fns';
import { Ban, Cpu, Loader2, Network, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UpdateStatusBadge } from '@/components/devices/DeviceUpdatePacksTab';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import { cancelIndividualUpdate, fetchDevicePackUpdates } from '@/lib/iot-api';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DevicePackUpdate } from '@/types/iot';

// Individual updates: attempts sent to one device outside any fleet campaign — a direct install
// (force-version, sync-to-latest) or, in hawkBit mode, a campaign's "retry failed devices".

export const deviceUpdateStatusHref = (deviceId: string) =>
  `/devices/details/update-status?deviceId=${encodeURIComponent(deviceId)}`;

const campaignHref = (groupId: string, campaignId: string) =>
  `/updates/details?groupId=${encodeURIComponent(groupId)}&campaignId=${encodeURIComponent(campaignId)}`;

// Widths the shared campaigns table caps its text columns at, so one long name cannot push the actions off screen.
export const NAME_CELL_MAX = 'max-w-[240px]';
export const SET_CELL_MAX = 'max-w-[200px]';
export const GROUP_CELL_MAX = 'max-w-[180px]';
export const POLICY_CELL_MAX = 'min-w-[150px] max-w-[170px]';

const transition = (u: DevicePackUpdate) =>
  `${u.version_from ? `v${u.version_from}` : 'none'} → ${u.version_to ? `v${u.version_to}` : '—'}`;

/** What sent an individual update: a direct install, or the retry of a named campaign. */
export function IndividualOrigin({ update, campaignName }: { update: DevicePackUpdate; campaignName?: string }) {
  if (update.origin === 'retry' && update.retry_of_launch_id) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap text-xs">
        <RotateCcw className="h-3 w-3 shrink-0 text-muted-foreground" />
        Retry of{' '}
        <Link
          href={campaignHref(update.group_id, update.retry_of_launch_id)}
          title={campaignName ?? `campaign ${update.retry_of_launch_id}`}
          className="min-w-0 truncate text-primary hover:underline"
        >
          {campaignName ?? `campaign ${update.retry_of_launch_id}`}
        </Link>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Send className="h-3 w-3 shrink-0" />
      Direct install
    </span>
  );
}

/** Confirms and sends the cancel of one individual update; what cancel means differs per backend. */
export function CancelIndividualUpdateDialog({
  update, onClose, onCancelled,
}: {
  update: DevicePackUpdate | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { backend } = useUpdatesCapabilities();
  const [busy, setBusy] = React.useState(false);

  const confirm = async () => {
    if (!update) return;
    setBusy(true);
    try {
      await cancelIndividualUpdate({ groupId: update.group_id, updateId: update.id });
      sileo.success({
        title: 'Update cancelled',
        description: backend === 'hawkbit'
          ? `${update.device_id} was asked to cancel ${update.distribution_set_name} v${update.version_to}.`
          : `${update.device_id} will not receive ${update.distribution_set_name} v${update.version_to}.`,
      });
      onCancelled();
      onClose();
    } catch (err) {
      sileo.error({ title: 'Could not cancel the update', description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={update !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Cancel this update?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            {update && (
              <span className="block font-medium">
                {update.distribution_set_name} {transition(update)} on {update.device_id}
              </span>
            )}
            <span className="block">
              {backend === 'hawkbit'
                ? 'The device is told to drop the update. If it is already installing, the cancel waits for the device to confirm it, and an install that is too far along may still finish.'
                : 'The update is withdrawn before the device starts it, so the device never receives it.'}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep update</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} className="bg-destructive hover:bg-destructive/90" disabled={busy}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</> : 'Cancel update'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const KIND_BADGE = {
  fleet: { icon: Network, label: 'Fleet campaign', detail: 'Rolls a distribution set out to a device group.', cls: 'bg-primary/10 text-primary' },
  individual: { icon: Cpu, label: 'Individual update', detail: 'Sent to one device, outside any campaign.', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
} as const;

/** Tells a fleet campaign from an individual update in the shared campaigns table: an icon, named on hover. */
export function UpdateKindBadge({ kind }: { kind: keyof typeof KIND_BADGE }) {
  const { icon: Icon, label, detail, cls } = KIND_BADGE[kind];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={cn('inline-flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded-full', cls)}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-[220px]">
            <p className="font-medium">{label}</p>
            <p className="text-xs opacity-80">{detail}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// How far one device got, drawn like a campaign's progress bar.
const SINGLE_PROGRESS: Record<DevicePackUpdate['status'], { pct: number; bar: string; label: string }> = {
  pending: { pct: 0, bar: 'bg-muted-foreground/40', label: '0/1 device' },
  running: { pct: 50, bar: 'bg-primary animate-pulse', label: 'Installing' },
  success: { pct: 100, bar: 'bg-emerald-500', label: '1/1 device' },
  failed: { pct: 100, bar: 'bg-destructive', label: '0/1 device' },
  cancelled: { pct: 0, bar: 'bg-muted-foreground/40', label: '0/1 device' },
};

const ORIGIN_TONE: Record<DevicePackUpdate['status'], string> = {
  pending: 'text-muted-foreground',
  running: 'text-primary',
  success: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground',
};

/** One individual update as a row of the campaigns table, filling the same columns a campaign does. */
export function IndividualUpdateRow({
  update: u, groupName, campaignName, onCancel,
}: {
  update: DevicePackUpdate;
  groupName?: string;
  campaignName?: string;
  onCancel: (u: DevicePackUpdate) => void;
}) {
  const sent = u.created_at || u.timestamp_init;
  const OriginIcon = u.origin === 'retry' ? RotateCcw : Send;
  const progress = SINGLE_PROGRESS[u.status] ?? SINGLE_PROGRESS.pending;
  const statusHref = deviceUpdateStatusHref(u.device_id);
  return (
    <TableRow data-kind="individual">
      <TableCell>
        <div className="flex items-start gap-2.5">
          <OriginIcon className={cn('mt-0.5 h-5 w-5 shrink-0', ORIGIN_TONE[u.status])} aria-hidden />
          <div className={cn('min-w-0', NAME_CELL_MAX)}>
            <Link href={statusHref} title={u.device_id} className="inline-flex max-w-full items-center gap-1.5 font-medium hover:text-primary hover:underline">
              <span className="truncate">{u.device_id}</span>
            </Link>
            <div className="mt-0.5 text-xs text-muted-foreground">v{u.version_to}</div>
            <div className="mt-0.5"><IndividualOrigin update={u} campaignName={campaignName} /></div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {u.distribution_set_name && (
          <Link
            href={`/updates/pack-details?groupId=${encodeURIComponent(u.group_id)}&packName=${encodeURIComponent(u.distribution_set_name)}`}
            title={u.distribution_set_name}
            className={cn('block truncate text-sm hover:text-primary hover:underline', SET_CELL_MAX)}
          >
            {u.distribution_set_name}
          </Link>
        )}
        <div className="font-mono text-xs text-muted-foreground">{transition(u)}</div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Link
            href={`/device-groups/details?groupId=${encodeURIComponent(u.group_id)}`}
            title={groupName ?? u.group_id}
            className={cn('min-w-0 truncate text-sm hover:text-primary hover:underline', GROUP_CELL_MAX)}
          >
            {groupName ?? u.group_id}
          </Link>
          <UpdateKindBadge kind="individual" />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {sent && (
          <div className="text-sm">
            <div>{format(parseISO(sent), 'PP')}</div>
            <div className="text-xs text-muted-foreground">{format(parseISO(sent), 'p')}</div>
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', progress.bar)} style={{ width: `${progress.pct}%` }} />
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{progress.label}</span>
        </div>
      </TableCell>
      <TableCell><span className="text-xs text-muted-foreground">—</span></TableCell>
      <TableCell><UpdateStatusBadge status={u.status} /></TableCell>
      <TableCell>
        <div className={cn('whitespace-normal text-xs', POLICY_CELL_MAX)}>
          <div className="font-medium">Single device</div>
          <div className="text-muted-foreground">Not part of a campaign</div>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={statusHref}>View</Link>
          </Button>
          {u.cancellable && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => onCancel(u)}>
              <Ban className="h-4 w-4" />Cancel
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** On a device's Update Status tab: each of its individual updates that can still be cancelled. */
export function IndividualUpdateCancelBanner({ deviceId, onCancelled }: { deviceId: string; onCancelled?: () => void }) {
  const [cancellable, setCancellable] = React.useState<DevicePackUpdate[]>([]);
  const [cancelTarget, setCancelTarget] = React.useState<DevicePackUpdate | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { list } = await fetchDevicePackUpdates({ deviceId, pageSize: 20 });
      setCancellable(list.filter(u => u.origin && u.cancellable));
    } catch {
      setCancellable([]); // The tab below reports its own load errors.
    }
  }, [deviceId]);

  React.useEffect(() => { load(); }, [load]);

  if (cancellable.length === 0) return null;
  return (
    <div className="mb-6 space-y-2">
      {cancellable.map((u) => (
        <Alert key={u.id}>
          <Send className="h-4 w-4" />
          <AlertTitle>
            {u.origin === 'retry' ? 'Retry' : 'Direct install'} of {u.distribution_set_name} v{u.version_to} not finished
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Sent outside any campaign, so it can only be cancelled here or from the Individual updates list on the Campaigns page.
            </span>
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setCancelTarget(u)}>
              <Ban className="h-4 w-4" />Cancel update
            </Button>
          </AlertDescription>
        </Alert>
      ))}
      <CancelIndividualUpdateDialog update={cancelTarget} onClose={() => setCancelTarget(null)} onCancelled={() => { load(); onCancelled?.(); }} />
    </div>
  );
}
