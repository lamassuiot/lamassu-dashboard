'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { QuantumAlgorithmIcon } from '@/components/shared/QuantumAlgorithmIcon';
import { arrayBufferToBase64, bytesToHex, formatIssuerName, type IssuerNameFields } from '@/lib-crypto';
import type { ApiSigningProfile } from '@/lib/ca-data';
import {
  getRelatedCertMaxAgeSeconds,
  nowUnixSeconds,
  tryParseRelatedCertificate,
  type RelatedCertRequestInput,
  type ResolvedRelatedCertRequest,
} from '@/lib/related-cert-request';
import { cn } from '@/lib/utils';

interface RelatedCertRequestSectionProps {
  /** Whether the switch can be used (a stored profile with related certificates enabled is selected). */
  available: boolean;
  /** Why the switch is unavailable; shown under it. */
  unavailableReason?: string;
  /** The selected profile; supplies the allowed hosts and the freshness window. */
  profile?: ApiSigningProfile;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  value: RelatedCertRequestInput;
  onChange: (value: RelatedCertRequestInput) => void;
  resolved: ResolvedRelatedCertRequest | null;
  disabled?: boolean;
}

const ISSUER_FIELD_LABELS: Array<[keyof IssuerNameFields, string, string]> = [
  ['commonName', 'Common Name (CN)', 'Related CA'],
  ['organization', 'Organization (O)', ''],
  ['organizationalUnit', 'Organizational Unit (OU)', ''],
  ['locality', 'Locality (L)', ''],
  ['stateProvince', 'State / Province (ST)', ''],
  ['country', 'Country (C)', 'ES'],
];

function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/** Re-renders every second so the age of the request time stays current. */
function useNowSeconds(active: boolean): number {
  const [now, setNow] = useState(nowUnixSeconds);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(nowUnixSeconds()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />} {label}
    </Button>
  );
};

/**
 * Lets the user request a certificate bound to a related certificate (RFC 9763 relatedCertRequest).
 * The related certificate's private key signs `DER(certID) || DER(requestTime)` outside the browser;
 * this section shows those bytes and takes the resulting signature. The request time is stamped
 * automatically and never shown or edited.
 */
