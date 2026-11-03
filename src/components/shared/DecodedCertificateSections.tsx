'use client';

import React, { useId, useState } from 'react';
import { format as formatDate } from 'date-fns';
import { ArrowUpRight, ExternalLink, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CrlViewerSheet } from '@/components/shared/CrlViewerSheet';
import Link from '@/components/shared/RouterLink';
import { formatIdentifier } from '@/components/shared/IdentifierDisplay';
import { useIdentifierDisplay } from '@/contexts/IdentifierDisplayContext';
import { parseCertificatePem, type DistinguishedNameFields, type ParsedCertificate } from '@/lib-crypto';
import { cn, formatCertificateUsageLabel } from '@/lib/utils';
import { QuantumAlgorithmIcon } from '@/components/shared/QuantumAlgorithmIcon';
import { RELATED_CERTIFICATE_TITLE } from '@/lib/related-certificate';

export interface DecodedCertInfo {
  subjectFields?: DistinguishedNameFields;
  issuer?: string;
  issuerFields?: DistinguishedNameFields;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  isCa?: boolean;
  pathLenConstraint?: number | 'None';
  publicKeyAlgorithm?: string;
  signatureAlgorithm?: string;
  keyUsage?: string[];
  extendedKeyUsage?: string[];
  sans?: string[];
  subjectKeyId?: string;
  authorityKeyId?: string;
  fingerprintSha256?: string;
  crlDistributionPoints?: string[];
  ocspUrls?: string[];
  caIssuersUrls?: string[];
  relatedCertificate?: { hashAlgorithm: string; hashValue: string };
  error?: string;
}

const NO_DN_FIELDS: DistinguishedNameFields = {};

const formatValidity = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'N/A' : formatDate(date, 'PPpp');
};

/** Maps parser output to the shape {@link DecodedCertificateSections} renders. */
export function toDecodedCertInfo(parsed: ParsedCertificate): DecodedCertInfo {
  return {
    subjectFields: parsed.subjectFields,
    issuer: parsed.issuer,
    issuerFields: parsed.issuerFields,
    serialNumber: parsed.serialNumber,
    validFrom: parsed.validFrom ? formatValidity(parsed.validFrom) : 'N/A',
    validTo: parsed.validTo ? formatValidity(parsed.validTo) : 'N/A',
    isCa: parsed.isCa ?? false,
    pathLenConstraint: parsed.pathLenConstraint,
    publicKeyAlgorithm: parsed.publicKeyAlgorithm,
    signatureAlgorithm: parsed.signatureAlgorithm,
    keyUsage: parsed.keyUsage,
    extendedKeyUsage: parsed.extendedKeyUsage,
    sans: parsed.sans,
    subjectKeyId: parsed.subjectKeyId,
    authorityKeyId: parsed.authorityKeyId,
    fingerprintSha256: parsed.fingerprintSha256,
    crlDistributionPoints: parsed.crlDistributionPoints,
    ocspUrls: parsed.ocspUrls,
    caIssuersUrls: parsed.caIssuersUrls,
    relatedCertificate: parsed.relatedCertificate,
  };
}

/** Never rejects: input that is not a PEM certificate comes back as `error`. */
export async function decodeCertificatePem(pem: string): Promise<DecodedCertInfo> {
  try {
    return toDecodedCertInfo(await parseCertificatePem(pem));
  } catch (e: any) {
    return { error: `Failed to parse certificate: ${e.message}` };
  }
}

// ── Fields ───────────────────────────────────────────────────────────────────

const FIELD_BOX_CLASS = 'flex min-h-8 min-w-0 items-center rounded-2xl bg-muted/50 px-2.5 py-1 text-sm';

/**
 * A labelled read-only text value, as {@link DecodedCertificateSections} shows certificate fields.
 * Pages use it for extra text fields; links and badges belong outside these sections.
 *
 * `undefined` means the certificate does not contain the value and `''` that it contains an empty
 * one; each gets its own placeholder so the two are not confused.
 */
export function ReadOnlyField({ label, value, mono, className }: Readonly<{
  label: string; value?: string; mono?: boolean; className?: string;
}>) {
  const id = useId();
  const placeholder = value === undefined ? 'Not specified' : value === '' ? 'Empty string ("")' : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        readOnly
        value={value ?? ''}
        placeholder={placeholder}
        className={cn('bg-muted/50 text-sm placeholder:italic', mono && 'font-mono')}
      />
    </div>
  );
}

function BadgeListField({ label, values, mono }: Readonly<{ label: string; values?: string[]; mono?: boolean }>) {
  if (!values?.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-none font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map(value => (
          <Badge key={value} variant="secondary" className={cn('text-sm', mono && 'font-mono')}>{value}</Badge>
        ))}
      </div>
    </div>
  );
}

/** Certificate URLs come from untrusted input, so only http(s) ones become links. */
const isWebUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/** A labelled link to another page of the app, boxed like the read-only fields and URL lists. */
export function LinkField({ label, href, children, mono, className }: Readonly<{
  label: string;
  href: string;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}>) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-sm leading-none font-medium">{label}</p>
      <div className={cn(FIELD_BOX_CLASS, mono && 'font-mono')}>
        <Link href={href} className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline">
          <span className="truncate">{children}</span>
          <ArrowUpRight className="h-3 w-3 shrink-0" />
        </Link>
      </div>
    </div>
  );
}

