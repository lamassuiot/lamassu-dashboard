
'use client';

import React, { useState, useEffect } from 'react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { Info, KeyRound, Lock, Link as LinkIcon, Network, Users, AlertCircle, Pencil, X, Check, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CaHierarchyPathNode } from '@/components/ca/details/CaHierarchyPathNode';
import { getCaDisplayName, fetchSigningProfiles, type ApiSigningProfile, updateCaDefaultProfileId } from '@/lib/ca-data';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { getDisplayDateFormat } from '@/lib/config';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { Loader2 } from 'lucide-react';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { revocationReasons } from '@/lib/revocation-reasons';
import { IssuanceChainVisualizer } from '@/components/shared/IssuanceChainVisualizer';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { DetailSectionCard } from '@/components/shared/DetailSectionCard';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';

import { cn, formatCertificateUsageLabel } from '@/lib/utils';


interface CaStats {
  ACTIVE: number;
  EXPIRED: number;
  REVOKED: number;
}

interface InformationTabContentProps {
  item: CA | CertificateData;
  itemType: 'ca' | 'certificate';
  onUpdateSuccess?: () => void;
  caSpecific?: {
    pathToRoot: CA[];
    allCAsForLinking: CA[];
    currentCaId: string;
    placeholderSerial?: string;
    allCryptoEngines?: ApiCryptoEngine[];
    stats: CaStats | null;
    isLoadingStats: boolean;
    errorStats: string | null;
  };
  certificateSpecific?: {
    certificateChainForVisualizer: CA[];
    statusBadgeVariant: "default" | "secondary" | "destructive" | "outline";
    statusBadgeClass?: string;
    apiStatusText: string;
  };
  routerHook: AppRouterInstance;
  onAkiClick?: (aki: string) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const getRevocationReasonLabel = (reason: string | undefined): string => {
  if (!reason) return 'Unknown';
  const found = revocationReasons.find(r => r.value === reason);
  return found ? found.label : reason;
};

/** Renders an array of URLs as small link chips. */
const UrlChips = ({ urls, label }: { urls: string[] | undefined; label: string }) => {
  if (!urls || urls.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {urls.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-muted transition-colors max-w-full"
          >
            <span className="truncate max-w-[320px]">{url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
};

// ── main export ──────────────────────────────────────────────────────────────

export const InformationTabContent: React.FC<InformationTabContentProps> = ({
  item,
  itemType,
  caSpecific,
  certificateSpecific,
  routerHook,
  onAkiClick,
  onUpdateSuccess,
}) => {

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileMode, setProfileMode] = useState<ProfileMode>('reuse');
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoadingProfiles(true);
      try {
        const profilesResponse = await fetchSigningProfiles();
        setAvailableProfiles(profilesResponse.list);
      } catch {
        sileo.error({ title: "Error", description: "Could not load issuance profiles." });
      } finally {
        setIsLoadingProfiles(false);
      }
    };
    if (itemType === 'ca') {
      loadProfiles();
      setSelectedProfileId((item as CA).defaultProfileId || null);
    }
  }, [item, itemType, isEditingProfile]);

