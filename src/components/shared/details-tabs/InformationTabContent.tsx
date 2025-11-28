

'use client';

import React, { useState, useEffect } from 'react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Info, KeyRound, Lock, Link as LinkIcon, Network, Users, AlertCircle } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { DetailItem } from '@/components/shared/DetailItem';
import { CaHierarchyPathNode } from '@/components/ca/details/CaHierarchyPathNode';
import { getCaDisplayName, fetchSigningProfiles, type ApiSigningProfile, updateCaDefaultProfileId } from '@/lib/ca-data';
import { DateDisplay } from '@/components/shared/DateDisplay';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { SigningProfileSelector } from '@/components/shared/SigningProfileSelector';
import type { ProfileMode } from '@/components/shared/SigningProfileSelector';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { revocationReasons } from '@/lib/revocation-reasons';
import { IssuanceChainVisualizer } from '@/components/shared/IssuanceChainVisualizer';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';


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

const renderUrlList = (urls: string[] | undefined, listTitle: string) => {
  if (!urls || urls.length === 0) {
    return null;
  }
  return (
    <>
      <h5 className="font-medium text-sm mt-1">{listTitle}</h5>
      <ul className="list-disc list-inside space-y-1 pl-4">
        {urls.map((url, i) => <li key={i}><a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{url}</a></li>)}
      </ul>
    </>
  );
}


const toTitleCase = (str: string) => {
  return str
    .replace(/([A-Z])/g, ' $1') // insert a space before all caps
    .replace(/^./, (s) => s.toUpperCase()); // uppercase the first character
};

const getRevocationReasonLabel = (reason: string | undefined): string => {
  if (!reason) return 'Unknown';
  const found = revocationReasons.find(r => r.value === reason);
  return found ? found.label : reason;
};


