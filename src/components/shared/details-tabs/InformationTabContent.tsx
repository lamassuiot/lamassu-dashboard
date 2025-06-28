'use client';

import React from 'react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Info, KeyRound, Lock, Link as LinkIcon, Network, ListChecks, Users, FileText } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DetailItem } from '@/components/shared/DetailItem';
import { CaHierarchyPathNode } from '@/components/ca/details/CaHierarchyPathNode';
import { getCaDisplayName } from '@/lib/ca-data';
import { format, parseISO } from 'date-fns';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';


interface CaStats {
  ACTIVE: number;
  EXPIRED: number;
  REVOKED: number;
}

interface InformationTabContentProps {
  item: CA | CertificateData;
  itemType: 'ca' | 'certificate';
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

export const InformationTabContent: React.FC<InformationTabContentProps> = ({
  item,
  itemType,
  caSpecific,
  certificateSpecific,
  routerHook,
  onAkiClick,
}) => {
  const accordionTriggerStyle = "text-md font-medium bg-muted/30 hover:bg-muted/40 data-[state=open]:bg-muted/50 px-4 py-3 rounded-md";

  if (itemType === 'ca' && caSpecific) {
    const caDetails = item as CA;
    const cryptoEngine = caDetails.kmsKeyId && caSpecific.allCryptoEngines ? caSpecific.allCryptoEngines.find(e => e.id === caDetails.kmsKeyId) : undefined;
    
    return (
      <Accordion type="multiple" defaultValue={['general', 'hierarchy']} className="w-full space-y-3">
        <AccordionItem value="general" className="border-b-0">
          <AccordionTrigger className={cn(accordionTriggerStyle)}>
            <Info className="mr-2 h-5 w-5" /> General Information
          </AccordionTrigger>
          <AccordionContent className="space-y-1 px-4 pt-3">
            <DetailItem label="Full Name" value={caDetails.name} />
            <DetailItem label="CA ID" value={<Badge variant="outline">{caDetails.id}</Badge>} />
            <DetailItem label="Issuer" value={getCaDisplayName(caDetails.issuer, caSpecific.allCAsForLinking)} />
            <DetailItem label="Expires On" value={new Date(caDetails.expires).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
            <DetailItem label="Serial Number" value={<span className="font-mono text-sm">{caDetails.serialNumber}</span>} />
          </AccordionContent>
        </AccordionItem>
        
        <AccordionItem value="keyInfo" className="border-b-0">
          <AccordionTrigger className={cn(accordionTriggerStyle)}>
            <KeyRound className="mr-2 h-5 w-5" /> Key & Signature Information
          </AccordionTrigger>
          <AccordionContent className="space-y-1 px-4 pt-3">
            <DetailItem label="Public Key Algorithm" value={caDetails.keyAlgorithm || 'N/A'} />
            <DetailItem label="Signature Algorithm" value={caDetails.signatureAlgorithm || 'N/A'} />
            <DetailItem label="Subject Key Identifier (SKI)" value={<span className="font-mono text-xs">{caDetails.subjectKeyId || 'N/A'}</span>} />
            <DetailItem label="Authority Key Identifier (AKI)" value={<span className="font-mono text-xs">{caDetails.authorityKeyId || 'N/A'}</span>} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="extensions" className="border-b-0">
          <AccordionTrigger className={cn(accordionTriggerStyle)}>
            <Lock className="mr-2 h-5 w-5" /> Certificate Extensions
          </AccordionTrigger>
          <AccordionContent className="space-y-1 px-4 pt-3">
            <DetailItem label="Basic Constraints" value={
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">CA: <Badge variant={caDetails.isCa ? "default" : "secondary"} className={(caDetails.isCa ? 'bg-green-100 text-green-700' : '')}>{caDetails.isCa ? "TRUE" : "FALSE"}</Badge></div>
                {caDetails.isCa && <div>Path Length Constraint: {caDetails.issuer === 'Self-signed' ? 'None' : (caDetails.children && caDetails.children.length > 0 ? '1 (placeholder)' : '0 (placeholder)')}</div>}
              </div>
            } />
            <Separator className="my-2" />
            <DetailItem label="Key Usage" value={
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">Certificate Signing</Badge>
                <Badge variant="outline">CRL Signing</Badge>
                <Badge variant="outline">Digital Signature</Badge>
              </div>
            } />
            <Separator className="my-2" />
            <DetailItem label="Extended Key Usage" value={"Not Specified"} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="distribution" className="border-b-0">
          <AccordionTrigger className={cn(accordionTriggerStyle)}>
            <LinkIcon className="mr-2 h-5 w-5" /> Distribution Points
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4 pt-3">
             {renderUrlList(caDetails.crlDistributionPoints, 'CRL Distribution Points (CDP)')}
             {caDetails.crlDistributionPoints && (caDetails.ocspUrls || caDetails.caIssuersUrls) && <Separator/>}
             {renderUrlList(caDetails.ocspUrls, 'OCSP Responders (from AIA)')}
             {caDetails.ocspUrls && caDetails.caIssuersUrls && <Separator/>}
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
          <AccordionContent className="space-y-4 p-4 pt-3">
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
    );
  } else if (itemType === 'certificate' && certificateSpecific) {
    const certDetails = item as CertificateData;
    return (
      <Accordion type="multiple" defaultValue={['general', 'keyInfo', 'chain-visualizer']} className="w-full space-y-3">
        <AccordionItem value="general" className="border-b-0">
          <AccordionTrigger className={cn(accordionTriggerStyle)}>
            <Info className="mr-2 h-5 w-5" /> General Information
          </AccordionTrigger>
          <AccordionContent className="space-y-1 px-4 pt-3">
            <DetailItem label="Subject" value={certDetails.subject} />
            <DetailItem label="Issuer" value={certDetails.issuer} />
            <DetailItem label="Serial Number" value={certDetails.serialNumber} isMono />
            <DetailItem label="Valid From" value={format(parseISO(certDetails.validFrom), 'PPpp')} />
            <DetailItem label="Valid To" value={format(parseISO(certDetails.validTo), 'PPpp')} />
            <DetailItem label="API Status" value={<Badge variant={certificateSpecific.statusBadgeVariant} className={cn(certificateSpecific.statusBadgeVariant !== 'outline' ? certificateSpecific.statusBadgeClass : '')}>{certificateSpecific.apiStatusText}</Badge>} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="keyInfo" className="border-b-0">
          <AccordionTrigger className={cn(accordionTriggerStyle)}>
            <KeyRound className="mr-2 h-5 w-5" /> Key & Signature
          </AccordionTrigger>
          <AccordionContent className="space-y-1 px-4 pt-3">
            <DetailItem label="Public Key Algorithm" value={certDetails.publicKeyAlgorithm || 'N/A'} />
            <DetailItem label="Signature Algorithm" value={certDetails.signatureAlgorithm || 'N/A'} />
            <DetailItem label="SHA-256 Fingerprint" value={certDetails.fingerprintSha256 || 'N/A (Generate if needed)'} isMono />
            {certDetails.rawApiData?.subject_key_id && <DetailItem label="Subject Key ID (SKI)" value={certDetails.rawApiData.subject_key_id} isMono />}
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
                            {certDetails.rawApiData.authority_key_id}
                        </Button>
                    ) : (
                        <span className="font-mono text-xs">{certDetails.rawApiData?.authority_key_id || 'N/A'}</span>
                    )
                }
            />
          </AccordionContent>
        </AccordionItem>

        {certDetails.sans && certDetails.sans.length > 0 && (
          <AccordionItem value="sans" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <ListChecks className="mr-2 h-5 w-5" /> Subject Alternative Names
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-3">
              <div className="flex flex-wrap gap-1">
                {certDetails.sans.map((san, index) => <Badge key={index} variant="secondary">{san}</Badge>)}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {(certDetails.crlDistributionPoints || certDetails.ocspUrls || certDetails.caIssuersUrls) && (
          <AccordionItem value="distribution" className="border-b-0">
            <AccordionTrigger className={cn(accordionTriggerStyle)}>
              <LinkIcon className="mr-2 h-5 w-5" /> Distribution Points
            </AccordionTrigger>
            <AccordionContent className="space-y-3 px-4 pt-3">
               {renderUrlList(certDetails.crlDistributionPoints, 'CRL Distribution Points (CDP)')}
               {(certDetails.crlDistributionPoints && certDetails.crlDistributionPoints.length > 0) && (certDetails.ocspUrls || certDetails.caIssuersUrls) && <Separator/>}
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
            <AccordionContent className="space-y-4 p-4 pt-3">
              <div className="flex flex-col items-center w-full">
                {/* Render the CA chain first */}
                {certificateSpecific.certificateChainForVisualizer.map((caNode, index) => (
                  <CaHierarchyPathNode
                    key={caNode.id}
                    ca={caNode}
                    isCurrentCa={false} // These are parent CAs
                    hasNext={true}      // Each CA in the chain is followed by another element (either another CA or this cert)
                    isFirst={index === 0}
                  />
                ))}

                {/* Render the end-entity certificate (current item) last */}
                <div
                  className={cn(
                    "w-full max-w-sm border-2 rounded-lg p-3 shadow-lg mt-0", // mt-0 ensures it follows directly after the last CA
                    "bg-primary/10 border-primary" // Highlighting for "this" certificate
                  )}
                >
                  <div className={cn("flex items-center space-x-3")}>
                    <div className={cn("p-2 rounded-full bg-primary/20")}>
                      <FileText className={cn("h-5 w-5 text-primary")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-semibold truncate text-primary")}>
                        {certDetails.subject}
                      </p>
                      <p className={cn("text-xs text-muted-foreground truncate")}>This Certificate</p>
                    </div>
                    <Badge variant={certificateSpecific.statusBadgeVariant} className={cn(certificateSpecific.statusBadgeVariant !== 'outline' ? certificateSpecific.statusBadgeClass : '')}>
                      {certificateSpecific.apiStatusText}
                    </Badge>
                  </div>
                </div>
                {/* Add a small spacer if it's the last item */}
                <div className="h-2"></div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    );
  }

  return <p>Invalid itemType or missing data.</p>;
};