function UrlListField({ label, urls, action }: Readonly<{
  label: string;
  urls?: string[];
  /** Rendered at the right of each URL, such as a button acting on it. */
  action?: (url: string) => React.ReactNode;
}>) {
  if (!urls?.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-none font-medium">{label}</p>
      <div className="space-y-1">
        {urls.map(url => (
          <div key={url} className={cn(FIELD_BOX_CLASS, 'justify-between gap-2 font-mono')}>
            {isWebUrl(url) ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline">
                <span className="truncate">{url}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="truncate">{url}</span>
            )}
            {action?.(url)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** File name for a downloaded CRL: the last path segment of its URL, with a `.crl` extension. */
const crlFileName = (url: string) => {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (last) return last.toLowerCase().endsWith('.crl') ? last : `${last}.crl`;
  } catch {
    // Not a parseable URL; use the generic name.
  }
  return 'crl.crl';
};

/** Opens a CRL distribution point in the CRL viewer. The browser can only fetch HTTP(S) URLs. */
function FetchCrlButton({ url, onFetch }: Readonly<{ url: string; onFetch: (url: string) => void }>) {
  const fetchable = isWebUrl(url);
  const label = fetchable ? 'Fetch & show CRL' : 'Browsers can only fetch HTTP(S) URLs; use an LDAP client for this one';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-primary"
      onClick={() => onFetch(url)}
      disabled={!fetchable}
      title={label}
      aria-label={fetchable ? `Fetch & show CRL from ${url}` : label}
    >
      <Eye />
    </Button>
  );
}

function DistinguishedNameFieldset({ fields }: Readonly<{ fields: DistinguishedNameFields }>) {
  return (
    <>
      <ReadOnlyField label="Common Name (CN)" value={fields.cn} />
      <div className="grid grid-cols-2 gap-4">
        <ReadOnlyField label="Country (C)" value={fields.c} />
        <ReadOnlyField label="State / Province (ST)" value={fields.st} />
        <ReadOnlyField label="Locality (L)" value={fields.l} />
        <ReadOnlyField label="Organization (O)" value={fields.o} />
        <ReadOnlyField label="Organizational Unit (OU)" value={fields.ou} className="col-span-2" />
      </div>
    </>
  );
}

export type StatusPillTone = 'primary' | 'muted' | 'warning';

const STATUS_PILL_TONES: Record<StatusPillTone, { pill: string; dot: string }> = {
  primary: { pill: 'border-primary/30 bg-primary/10 text-primary', dot: 'bg-primary' },
  muted: { pill: 'border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground', dot: 'bg-muted-foreground/50' },
  warning: { pill: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
};

/** A tinted pill with a status dot, a title and an optional monospace detail; a notch above a badge. */
export function StatusPill({ tone, title, detail, className, ...rest }: Readonly<{
  tone: StatusPillTone;
  title: string;
  detail?: React.ReactNode;
  className?: string;
} & Pick<React.HTMLAttributes<HTMLDivElement>, 'role' | 'aria-labelledby'>>) {
  const colors = STATUS_PILL_TONES[tone];
  return (
    <div
      {...rest}
      className={cn('inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm', colors.pill, className)}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', colors.dot)} />
      <span className="shrink-0 font-medium">{title}</span>
      {detail != null && <span className="min-w-0 truncate font-mono opacity-70">{detail}</span>}
    </div>
  );
}

/** The basic constraints CA flag (and path length). */
function IsCaPill({ isCa, pathLenConstraint, expectCa }: Readonly<{
  isCa: boolean; pathLenConstraint?: number | 'None'; expectCa: boolean;
}>) {
  const labelId = useId();
  const missingCa = expectCa && !isCa;
  const constraint = `CA:${isCa ? 'TRUE' : 'FALSE'}${isCa && pathLenConstraint !== undefined ? ` · pathlen:${pathLenConstraint}` : ''}`;

  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-sm leading-none font-medium">Is CA</p>
      <StatusPill
        role="group"
        aria-labelledby={labelId}
        tone={missingCa ? 'warning' : isCa ? 'primary' : 'muted'}
        title={isCa ? 'Certificate Authority' : missingCa ? 'Not a CA Certificate' : 'End-entity certificate'}
        detail={constraint}
      />
      {missingCa && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Without the CA basic constraint it cannot issue other certificates.</p>
      )}
    </div>
  );
}

function Section({ title, description, aside, className, children }: Readonly<{
  title: string;
  description: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}>) {
  return (
    <section aria-label={title} className={cn('grid grid-cols-1 gap-10 lg:grid-cols-3', className)}>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
        {aside ? <div className="mt-3 flex flex-wrap gap-2">{aside}</div> : null}
      </div>
      <div className="space-y-4 lg:col-span-2">{children}</div>
    </section>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export interface DecodedCertificateSectionsProps {
  info: DecodedCertInfo;
  /** The certificate is meant to be a CA: warn when it lacks the CA basic constraint. */
  expectCa?: boolean;
  /** Under the Certificate Details description, such as an OCSP check button. */
  detailsAside?: React.ReactNode;
  /** Content appended to Certificate Details, such as a {@link ReadOnlyField} for the CA ID. */
  detailsExtra?: React.ReactNode;
  /** Under the Issuer Distinguished Name description, such as a link to the issuing CA. */
  issuerAside?: React.ReactNode;
  /** Vertical padding of each section; forms use `py-8`, detail pages `py-6`. */
  sectionClassName?: string;
}

/**
 * Read-only sections (certificate details, issuer DN, subject DN, extensions) for a decoded
 * certificate. Sections are separated from each other but not from what comes before them.
 */
export function DecodedCertificateSections({
  info,
  expectCa = false,
  detailsAside,
  detailsExtra,
  issuerAside,
  sectionClassName = 'py-8',
}: Readonly<DecodedCertificateSectionsProps>) {
  const { mode } = useIdentifierDisplay();
  const identifier = (value: string | undefined) => (value === undefined ? undefined : formatIdentifier(value, mode));
  // CRL distribution point shown in the CRL viewer, or null while it is closed.
  const [crlUrl, setCrlUrl] = useState<string | null>(null);

  return (
    <>
      <Section
        title="Certificate Details"
        description="Serial number, validity period, and CA flag decoded from the certificate."
        aside={detailsAside}
        className={sectionClassName}
      >
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyField label="Serial Number" value={identifier(info.serialNumber)} mono className="col-span-2" />
          <ReadOnlyField label="Valid From" value={info.validFrom} />
          <ReadOnlyField label="Valid To" value={info.validTo} />
        </div>
        <IsCaPill isCa={!!info.isCa} pathLenConstraint={info.pathLenConstraint} expectCa={expectCa} />
        {detailsExtra}
      </Section>

      <Separator />

      <Section
        title="Issuer Distinguished Name"
        description="The CA that signed this certificate. Identical to the Subject for self-signed (root) CAs."
        aside={issuerAside}
        className={sectionClassName}
      >
        <DistinguishedNameFieldset fields={info.issuerFields ?? NO_DN_FIELDS} />
      </Section>

      <Separator />

      <Section
        title="Subject Distinguished Name"
        description="X.509 subject fields extracted from the certificate."
        className={sectionClassName}
      >
        <DistinguishedNameFieldset fields={info.subjectFields ?? NO_DN_FIELDS} />
      </Section>

      <Separator />

      <Section
        title="Extensions"
        description="X.509 v3 extensions and cryptographic metadata present in the certificate."
        className={sectionClassName}
      >
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyField label="Public Key Algorithm" value={info.publicKeyAlgorithm} />
          <ReadOnlyField label="Signature Algorithm" value={info.signatureAlgorithm} />
          <ReadOnlyField label="Subject Key Identifier" value={identifier(info.subjectKeyId)} mono className="col-span-2" />
          <ReadOnlyField label="Authority Key Identifier" value={identifier(info.authorityKeyId)} mono className="col-span-2" />
          <ReadOnlyField label="SHA-256 Fingerprint" value={identifier(info.fingerprintSha256)} mono className="col-span-2" />
        </div>
        <BadgeListField label="Key Usage" values={info.keyUsage?.map(formatCertificateUsageLabel)} />
        <BadgeListField label="Extended Key Usage" values={info.extendedKeyUsage?.map(formatCertificateUsageLabel)} />
        <BadgeListField label="Subject Alternative Names (SANs)" values={info.sans} mono />
        <UrlListField
          label="CRL Distribution Points"
          urls={info.crlDistributionPoints}
          action={url => <FetchCrlButton url={url} onFetch={setCrlUrl} />}
        />
        <UrlListField label="OCSP URLs" urls={info.ocspUrls} />
        <UrlListField label="CA Issuers URLs" urls={info.caIssuersUrls} />
        {info.relatedCertificate && (
          <ReadOnlyField
            label={
              <span className="inline-flex items-center gap-1.5" title={RELATED_CERTIFICATE_TITLE}>
                Related Certificate
                <QuantumAlgorithmIcon className="h-3.5 w-3.5" />
              </span>
            }
            value={`${info.relatedCertificate.hashAlgorithm}: ${info.relatedCertificate.hashValue}`}
            mono
          />
        )}
      </Section>

      {(info.crlDistributionPoints?.length ?? 0) > 0 && (
        // The CRL at a distribution point reports this certificate's revocation and is usually
        // issued by its parent, so the viewer describes it from the CRL itself (no `ca`).
        <CrlViewerSheet
          open={crlUrl !== null}
          onOpenChange={open => { if (!open) setCrlUrl(null); }}
          defaultUrl={crlUrl ?? ''}
          downloadFileName={crlUrl ? crlFileName(crlUrl) : 'crl.crl'}
          defaultUrlHint="CRL Distribution Point declared in this certificate."
          presentation="docked"
        />
      )}
    </>
  );
}