export const InformationTabContent: React.FC<InformationTabContentProps> = ({
  item,
  itemType,
  caSpecific,
  certificateSpecific,
  routerHook,
  onAkiClick,
  onUpdateSuccess,
}) => {
  const accordionTriggerStyle = "text-md font-semibold bg-gradient-to-r from-muted/50 to-muted/30 hover:from-muted/60 hover:to-muted/40 data-[state=open]:from-primary/10 data-[state=open]:to-primary/5 data-[state=open]:text-primary px-5 py-4 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md";

  const { user } = useAuth();
  const { toast } = useToast();

  // State for profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileMode, setProfileMode] = useState<ProfileMode>('reuse');
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Load available profiles when editing starts or component mounts
    const loadProfiles = async () => {
      if (user?.access_token) {
        setIsLoadingProfiles(true);
        try {
          const profilesResponse = await fetchSigningProfiles(user.access_token);
          setAvailableProfiles(profilesResponse.list);
        } catch (err) {
          console.error("Failed to load signing profiles:", err);
          toast({ title: "Error", description: "Could not load issuance profiles.", variant: "destructive" });
        } finally {
          setIsLoadingProfiles(false);
        }
      }
    };

    // Load profiles on component mount for CA details, and when editing starts
    if (itemType === 'ca') {
      loadProfiles();
    }

    // Set initial selected profile ID from the CA item
    if (itemType === 'ca') {
      setSelectedProfileId((item as CA).defaultProfileId || null);
    }
  }, [item, itemType, isEditingProfile, user?.access_token, toast]);

  const handleSaveProfile = async () => {
    if (itemType !== 'ca' || !user?.access_token) return;

    const caDetails = item as CA;
    setIsSubmitting(true);
    try {
      await updateCaDefaultProfileId(caDetails.id, selectedProfileId, user.access_token);
      toast({ title: "Success", description: "Default issuance profile updated." });
      onUpdateSuccess?.(); // Re-fetch parent data
      setIsEditingProfile(false);
    } catch (e: any) {
      toast({ title: "Update Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
    // Reset selected profile to the original one from the `item` prop
    if (itemType === 'ca') {
      setSelectedProfileId((item as CA).defaultProfileId || null);
    }
  };

  const selectedProfileForDisplay = React.useMemo(() => {
    return availableProfiles.find(p => p.id === selectedProfileId);
  }, [selectedProfileId, availableProfiles]);


  if (itemType === 'ca' && caSpecific) {
    const caDetails = item as CA;

    return (
      <>
        {caDetails.status === 'revoked' && caDetails.rawApiData?.certificate?.revocation_timestamp && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Certificate Authority Revoked</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-sm font-medium">Reason:</span>
                <Badge variant="outline" className="w-fit bg-destructive/10 text-destructive border-destructive/30">
                  {getRevocationReasonLabel(caDetails.rawApiData.certificate.revocation_reason)}
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-sm font-medium">Revoked On:</span>
                <DateDisplay date={caDetails.rawApiData.certificate.revocation_timestamp} formatString="PPpp" />
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Accordion type="multiple" defaultValue={['general', 'keyInfo', 'extensions', 'distribution', 'hierarchy']} className="w-full space-y-3">
          <AccordionItem value="general" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <Info className="mr-2 h-5 w-5" /> General Information
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 px-2 pt-4 pb-2">
              <DetailItem label="Full Name" value={caDetails.name} />
              <DetailItem label="CA ID" value={<Badge variant="secondary">{caDetails.id}</Badge>} />
              <DetailItem label="Issuer" value={getCaDisplayName(caDetails.issuer, caSpecific.allCAsForLinking)} />
              <DetailItem label="Expires On" value={<DateDisplay date={caDetails.expires} formatString="PPpp" highlightExpired />} />
              <DetailItem label="Serial Number" value={<IdentifierDisplay value={caDetails.serialNumber} />} showSeparator={false} />

              <div className="px-4 py-3 rounded-lg mt-2 bg-muted/20 border border-border/50">
                <dt className="text-sm font-semibold text-muted-foreground mb-3 flex items-center">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/40 mr-2" />
                  Default Issuance Profile
                </dt>
                <dd className="mt-1 sm:mt-0 flex flex-col gap-2">
                  {!isEditingProfile ? (
                    <>
                      {caDetails.defaultProfileId && selectedProfileForDisplay ? (
                        <IssuanceProfileCard profile={selectedProfileForDisplay} />
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Not Set</p>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)} className="w-fit">
                        {caDetails.defaultProfileId ? 'Change Profile' : 'Set Profile'}
                      </Button>
                    </>
                  ) : (
                    <div className='w-full'>
                      <SigningProfileSelector
                        profileMode={profileMode}
                        onProfileModeChange={setProfileMode}
                        availableProfiles={availableProfiles}
                        isLoadingProfiles={isLoadingProfiles}
                        selectedProfileId={selectedProfileId}
                        onProfileIdChange={setSelectedProfileId}
                        inlineModeEnabled={false} // Inline mode not applicable here
                        createModeEnabled={true}  // Allow creating a new profile
                      />
                      <div className="flex justify-end space-x-2 mt-4">
                        <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={isSubmitting}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveProfile} disabled={isSubmitting || isLoadingProfiles}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  )}
                </dd>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="keyInfo" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <KeyRound className="mr-2 h-5 w-5" /> Key & Signature Information
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 px-2 pt-4 pb-2">
              <DetailItem label="Public Key Algorithm" value={caDetails.keyAlgorithm || 'N/A'} />
              <DetailItem label="Signature Algorithm" value={caDetails.signatureAlgorithm || 'N/A'} />
              <DetailItem label="Subject Key Identifier (SKI)" value={caDetails.subjectKeyId ? <IdentifierDisplay value={caDetails.subjectKeyId} className="text-xs" /> : 'N/A'} />
              <DetailItem label="Authority Key Identifier (AKI)" value={caDetails.authorityKeyId ? <IdentifierDisplay value={caDetails.authorityKeyId} className="text-xs" /> : 'N/A'} showSeparator={false} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="extensions" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <Lock className="mr-2 h-5 w-5" /> Certificate Extensions
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 px-2 pt-4 pb-2">
              <DetailItem label="Basic Constraints" value={
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">CA: <Badge variant={caDetails.isCa ? "default" : "secondary"} className={(caDetails.isCa ? 'bg-green-100 text-green-700' : '')}>{caDetails.isCa ? "TRUE" : "FALSE"}</Badge></div>
                </div>
              } showSeparator={false} />
              <Separator className="my-3" />
              <DetailItem label="Key Usages" value={
                (caDetails.keyUsage && caDetails.keyUsage.length > 0) || (caDetails.extendedKeyUsage && caDetails.extendedKeyUsage.length > 0) ? (
                  <div className="space-y-2">
                    {caDetails.keyUsage && caDetails.keyUsage.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {caDetails.keyUsage.map(usage => <Badge key={usage} variant="outline">{toTitleCase(usage)}</Badge>)}
                      </div>
                    )}
                    {caDetails.extendedKeyUsage && caDetails.extendedKeyUsage.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {caDetails.extendedKeyUsage.map(usage => <Badge key={usage} variant="outline">{toTitleCase(usage)}</Badge>)}
                      </div>
                    )}
                  </div>
                ) : ("Not Specified")
              } showSeparator={false} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="distribution" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <LinkIcon className="mr-2 h-5 w-5" /> Distribution Points
            </AccordionTrigger>
            <AccordionContent className="space-y-3 px-6 pt-4 pb-2">
              {renderUrlList(caDetails.crlDistributionPoints, 'CRL Distribution Points (CDP)')}
              {caDetails.crlDistributionPoints && (caDetails.ocspUrls || caDetails.caIssuersUrls) && <Separator />}
              {renderUrlList(caDetails.ocspUrls, 'OCSP Responders (from AIA)')}
              {caDetails.ocspUrls && caDetails.caIssuersUrls && <Separator />}
              {renderUrlList(caDetails.caIssuersUrls, 'CA Issuers (from AIA)')}
              {(!caDetails.crlDistributionPoints || caDetails.crlDistributionPoints.length === 0) && (!caDetails.ocspUrls || caDetails.ocspUrls.length === 0) && (!caDetails.caIssuersUrls || caDetails.caIssuersUrls.length === 0) && (
                <p className="text-sm text-muted-foreground">No distribution points specified in certificate.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="hierarchy" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <Network className="mr-2 h-5 w-5" /> Issuance Hierarchy & Chain of Trust
            </AccordionTrigger>
            <AccordionContent className="space-y-4 px-4 pt-4 pb-2 bg-muted/10 rounded-lg">
              {caSpecific.pathToRoot.length > 0 ? (
                <div className="flex flex-col items-center w-full">
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
                <>
                  <Separator className="my-4" />
                  <h4 className="text-md font-semibold flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground" />Directly Issues To:</h4>
                  <ul className="list-disc list-inside space-y-1 pl-4">
                    {caDetails.children.map(child => (
                      <li key={child.id}>
                        <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => routerHook.push(`/certificate-authorities/details?caId=${child.id}`)}>
                          {child.name} (ID: {child.id})
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </>
    );
  } else if (itemType === 'certificate' && certificateSpecific) {
    const certDetails = item as CertificateData;
    return (
      <>
        {certDetails.apiStatus?.toLowerCase() === 'revoked' && certDetails.revocationTimestamp && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Certificate Revoked</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-sm font-medium">Reason:</span>
                <Badge variant="outline" className="w-fit bg-destructive/10 text-destructive border-destructive/30">
                  {getRevocationReasonLabel(certDetails.revocationReason)}
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-sm font-medium">Revoked On:</span>
                <DateDisplay date={certDetails.revocationTimestamp} formatString="PPpp" />
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Accordion type="multiple" defaultValue={['general', 'keyInfo', 'extensions', 'distribution', 'chain-visualizer']} className="w-full space-y-3">
          <AccordionItem value="general" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <Info className="mr-2 h-5 w-5" /> General Information
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 px-2 pt-4 pb-2">
              <DetailItem label="Subject" value={certDetails.subject} />
              <DetailItem label="Issuer" value={certDetails.issuer} />
              <DetailItem label="Serial Number" value={<IdentifierDisplay value={certDetails.serialNumber} />} />
              <DetailItem label="Valid From" value={<DateDisplay date={certDetails.validFrom} formatString="PPpp" />} />
              <DetailItem
                label="Valid To"
                value={<DateDisplay date={certDetails.validTo} formatString="PPpp" highlightExpired />}
                showSeparator={false}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="keyInfo" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <KeyRound className="mr-2 h-5 w-5" /> Key & Signature
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 px-2 pt-4 pb-2">
              <DetailItem label="Public Key Algorithm" value={certDetails.publicKeyAlgorithm || 'N/A'} />
              <DetailItem label="Signature Algorithm" value={certDetails.signatureAlgorithm || 'N/A'} />
              <DetailItem label="SHA-256 Fingerprint" value={certDetails.fingerprintSha256 ? <IdentifierDisplay value={certDetails.fingerprintSha256} className="text-xs" /> : 'N/A (Generate if needed)'} />
              {certDetails.rawApiData?.subject_key_id && <DetailItem label="Subject Key ID (SKI)" value={<IdentifierDisplay value={certDetails.rawApiData.subject_key_id} className="text-xs" />} />}
              <DetailItem
                label="Authority Key Identifier (AKI)"
                value={
                  certDetails.rawApiData?.authority_key_id && onAkiClick ? (
                    <Button
                      variant="link"
                      className="p-0 h-auto font-mono text-xs text-left whitespace-normal break-all"
                      onClick={() => onAkiClick(certDetails.rawApiData.authority_key_id)}
                      title="Find Issuer CA by AKI"
                    >
                      <IdentifierDisplay value={certDetails.rawApiData.authority_key_id} className="text-xs" />
                    </Button>
                  ) : certDetails.rawApiData?.authority_key_id ? (
                    <IdentifierDisplay value={certDetails.rawApiData.authority_key_id} className="text-xs" />
                  ) : (
                    <span className="font-mono text-xs">N/A</span>
                  )
                }
                showSeparator={false}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="extensions" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <Lock className="mr-2 h-5 w-5" /> Certificate Extensions
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 px-2 pt-4 pb-2">
              <DetailItem label="Subject Alternative Names" value={
                certDetails.sans && certDetails.sans.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {certDetails.sans.map((san, index) => <Badge key={index} variant="secondary">{san}</Badge>)}
                  </div>
                ) : ("Not Specified")
              } showSeparator={false} />
              <Separator className="my-3" />
              <DetailItem label="Key Usages" value={
                (certDetails.keyUsage && certDetails.keyUsage.length > 0) || (certDetails.extendedKeyUsage && certDetails.extendedKeyUsage.length > 0) ? (
                  <div className="space-y-2">
                    {certDetails.keyUsage && certDetails.keyUsage.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {certDetails.keyUsage.map(usage => <Badge key={usage} variant="outline">{toTitleCase(usage)}</Badge>)}
                      </div>
                    )}
                    {certDetails.extendedKeyUsage && certDetails.extendedKeyUsage.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {certDetails.extendedKeyUsage.map(usage => <Badge key={usage} variant="outline">{toTitleCase(usage)}</Badge>)}
                      </div>
                    )}
                  </div>
                ) : ("Not Specified")
              } showSeparator={false} />
            </AccordionContent>
          </AccordionItem>

          {(certDetails.crlDistributionPoints || certDetails.ocspUrls || certDetails.caIssuersUrls) && (
            <AccordionItem value="distribution" className="border-b-0">
              <AccordionTrigger className={cn(accordionTriggerStyle)}>
                <LinkIcon className="mr-2 h-5 w-5" /> Distribution Points
              </AccordionTrigger>
              <AccordionContent className="space-y-3 px-6 pt-4 pb-2">
                {renderUrlList(certDetails.crlDistributionPoints, 'CRL Distribution Points (CDP)')}
                {(certDetails.crlDistributionPoints && certDetails.crlDistributionPoints.length > 0) && (certDetails.ocspUrls || certDetails.caIssuersUrls) && <Separator />}
                {renderUrlList(certDetails.ocspUrls, 'OCSP Responders (from AIA)')}
                {renderUrlList(certDetails.caIssuersUrls, 'CA Issuers (from AIA)')}
              </AccordionContent>
            </AccordionItem>
          )}

          {certificateSpecific.certificateChainForVisualizer && (
            <AccordionItem value="chain-visualizer" className="border-b-0">
              <AccordionTrigger className={cn(accordionTriggerStyle)}>
                <Network className="mr-2 h-5 w-5" /> Issuance Chain
              </AccordionTrigger>
              <AccordionContent className="space-y-4 px-4 pt-4 pb-2 bg-muted/10 rounded-lg">
                <IssuanceChainVisualizer
                  certificateChain={certificateSpecific.certificateChainForVisualizer}
                  currentCertificate={{
                    subject: certDetails.subject,
                    statusBadgeVariant: certificateSpecific.statusBadgeVariant,
                    statusBadgeClass: certificateSpecific.statusBadgeClass,
                    statusText: certificateSpecific.apiStatusText,
                  }}
                />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </>
    );
  }

  return <p>Invalid itemType or missing data.</p>;
};
