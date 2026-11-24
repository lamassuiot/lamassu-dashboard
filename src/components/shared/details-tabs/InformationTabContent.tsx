
'use client';

import React, { useState, useEffect } from 'react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { Users, AlertCircle, Pencil, Check, ChevronDown, ArrowUpRight, Search } from "lucide-react";
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CaCard } from '@/components/ca/CaCard';
import { findCaById, fetchSigningProfiles, type ApiSigningProfile, updateCaDefaultProfileId } from '@/lib/ca-data';
import { DateDisplay } from '@/components/shared/DateDisplay';
import type { AppRouterInstance } from '@/lib/router';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { sileo } from '@/lib/toast';
import { Loader2 } from 'lucide-react';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { revocationReasons } from '@/lib/revocation-reasons';
import { IssuanceChainVisualizer } from '@/components/shared/IssuanceChainVisualizer';
import {
  DecodedCertificateSections,
  ReadOnlyField,
  StatusPill,
  type DecodedCertificateSectionsProps,
} from '@/components/shared/DecodedCertificateSections';
import { useDecodedCertificatePem } from '@/hooks/useDecodedCertificatePem';
import { buildCaKmsKeyUri, buildCertificateKmsKeyUri, kmsKeyDetailsHref } from '@/lib/kms-key-uri';
import Link from '@/components/shared/RouterLink';
import { isCaWithoutKey } from '@/lib/ca-utils';

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
    statusBadgeVariant: BadgeVariant;
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

/**
 * Whether Lamassu holds the private key and, when it lives in the KMS, a link to it. Kept apart
 * from the decoded certificate sections because the key is not part of the certificate.
 */
const PrivateKeySection = ({ present, href, keyLabel }: { present: boolean; href: string | null; keyLabel?: string }) => (
  <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
    <div>
      <p className="font-semibold">Private Key</p>
      <p className="text-sm text-muted-foreground mt-1">Whether Lamassu holds the private key for this certificate, and where.</p>
    </div>
    <div className="flex min-w-0 items-start lg:col-span-2">
      <StatusPill
        tone={present ? 'primary' : 'muted'}
        title={present ? 'Present' : 'Not available'}
        detail={href ? (
          <Link href={href} className="underline-offset-2 hover:underline" title={`Open private key in KMS: ${keyLabel ?? ''}`}>
            {keyLabel}
          </Link>
        ) : undefined}
      />
    </div>
  </div>
);