export const RelatedCertRequestSection: React.FC<RelatedCertRequestSectionProps> = ({
  available, unavailableReason, profile, checked, onCheckedChange, value, onChange, resolved, disabled,
}) => {
  const now = useNowSeconds(checked && available);
  const maxAge = getRelatedCertMaxAgeSeconds(profile);
  const allowedHosts = profile?.related_certificate?.allowed_hosts ?? [];
  const age = now - value.requestTime;
  const fresh = Math.abs(age) <= maxAge;

  // A valid pasted certificate supplies the exact issuer and serial number, which are then locked.
  const certificate = useMemo(() => tryParseRelatedCertificate(value.certPem), [value.certPem]);
  const certificateIssuer = useMemo(() => {
    if (!certificate) return null;
    try {
      return formatIssuerName(certificate.issuerDer);
    } catch {
      return null;
    }
  }, [certificate]);

  const set = (patch: Partial<RelatedCertRequestInput>) => onChange({ ...value, ...patch });

  // The signature covers the certID and the request time, so changing either invalidates it.
  // The request time is never typed: it is stamped automatically whenever the signed data changes.
  const setSigned = (patch: Partial<RelatedCertRequestInput>) =>
    set({ ...patch, requestTime: nowUnixSeconds(), signature: '' });
  const setIssuerField = (key: keyof IssuerNameFields, text: string) =>
    setSigned({ issuerFields: { ...value.issuerFields, [key]: text } });

  const dataToSign = resolved?.dataToSign;
  const dataToSignHex = dataToSign ? bytesToHex(dataToSign) : '';
  const dataToSignBase64 = dataToSign ? arrayBufferToBase64(dataToSign.slice().buffer) : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-0.5">
          <Label htmlFor="related-cert-switch" className="flex items-center gap-1.5">
            Bind to a related certificate
            <span title="Post-quantum: binds the issued certificate to a related certificate (RFC 9763)">
              <QuantumAlgorithmIcon />
            </span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Adds the relatedCertRequest attribute (RFC 9763) to the CSR, proving control of an existing certificate&apos;s key.
          </p>
          {!available && unavailableReason && (
            <p className="text-xs text-muted-foreground">{unavailableReason}</p>
          )}
        </div>
        <Switch
          id="related-cert-switch"
          checked={checked && available}
          onCheckedChange={(next) => {
            // Start the freshness window when the section is opened.
            if (next) setSigned({});
            onCheckedChange(next);
          }}
          disabled={!available || disabled}
        />
      </div>

      {checked && available && (
        <div className="space-y-5 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="related-cert-pem">Related certificate (PEM, optional)</Label>
            <Textarea
              id="related-cert-pem"
              value={value.certPem}
              onChange={(e) => setSigned({ certPem: e.target.value })}
              rows={4}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="font-mono text-xs"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              When a valid certificate is supplied, its exact issuer and serial number are used and the fields below are locked.
            </p>
          </div>

          {certificate ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="related-issuer-locked">Issuer of the related certificate</Label>
                <Input
                  id="related-issuer-locked"
                  value={certificateIssuer ?? ''}
                  disabled
                  readOnly
                  className="font-mono text-xs"
                />
                <Textarea
                  value={bytesToHex(certificate.issuerDer)}
                  disabled
                  readOnly
                  rows={2}
                  className="font-mono text-xs"
                  aria-label="Issuer DER (hex)"
                />
                <p className="text-xs text-muted-foreground">Taken from the certificate, byte for byte (DER shown in hex).</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="related-serial-locked">Serial number (hex)</Label>
                <Input
                  id="related-serial-locked"
                  value={certificate.serialHex}
                  disabled
                  readOnly
                  className="font-mono"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Issuer of the related certificate</Label>
                  <Tabs value={value.issuerMode} onValueChange={(mode) => setSigned({ issuerMode: mode as RelatedCertRequestInput['issuerMode'] })}>
                    <TabsList>
                      <TabsTrigger value="fields">Name fields</TabsTrigger>
                      <TabsTrigger value="der">Raw DER</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {value.issuerMode === 'fields' ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {ISSUER_FIELD_LABELS.map(([key, label, placeholder]) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={`related-issuer-${key}`} className="text-xs text-muted-foreground">{label}</Label>
                        <Input
                          id={`related-issuer-${key}`}
                          value={value.issuerFields[key] ?? ''}
                          onChange={(e) => setIssuerField(key, e.target.value)}
                          placeholder={placeholder}
                          disabled={disabled}
                        />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Encoded like certificates issued by this platform (PrintableString where possible, UTF8String otherwise).
                      The server compares the issuer byte for byte; for other CAs paste the certificate or the raw DER.
                    </p>
                  </div>
                ) : (
                  <Textarea
                    value={value.issuerDer}
                    onChange={(e) => setSigned({ issuerDer: e.target.value })}
                    rows={3}
                    placeholder="DER of the issuer Name, as hex or base64"
                    className="font-mono text-xs"
                    disabled={disabled}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="related-serial">Serial number (hex)</Label>
                <Input
                  id="related-serial"
                  value={value.serialHex}
                  onChange={(e) => setSigned({ serialHex: e.target.value })}
                  placeholder="e.g. 5f3a9c…"
                  className="font-mono"
                  disabled={disabled}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="related-location">Location of the related certificate (one URI per line)</Label>
            <Textarea
              id="related-location"
              value={value.locationText}
              onChange={(e) => set({ locationText: e.target.value, signature: '' })}
              rows={3}
              placeholder={'data:application/pkcs7-mime;base64,…\nhttps://pki.example.com/related.crt'}
              className="font-mono text-xs"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              <code>data:</code> URIs carry a base64 PKCS#7 with the certificate. <code>http(s)</code> URIs must point to a plain DER
              certificate on an allowed host: {allowedHosts.length > 0
                ? allowedHosts.map(host => <code key={host} className="mr-1">{host}</code>)
                : 'none allowed by this profile (use data: URIs).'}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Data to sign</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={fresh ? 'secondary' : 'destructive'}>
                  {fresh ? 'Up to date' : 'Expired: refresh and sign again'}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Regenerate the data to sign (clears the signature)"
                  onClick={() => setSigned({})}
                  disabled={disabled}
                >
                  <RotateCcw data-icon="inline-start" /> Refresh
                </Button>
                <CopyButton text={dataToSignHex} label="Hex" />
                <CopyButton text={dataToSignBase64} label="Base64" />
              </div>
            </div>
            <Textarea
              readOnly
              value={dataToSignHex}
              rows={3}
              placeholder="Fill in issuer and serial number to compute the data to sign."
              className="bg-muted/40 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              DER(issuer, serial) followed by the request time, which is stamped automatically. Sign these bytes with the related certificate&apos;s
              private key using the key&apos;s default algorithm (ECDSA P-256/P-384/P-521 with SHA-256/384/512, RSA PKCS#1 v1.5 with SHA-256,
              Ed25519 and ML-DSA are pure), then paste the signature below.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="related-signature">Signature (hex or base64)</Label>
            <Textarea
              id="related-signature"
              value={value.signature}
              onChange={(e) => set({ signature: e.target.value })}
              rows={3}
              placeholder="Signature made with the related certificate's private key"
              className="font-mono text-xs"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              ECDSA signatures may be DER or raw <code>r||s</code> when the related certificate is pasted above.
            </p>
          </div>

          <Alert variant={fresh ? 'default' : 'destructive'} className={cn(!fresh && 'border-destructive/50')}>
            <AlertDescription>
              The server accepts a request time within ±{formatDuration(maxAge)} of the moment it receives the CSR
              ({profile?.related_certificate?.max_age ? 'set by this profile' : 'default'}). Sign and issue within that window, or refresh the data to sign and sign again.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
};
