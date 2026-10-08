'use client';

import React from 'react';
import { format as formatDate } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { parseCertificatePemDetails } from '@/lib-crypto';

export interface DecodedCertInfo {
  commonName?: string;
  country?: string;
  state?: string;
  locality?: string;
  organization?: string;
  organizationalUnit?: string;
  issuer?: string;
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
  error?: string;
}

export function parseSubjectFields(subject: string) {
  const fields: Record<string, string> = {};
  subject.split(/,\s*/).forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      fields[part.slice(0, idx).trim().toUpperCase()] = part.slice(idx + 1).trim();
    }
  });
  return {
    cn: fields['CN'] || '',
    c: fields['C'] || '',
    st: fields['ST'] || '',
    l: fields['L'] || '',
    o: fields['O'] || '',
    ou: fields['OU'] || '',
  };
}

export async function decodeCertificatePem(pem: string): Promise<DecodedCertInfo> {
  try {
    const parsed = await parseCertificatePemDetails(pem);
    const subj = parseSubjectFields(parsed.subject || '');
    return {
      commonName: subj.cn,
      country: subj.c,
      state: subj.st,
      locality: subj.l,
      organization: subj.o,
      organizationalUnit: subj.ou,
      issuer: parsed.issuer,
      serialNumber: parsed.serialNumber,
      validFrom: parsed.validFrom ? formatDate(new Date(parsed.validFrom), 'PPpp') : 'N/A',
      validTo: parsed.validTo ? formatDate(new Date(parsed.validTo), 'PPpp') : 'N/A',
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
    };
  } catch (e: any) {
    return { error: `Failed to parse certificate: ${e.message}` };
  }
}

/** Read-only detail sections (certificate, issuer DN, subject DN, extensions) for a decoded certificate. */
export function DecodedCertificateSections({ info }: { info: DecodedCertInfo }) {
  return (
    <>
      <Separator />
        <Separator />
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Certificate Details</p>
            <p className="text-sm text-muted-foreground mt-1">Information decoded from the provided PEM certificate.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Serial Number</Label>
                <Input readOnly value={info.serialNumber || ''} className="bg-muted/50 font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label>Valid From</Label>
                <Input readOnly value={info.validFrom || ''} className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label>Valid To</Label>
                <Input readOnly value={info.validTo || ''} className="bg-muted/50" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label>Is CA</Label>
              <Badge variant={info.isCa ? "default" : "secondary"}>
                {info.isCa ? 'Yes' : 'No'}
              </Badge>
            </div>
            {!info.isCa && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Not a CA Certificate</AlertTitle>
                <AlertDescription>This certificate does not have the basic constraint <code>isCA</code> set to <code>TRUE</code>, so it cannot be used to issue other certificates.</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <Separator />

        {/* ── Issuer Distinguished Name ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Issuer Distinguished Name</p>
            <p className="text-sm text-muted-foreground mt-1">The CA that signed this certificate. Identical to the Subject for self-signed (root) CAs.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {(() => {
              const issuerFields = parseSubjectFields(info.issuer || '');
              return (
                <>
                  <div className="space-y-1.5">
                    <Label>Common Name (CN)</Label>
                    <Input readOnly value={issuerFields.cn}  className="bg-muted/50" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Country (C)</Label>
                      <Input readOnly value={issuerFields.c}  className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>State / Province (ST)</Label>
                      <Input readOnly value={issuerFields.st}  className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Locality (L)</Label>
                      <Input readOnly value={issuerFields.l}  className="bg-muted/50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Organization (O)</Label>
                      <Input readOnly value={issuerFields.o}  className="bg-muted/50" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>Organizational Unit (OU)</Label>
                      <Input readOnly value={issuerFields.ou}  className="bg-muted/50" />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <Separator />

        {/* ── Subject Distinguished Name ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Subject Distinguished Name</p>
            <p className="text-sm text-muted-foreground mt-1">X.509 subject fields extracted from the certificate. The Common Name (CN) identifies this CA.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="space-y-1.5">
              <Label>Common Name (CN)</Label>
              <Input readOnly value={info.commonName || ''}  className="bg-muted/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Country (C)</Label>
                <Input readOnly value={info.country || ''}  className="bg-muted/50" />
                <p className="text-xs text-muted-foreground">2-letter ISO country code.</p>
              </div>
              <div className="space-y-1.5">
                <Label>State / Province (ST)</Label>
                <Input readOnly value={info.state || ''}  className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label>Locality (L)</Label>
                <Input readOnly value={info.locality || ''}  className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label>Organization (O)</Label>
                <Input readOnly value={info.organization || ''}  className="bg-muted/50" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Organizational Unit (OU)</Label>
                <Input readOnly value={info.organizationalUnit || ''}  className="bg-muted/50" />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Extensions ── */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
          <div>
            <p className="font-semibold">Extensions</p>
            <p className="text-sm text-muted-foreground mt-1">X.509 v3 extensions and cryptographic metadata present in the certificate.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Public Key Algorithm</Label>
                <Input readOnly value={info.publicKeyAlgorithm || ''} className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label>Signature Algorithm</Label>
                <Input readOnly value={info.signatureAlgorithm || ''} className="bg-muted/50" />
              </div>
              {info.pathLenConstraint !== undefined && (
                <div className="space-y-1.5">
                  <Label>Path Length Constraint</Label>
                  <Input readOnly value={String(info.pathLenConstraint)} className="bg-muted/50" />
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label>Subject Key Identifier</Label>
                <Input readOnly value={info.subjectKeyId || ''} className="bg-muted/50 font-mono text-xs" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Authority Key Identifier</Label>
                <Input readOnly value={info.authorityKeyId || ''} className="bg-muted/50 font-mono text-xs" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>SHA-256 Fingerprint</Label>
                <Input readOnly value={info.fingerprintSha256 || ''} className="bg-muted/50 font-mono text-xs" />
              </div>
            </div>
            {(info.keyUsage?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>Key Usage</Label>
                <div className="flex flex-wrap gap-1.5">
                  {info.keyUsage!.map(u => (
                    <Badge key={u} variant="secondary">{u}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(info.extendedKeyUsage?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>Extended Key Usage</Label>
                <div className="flex flex-wrap gap-1.5">
                  {info.extendedKeyUsage!.map(u => (
                    <Badge key={u} variant="secondary">{u}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(info.sans?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>Subject Alternative Names (SANs)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {info.sans!.map(san => (
                    <Badge key={san} variant="secondary" className="font-mono">{san}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(info.crlDistributionPoints?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>CRL Distribution Points</Label>
                <div className="space-y-1">
                  {info.crlDistributionPoints!.map(url => (
                    <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                  ))}
                </div>
              </div>
            )}
            {(info.ocspUrls?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>OCSP URLs</Label>
                <div className="space-y-1">
                  {info.ocspUrls!.map(url => (
                    <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                  ))}
                </div>
              </div>
            )}
            {(info.caIssuersUrls?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label>CA Issuers URLs</Label>
                <div className="space-y-1">
                  {info.caIssuersUrls!.map(url => (
                    <Input key={url} readOnly value={url} className="bg-muted/50 font-mono text-xs" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
    </>
  );
}
