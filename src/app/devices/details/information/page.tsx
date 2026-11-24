'use client';

import React, { useEffect, useState } from 'react';
import { differenceInDays, format, isPast, parseISO } from 'date-fns';
import { ArrowUpRight, History, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { DetailSection } from '@/components/shared/DetailSection';
import { LinkField, ReadOnlyField } from '@/components/shared/DecodedCertificateSections';
import { formatIdentifier } from '@/components/shared/IdentifierDisplay';
import { BlockSkeleton } from '@/components/shared/PageSkeletons';
import Link from '@/components/shared/RouterLink';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { fetchIssuedCertificate } from '@/lib/issued-certificate-data';
import { cn } from '@/lib/utils';
import type { CertificateData } from '@/types/certificate';
import { getCertSubjectCommonName, useDeviceDetails } from '../DeviceContext';

const ASIDE_LINK_CLASS = buttonVariants({ variant: 'secondary', size: 'sm' });

const formatDate = (iso: string | undefined) => {
  if (!iso) return undefined;
  const date = parseISO(iso);
  return Number.isNaN(date.getTime()) ? undefined : format(date, 'PPpp');
};

/** Timeline between Valid From and Valid To: elapsed share of the validity and the time left. */
function ValidityTimeline({ validFrom, validTo }: Readonly<{ validFrom: string; validTo: string }>) {
  const from = parseISO(validFrom).getTime();
  const to = parseISO(validTo).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const percent = to > from ? Math.min(100, Math.max(0, Math.round(((Date.now() - from) / (to - from)) * 100))) : 100;
  const expired = isPast(to);
  const daysLeft = differenceInDays(to, Date.now());

  return (
    <div className="col-span-2 space-y-1.5">
      <Progress
        value={percent}
        className={cn('h-1.5 rounded-sm', expired && '[&_[data-slot=progress-indicator]]:bg-destructive')}
        aria-label={`${percent}% of the certificate validity period elapsed`}
      />
      <div className="flex justify-between gap-4 text-xs tabular-nums text-muted-foreground">
        <span>{percent}% elapsed</span>
        <span className={cn((expired || daysLeft <= 30) && 'text-destructive')}>
          {expired ? 'Expired' : daysLeft === 0 ? 'Expires today' : `${daysLeft}d remaining`}
        </span>
      </div>
    </div>
  );
}

type ActiveCertificate =
  | { status: 'loading' }
  | { status: 'loaded'; certificate: CertificateData }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/** The certificate of the identity's active version, fetched by serial number. */
function useActiveCertificate(serialNumber: string | undefined): ActiveCertificate | null {
  const [state, setState] = useState<ActiveCertificate | null>(null);
  useEffect(() => {
    if (!serialNumber) {
      setState(null);
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchIssuedCertificate(serialNumber)
      .then((certificate) => {
        if (!cancelled) setState(certificate ? { status: 'loaded', certificate } : { status: 'missing' });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load the certificate.' });
      });
    return () => { cancelled = true; };
  }, [serialNumber]);
  return state;
}

export default function InformationPage() {
  const { device, deviceId, openAssignIdentityModal, raForIntegration, activeIntegration } = useDeviceDetails();
  const { mode } = useIdentifierDisplay();
  const identity = device?.identity ?? null;
  const activeSerial = identity ? identity.versions[identity.active_version] : undefined;
  const activeCertificate = useActiveCertificate(activeSerial);

  if (!device) return null;

  const versionCount = identity ? Object.keys(identity.versions).length : 0;
  const historyHref = `/devices/details/certificates-history?deviceId=${encodeURIComponent(deviceId ?? device.id)}`;
  const certificate = activeCertificate?.status === 'loaded' ? activeCertificate.certificate : null;

  return (
    <div>
      <DetailSection
        title="Device"
        description="Registration Authority that enrolled this device, its platform integration and tags."
        aside={device.dms_owner && (
          <Link href={`/registration-authorities/new?raId=${encodeURIComponent(device.dms_owner)}`} className={ASIDE_LINK_CLASS}>
            <ArrowUpRight className="h-3.5 w-3.5" /> Open Registration Authority
          </Link>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyField label="Registration Authority" value={raForIntegration?.name || device.dms_owner || undefined} />
          <ReadOnlyField label="Integration" value={activeIntegration?.typeName} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm leading-none font-medium">Tags</p>
          {(device.tags?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {device.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-sm">{tag}</Badge>)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tags</p>
          )}
        </div>
      </DetailSection>

      <Separator />

      <DetailSection
        title="Identity"
        description="The certificate this device authenticates with. Each renewal adds a new version."
        aside={identity && (
          <div className="flex flex-wrap gap-2">
            {certificate && (
              <Link
                href={`/certificates/details?certificateId=${encodeURIComponent(certificate.serialNumber)}`}
                className={ASIDE_LINK_CLASS}
              >
                <ArrowUpRight className="h-3.5 w-3.5" /> Open certificate
              </Link>
            )}
            <Link href={historyHref} className={ASIDE_LINK_CLASS}>
              <History className="h-3.5 w-3.5" /> Certificate history
            </Link>
          </div>
        )}
      >
        {!identity && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">No identity assigned. Assign a certificate so this device can authenticate.</p>
            <Button variant="secondary" onClick={openAssignIdentityModal}>
              <PlusCircle className="mr-2 h-3.5 w-3.5" /> Assign Identity
            </Button>
          </div>
        )}
        {identity && (
          <>
            <ReadOnlyField
              label="Active version"
              value={`v${identity.active_version} · ${versionCount} ${versionCount === 1 ? 'version' : 'versions'} in total`}
            />
            {activeCertificate?.status === 'loading' && <BlockSkeleton label="Loading the active certificate…" className="h-32" />}
            {certificate && (
              <div className="grid grid-cols-2 gap-4">
                <ReadOnlyField label="Common Name (CN)" value={getCertSubjectCommonName(certificate.subject)} className="col-span-2" />
                <ReadOnlyField label="Issuer" value={getCertSubjectCommonName(certificate.issuer)} />
                <ReadOnlyField label="Key Algorithm" value={certificate.publicKeyAlgorithm} />
                <LinkField
                  label="Serial Number"
                  href={`/certificates/details?certificateId=${encodeURIComponent(certificate.serialNumber)}`}
                  mono
                  className="col-span-2"
                >
                  {formatIdentifier(certificate.serialNumber, mode)}
                </LinkField>
                <ReadOnlyField label="Valid From" value={formatDate(certificate.validFrom)} />
                <ReadOnlyField label="Valid To" value={formatDate(certificate.validTo)} />
                <ValidityTimeline validFrom={certificate.validFrom} validTo={certificate.validTo} />
              </div>
            )}
            {activeCertificate?.status === 'missing' && (
              <p className="text-sm text-muted-foreground">
                The active certificate ({activeSerial}) was not found. It may have been deleted.
              </p>
            )}
            {activeCertificate?.status === 'error' && <p className="text-sm text-destructive">{activeCertificate.message}</p>}
          </>
        )}
      </DetailSection>
    </div>
  );
}