const IssuerCaLink = ({ caId }: { caId: string }) => (
  <Link
    href={`/certificate-authorities/details?caId=${encodeURIComponent(caId)}`}
    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
  >
    <ArrowUpRight className="h-3.5 w-3.5" /> Open issuer CA
  </Link>
);

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

  const [decodedCert, decodeCert] = useDecodedCertificatePem();
  const pemData = item.pemData;
  useEffect(() => {
    void decodeCert(pemData ?? '');
  }, [pemData, decodeCert]);

  /** The parser sections for `item`'s certificate, or why they cannot be shown yet. */
  const renderCertificateSections = (props: Omit<DecodedCertificateSectionsProps, 'info' | 'sectionClassName'>) => {
    if (decodedCert && !decodedCert.error) {
      return <DecodedCertificateSections info={decodedCert} sectionClassName="py-6" {...props} />;
    }
    if (decodedCert?.error || !pemData?.trim()) {
      return (
        <Alert variant="warning" className="my-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Certificate could not be decoded</AlertTitle>
          <AlertDescription>{decodedCert?.error ?? 'No PEM data is available for this certificate.'}</AlertDescription>
        </Alert>
      );
    }
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Decoding certificate…
      </div>
    );
  };

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
    if (itemType === 'ca' && !isCaWithoutKey(item as CA)) {
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

    const issuerCa = caDetails.issuer !== caDetails.id ? findCaById(caDetails.issuer, caSpecific.allCAsForLinking) : null;

    const caWithoutKey = isCaWithoutKey(caDetails);
    const caKeyUri = buildCaKmsKeyUri(caDetails);
    const caHasManagedKey = caKeyUri !== null && !caWithoutKey;
    const caKeyHref = kmsKeyDetailsHref(caKeyUri);

    const enginesById = new Map((caSpecific.allCryptoEngines ?? []).map(engine => [engine.id, engine]));
    const engineFor = (ca: CA) => (ca.kmsKeyId ? enginesById.get(ca.kmsKeyId) : undefined);
    const openCa = (ca: CA) => routerHook.push(`/certificate-authorities/details?caId=${encodeURIComponent(ca.id)}`);

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
                <Badge variant="destructive">
                  {getRevocationReasonLabel(caDetails.rawApiData.certificate.revocation_reason)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-80">Revoked on:</span>
                <DateDisplay date={caDetails.rawApiData.certificate.revocation_timestamp} showRelative={true} />
              </div>
            </AlertDescription>
          </Alert>
        )}

        {renderCertificateSections({
          detailsExtra: <ReadOnlyField label="CA ID" value={caDetails.id} mono />,
          issuerAside: issuerCa ? <IssuerCaLink caId={issuerCa.id} /> : undefined,
        })}

        <Separator />

        <PrivateKeySection
          present={caHasManagedKey}
          href={caHasManagedKey ? caKeyHref : null}
          keyLabel={caDetails.keyId}
        />

        {/* Section: Default Issuance Profile (a CA without its key cannot issue) */}
        {!caWithoutKey && (
          <>
            <Separator />

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
                      <Alert variant="warning">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No default profile set</AlertTitle>
                        <AlertDescription>
                          Certificates issued by this CA will use default settings. Set a profile to enforce key usage, validity, and extensions.
                        </AlertDescription>
                      </Alert>
                    )}
                    <Button variant="secondary" onClick={() => setIsEditingProfile(true)}>
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
                      <Button variant="secondary" onClick={handleCancelEdit} disabled={isSubmitting}>Cancel</Button>
                      <Button onClick={handleSaveProfile} disabled={isSubmitting || isLoadingProfiles}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Check className="mr-2 h-3.5 w-3.5" /> Save
                      </Button>
                    </div>
                  </div>
                )}
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
                  <React.Fragment key={caNode.id}>
                    <CaCard
                      ca={caNode}
                      engine={engineFor(caNode)}
                      isCurrent={caNode.id === caDetails.id}
                      onClick={openCa}
                      className="max-w-full"
                    />
                    {index < caSpecific.pathToRoot.length - 1 && <ChevronDown className="my-1 h-5 w-5 text-primary" />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Hierarchy path not available.</p>
            )}

            {caDetails.children && caDetails.children.length > 0 && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-muted-foreground" /> Directly Issues To
                </p>
                {caDetails.children.map(child => (
                  <CaCard key={child.id} ca={child} engine={engineFor(child)} onClick={openCa} className="max-w-full" />
                ))}
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
    const certKeyHref = kmsKeyDetailsHref(buildCertificateKmsKeyUri(certDetails));
    const certKeyDisplay = certDetails.rawApiData?.key_id || 'View private key';

    const akiForLookup: string | undefined = certDetails.rawApiData?.authority_key_id || undefined;

    return (
      <div>

        {/* Revocation alert */}
        {certDetails.apiStatus?.toLowerCase() === 'revoked' && certDetails.revocationTimestamp && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Certificate Revoked</AlertTitle>
            <AlertDescription className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-80">Reason:</span>
                <Badge variant="destructive">
                  {getRevocationReasonLabel(certDetails.revocationReason)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium opacity-80">Revoked on:</span>
                <DateDisplay date={certDetails.revocationTimestamp} showRelative={false} />
              </div>
            </AlertDescription>
          </Alert>
        )}

        {renderCertificateSections({
          issuerAside: certDetails.issuerCaId || (akiForLookup && onAkiClick) ? (
            <>
              {certDetails.issuerCaId && <IssuerCaLink caId={certDetails.issuerCaId} />}
              {akiForLookup && onAkiClick && (
                <Button variant="secondary" size="sm" onClick={() => onAkiClick(akiForLookup)} title="Find Issuer CA by AKI">
                  <Search className="h-3.5 w-3.5" /> Find issuer by AKI
                </Button>
              )}
            </>
          ) : undefined,
        })}

        <Separator />

        <PrivateKeySection
          present={!!certKeyHref || !!certDetails.hasPrivateKey}
          href={certKeyHref}
          keyLabel={certKeyDisplay}
        />

        {certificateSpecific.certificateChainForVisualizer && (
          <>
            <Separator />
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
              <div>
                <p className="font-semibold">Issuance Chain</p>
                <p className="text-sm text-muted-foreground mt-1">Trust path from this certificate to its issuing authorities.</p>
              </div>
              <div className="lg:col-span-2">
                <IssuanceChainVisualizer
                  certificateChain={certificateSpecific.certificateChainForVisualizer}
                  currentCertificate={{
                    subject: certDetails.subject,
                    statusBadgeVariant: certificateSpecific.statusBadgeVariant,
                    statusText: certificateSpecific.apiStatusText,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return <p>Invalid itemType or missing data.</p>;
};