  const handleSaveProfile = async () => {
    if (itemType !== 'ca' ) return;
    const caDetails = item as CA;
    setIsSubmitting(true);
    try {
      await updateCaDefaultProfileId(caDetails.id, selectedProfileId);
      sileo.success({ title: "Success", description: "Default issuance profile updated." });
      onUpdateSuccess?.();
      setIsEditingProfile(false);
    } catch (e: any) {
      sileo.error({ title: "Update Failed", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
    if (itemType === 'ca') setSelectedProfileId((item as CA).defaultProfileId || null);
  };

  const selectedProfileForDisplay = React.useMemo(
    () => availableProfiles.find(p => p.id === selectedProfileId),
    [selectedProfileId, availableProfiles]
  );

  // ── CA view ────────────────────────────────────────────────────────────────
  if (itemType === 'ca' && caSpecific) {
    const caDetails = item as CA;

    const hasDistribution =
      (caDetails.crlDistributionPoints && caDetails.crlDistributionPoints.length > 0) ||
      (caDetails.ocspUrls && caDetails.ocspUrls.length > 0) ||
      (caDetails.caIssuersUrls && caDetails.caIssuersUrls.length > 0);

    return (
      <div>

        {/* Revocation alert */}
        {caDetails.status === 'revoked' && caDetails.rawApiData?.certificate?.revocation_timestamp && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Certificate Authority Revoked</AlertTitle>
            <AlertDescription className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-80">Reason:</span>
                <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                  {getRevocationReasonLabel(caDetails.rawApiData.certificate.revocation_reason)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-80">Revoked on:</span>
                <DateDisplay date={caDetails.rawApiData.certificate.revocation_timestamp} formatString={getDisplayDateFormat()} showRelative={true} />
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Section: General Information */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
          <div>
            <p className="font-semibold">General Information</p>
            <p className="text-sm text-muted-foreground mt-1">Identity, issuer, lifecycle, and serial details for this authority.</p>
          </div>
          <div className="lg:col-span-2">
            <DetailInfoRows>
              <DetailInfoRow label="Full Name" value={caDetails.name} className="first:pt-0" />
              <DetailInfoRow label="CA ID" value={<IdentifierDisplay value={caDetails.id} />} />
              <DetailInfoRow label="Issuer" value={getCaDisplayName(caDetails.issuer, caSpecific.allCAsForLinking)} />
              <DetailInfoRow label="Expires On" value={<DateDisplay date={caDetails.expires} formatString={getDisplayDateFormat()} highlightExpired />} />
              <DetailInfoRow label="Serial Number" value={<IdentifierDisplay value={caDetails.serialNumber} />} className="last:pb-0" />
            </DetailInfoRows>
          </div>
        </div>

        <Separator />

        {/* Section: Key & Signature */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
          <div>
            <p className="font-semibold">Key & Signature</p>
            <p className="text-sm text-muted-foreground mt-1">Algorithm and identifier material associated with this CA certificate.</p>
          </div>
          <div className="lg:col-span-2">
            <DetailInfoRows>
              <DetailInfoRow label="Public Key Algorithm" value={caDetails.keyAlgorithm || 'N/A'} className="first:pt-0" />
              <DetailInfoRow label="Signature Algorithm" value={caDetails.signatureAlgorithm || 'N/A'} />
              <DetailInfoRow label="SKI" value={caDetails.subjectKeyId ? <IdentifierDisplay value={caDetails.subjectKeyId} className="text-xs" /> : 'N/A'} />
              <DetailInfoRow label="AKI" value={caDetails.authorityKeyId ? <IdentifierDisplay value={caDetails.authorityKeyId} className="text-xs" /> : 'N/A'} className="last:pb-0" />
            </DetailInfoRows>
          </div>
        </div>

        <Separator />

        {/* Section: Certificate Extensions */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
          <div>
            <p className="font-semibold">Certificate Extensions</p>
            <p className="text-sm text-muted-foreground mt-1">Basic constraints and intended usages defined on the certificate.</p>
          </div>
          <div className="lg:col-span-2">
            <DetailInfoRows>
              <DetailInfoRow
                label="Basic Constraints"
                className="first:pt-0"
                value={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">CA:</span>
                    <Badge variant={caDetails.isCa ? 'default' : 'secondary'} className="text-xs">
                      {caDetails.isCa ? 'TRUE' : 'FALSE'}
                    </Badge>
                  </div>
                }
              />
              <DetailInfoRow
                label="Key Usages"
                className="last:pb-0"
                value={
                  (caDetails.keyUsage && caDetails.keyUsage.length > 0) || (caDetails.extendedKeyUsage && caDetails.extendedKeyUsage.length > 0) ? (
                    <div className="flex flex-wrap gap-1">
                      {caDetails.keyUsage?.map(u => <Badge key={u} variant="outline" className="text-xs">{formatCertificateUsageLabel(u)}</Badge>)}
                      {caDetails.extendedKeyUsage?.map(u => <Badge key={u} variant="secondary" className="text-xs">{formatCertificateUsageLabel(u)}</Badge>)}
                    </div>
                  ) : 'Not Specified'
                }
              />
            </DetailInfoRows>
          </div>
        </div>

        <Separator />

        {/* Section: Default Issuance Profile */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
          <div>
            <p className="font-semibold">Default Issuance Profile</p>
            <p className="text-sm text-muted-foreground mt-1">Profile used by default when this CA issues new certificates.</p>
          </div>
          <div className="lg:col-span-2">
            {!isEditingProfile ? (
              <div className="space-y-3">
                {caDetails.defaultProfileId && selectedProfileForDisplay ? (
                  <IssuanceProfileCard profile={selectedProfileForDisplay} />
                ) : (
                  <Alert variant="default" className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertTitle className="text-amber-700 dark:text-amber-400 text-sm">No default profile set</AlertTitle>
                    <AlertDescription className="text-amber-600/80 dark:text-amber-500 text-xs">
                      Certificates issued by this CA will use default settings. Set a profile to enforce key usage, validity, and extensions.
                    </AlertDescription>
                  </Alert>
                )}
                <Button variant="secondary" size="sm" onClick={() => setIsEditingProfile(true)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Profile
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <SigningProfileSelector
                  profileMode={profileMode}
                  onProfileModeChange={setProfileMode}
                  availableProfiles={availableProfiles}
                  isLoadingProfiles={isLoadingProfiles}
                  selectedProfileId={selectedProfileId}
                  onProfileIdChange={setSelectedProfileId}
                  inlineModeEnabled={false}
                  createModeEnabled={true}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSubmitting}>Cancel</Button>
                  <Button size="sm" onClick={handleSaveProfile} disabled={isSubmitting || isLoadingProfiles}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Check className="mr-2 h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section: Distribution Points */}
        {hasDistribution && (
          <>
            <Separator />
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
              <div>
                <p className="font-semibold">Distribution Points</p>
                <p className="text-sm text-muted-foreground mt-1">Published CRL, OCSP, and issuer endpoints for relying parties.</p>
              </div>
              <div className="space-y-4 lg:col-span-2">
                <UrlChips urls={caDetails.crlDistributionPoints} label="CRL Distribution Points (CDP)" />
                <UrlChips urls={caDetails.ocspUrls} label="OCSP Responders" />
                <UrlChips urls={caDetails.caIssuersUrls} label="CA Issuers (AIA)" />
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Section: Issuance Hierarchy */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
          <div>
            <p className="font-semibold">Issuance Hierarchy</p>
            <p className="text-sm text-muted-foreground mt-1">Chain of trust and direct child authorities issued by this CA.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {caSpecific.pathToRoot.length > 0 ? (
              <div className="flex w-full flex-col items-center">
                {caSpecific.pathToRoot.map((caNode, index) => (
                  <CaHierarchyPathNode
                    key={caNode.id}
                    ca={caNode}
                    isCurrentCa={caNode.id === caDetails.id}
                    hasNext={index < caSpecific.pathToRoot.length - 1}
                    isFirst={index === 0}
                    allCryptoEngines={caSpecific.allCryptoEngines}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Hierarchy path not available.</p>
            )}

            {caDetails.children && caDetails.children.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Directly Issues To</p>
                </div>
                <div className="flex flex-col gap-1">
                  {caDetails.children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => routerHook.push(`/certificate-authorities/details?caId=${child.id}`)}
                      className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span>{child.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    );
  }

  // ── Certificate view ───────────────────────────────────────────────────────
  if (itemType === 'certificate' && certificateSpecific) {
    const certDetails = item as CertificateData;

    const hasDistribution =
      (certDetails.crlDistributionPoints && certDetails.crlDistributionPoints.length > 0) ||
      (certDetails.ocspUrls && certDetails.ocspUrls.length > 0) ||
      (certDetails.caIssuersUrls && certDetails.caIssuersUrls.length > 0);

    return (
      <div className="space-y-6">

        {/* Revocation alert */}
        {certDetails.apiStatus?.toLowerCase() === 'revoked' && certDetails.revocationTimestamp && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Certificate Revoked</AlertTitle>
            <AlertDescription className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-80">Reason:</span>
                <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                  {getRevocationReasonLabel(certDetails.revocationReason)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-80">Revoked on:</span>
                <DateDisplay date={certDetails.revocationTimestamp} formatString={getDisplayDateFormat()} showRelative={false} />
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          <DetailSectionCard
            icon={Info}
            title="General Information"
            description="Identity, issuer, validity period, and serial details for this certificate."
          >
            <DetailInfoRows>
              <DetailInfoRow label="Subject" value={certDetails.subject} className="first:pt-0" />
              <DetailInfoRow label="Issuer" value={certDetails.issuer} />
              <DetailInfoRow label="Serial Number" value={<IdentifierDisplay value={certDetails.serialNumber} />} />
              <DetailInfoRow label="Valid From" value={<DateDisplay date={certDetails.validFrom} formatString={getDisplayDateFormat()} />} />
              <DetailInfoRow label="Valid To" value={<DateDisplay date={certDetails.validTo} formatString={getDisplayDateFormat()} highlightExpired />} className="last:pb-0" />
            </DetailInfoRows>
          </DetailSectionCard>

          <DetailSectionCard
            icon={KeyRound}
            title="Key & Signature"
            description="Algorithm details, fingerprint material, and issuer key identifiers."
          >
            <DetailInfoRows>
              <DetailInfoRow label="Public Key Algorithm" value={certDetails.publicKeyAlgorithm || 'N/A'} className="first:pt-0" />
              <DetailInfoRow label="Signature Algorithm" value={certDetails.signatureAlgorithm || 'N/A'} />
              <DetailInfoRow
                label="SHA-256 Fingerprint"
                value={
                  certDetails.fingerprintSha256
                    ? <IdentifierDisplay value={certDetails.fingerprintSha256} className="text-xs" />
                    : 'N/A'
                }
              />
              {certDetails.rawApiData?.subject_key_id && (
                <DetailInfoRow
                  label="SKI"
                  value={<IdentifierDisplay value={certDetails.rawApiData.subject_key_id} className="text-xs" />}
                />
              )}
              <DetailInfoRow
                label="AKI"
                value={
                  certDetails.rawApiData?.authority_key_id && onAkiClick ? (
                    <button
                      onClick={() => onAkiClick(certDetails.rawApiData.authority_key_id)}
                      className="text-left text-primary hover:underline"
                      title="Find Issuer CA by AKI"
                    >
                      <IdentifierDisplay value={certDetails.rawApiData.authority_key_id} className="text-xs" />
                    </button>
                  ) : certDetails.rawApiData?.authority_key_id ? (
                    <IdentifierDisplay value={certDetails.rawApiData.authority_key_id} className="text-xs" />
                  ) : 'N/A'
                }
                className="last:pb-0"
              />
            </DetailInfoRows>
          </DetailSectionCard>

          <div className="lg:col-span-2">
            <DetailSectionCard
              icon={Lock}
              title="Certificate Extensions"
              description="Alternative names and intended usages defined in the certificate."
            >
              <DetailInfoRows>
                <DetailInfoRow
                  label="Subject Alternative Names"
                  className="first:pt-0"
                  value={
                    certDetails.sans && certDetails.sans.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {certDetails.sans.map((san, i) => <Badge key={i} variant="secondary" className="text-xs">{san}</Badge>)}
                      </div>
                    ) : 'Not Specified'
                  }
                />
                <DetailInfoRow
                  label="Key Usages"
                  className="last:pb-0"
                  value={
                    (certDetails.keyUsage && certDetails.keyUsage.length > 0) || (certDetails.extendedKeyUsage && certDetails.extendedKeyUsage.length > 0) ? (
                      <div className="flex flex-wrap gap-1">
                        {certDetails.keyUsage?.map(u => <Badge key={u} variant="outline" className="text-xs">{formatCertificateUsageLabel(u)}</Badge>)}
                        {certDetails.extendedKeyUsage?.map(u => <Badge key={u} variant="secondary" className="text-xs">{formatCertificateUsageLabel(u)}</Badge>)}
                      </div>
                    ) : 'Not Specified'
                  }
                />
              </DetailInfoRows>
            </DetailSectionCard>
          </div>
        </div>

        {hasDistribution && (
          <DetailSectionCard
            icon={LinkIcon}
            title="Distribution Points"
            description="Published CRL, OCSP, and issuer endpoints for this certificate."
            contentClassName="space-y-4"
          >
            <div className="space-y-4">
              <UrlChips urls={certDetails.crlDistributionPoints} label="CRL Distribution Points (CDP)" />
              <UrlChips urls={certDetails.ocspUrls} label="OCSP Responders" />
              <UrlChips urls={certDetails.caIssuersUrls} label="CA Issuers (AIA)" />
            </div>
          </DetailSectionCard>
        )}

        {certificateSpecific.certificateChainForVisualizer && (
          <DetailSectionCard
            icon={Network}
            title="Issuance Chain"
            description="Trust path from this certificate to its issuing authorities."
          >
            <IssuanceChainVisualizer
              certificateChain={certificateSpecific.certificateChainForVisualizer}
              currentCertificate={{
                subject: certDetails.subject,
                statusBadgeVariant: certificateSpecific.statusBadgeVariant,
                statusBadgeClass: certificateSpecific.statusBadgeClass,
                statusText: certificateSpecific.apiStatusText,
              }}
            />
          </DetailSectionCard>
        )}
      </div>
    );
  }

  return <p>Invalid itemType or missing data.</p>;
};
