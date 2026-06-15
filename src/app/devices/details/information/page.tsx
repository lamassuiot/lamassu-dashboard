'use client';

import { Button } from '@/components/ui/button';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { PlusCircle } from 'lucide-react';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { getDisplayDateFormat } from '@/lib/config';
import { useDeviceDetails } from '../DeviceContext';

function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <dl className="divide-y px-4">{children}</dl>
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export default function InformationPage() {
  const { device, openAssignIdentityModal } = useDeviceDetails();
  if (!device) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DetailPanel title="Device Details">
        <DetailRow label="Device ID">
          <code className="block truncate font-mono text-xs" title={device.id}>{device.id}</code>
        </DetailRow>
        <DetailRow label="Status">
          <ApiStatusBadge status={device.status} />
        </DetailRow>
        <DetailRow label="Created">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span>{format(parseISO(device.creation_timestamp), getDisplayDateFormat())}</span>
            <span className="text-xs text-muted-foreground">({formatDistanceToNowStrict(parseISO(device.creation_timestamp))} ago)</span>
          </div>
        </DetailRow>
        {device.dms_owner && (
          <DetailRow label="Registration Authority">
            <a href={`/registration-authorities/details?raId=${device.dms_owner}`} className="block truncate text-primary hover:underline">
              {device.dms_owner}
            </a>
          </DetailRow>
        )}
        {(device.tags?.length ?? 0) > 0 && (
          <DetailRow label="Tags">
            <span className="block truncate" title={device.tags.join(', ')}>{device.tags.join(', ')}</span>
          </DetailRow>
        )}
      </DetailPanel>

      <DetailPanel title="Identity">
        {device.identity ? (
          <>
            <DetailRow label="Status"><ApiStatusBadge status={device.identity.status} /></DetailRow>
            <DetailRow label="Type">{device.identity.type}</DetailRow>
            <DetailRow label="Active Certificate">
              {device.identity.versions[device.identity.active_version] ? (
                <a
                  href={`/certificates/details?certificateId=${device.identity.versions[device.identity.active_version]}`}
                  className="block truncate font-mono text-xs text-primary hover:underline"
                >
                  {device.identity.versions[device.identity.active_version]}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            <DetailRow label="Total Versions">
              {Object.keys(device.identity.versions).length}
            </DetailRow>
            {device.identity.expiration_date && (
              <DetailRow label="Certificate Expiration">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span>{format(parseISO(device.identity.expiration_date), getDisplayDateFormat())}</span>
                  <span className="text-xs text-muted-foreground">({formatDistanceToNowStrict(parseISO(device.identity.expiration_date))})</span>
                </div>
              </DetailRow>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 py-3">
            <p className="text-sm text-muted-foreground">No identity assigned to this device.</p>
            <Button variant="secondary" onClick={openAssignIdentityModal}>
              <PlusCircle className="mr-2 h-3.5 w-3.5" /> Assign Identity
            </Button>
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
