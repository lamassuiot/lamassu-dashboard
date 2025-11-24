'use client';

import React from 'react';
import type { CA } from '@/lib/ca-data';
import type { CertificateData } from '@/types/certificate';
import { Badge } from '@/components/ui/badge';
import { FileText, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CaHierarchyPathNode } from '@/components/ca/details/CaHierarchyPathNode';

interface IssuanceChainVisualizerProps {
  certificateChain: CA[];
  currentCertificate: {
    subject: string;
    statusBadgeVariant: "default" | "secondary" | "destructive" | "outline";
    statusBadgeClass?: string;
    statusText: string;
  };
  className?: string;
  invert?: boolean; // When true, shows leaf certificate first (top), then parents up to root
}

export const IssuanceChainVisualizer: React.FC<IssuanceChainVisualizerProps> = ({
  certificateChain,
  currentCertificate,
  className,
  invert = false,
}) => {
  // If invert is true, reverse the chain order and show current cert first
  const displayChain = invert ? [...certificateChain].reverse() : certificateChain;
  
  return (
    <div className={cn("flex flex-col items-center w-full", className)}>
      {invert ? (
        <>
          {/* Render the end-entity certificate first when inverted */}
          <div
            className={cn(
              "w-full max-w-sm border-2 rounded-lg p-3 shadow-lg mt-0",
              "bg-primary/10 border-primary"
            )}
          >
            <div className={cn("flex items-center space-x-3")}>
              <div className={cn("p-2 rounded-full bg-primary/20")}>
                <FileText className={cn("h-5 w-5 text-primary")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold truncate text-primary")}>
                  {currentCertificate.subject}
                </p>
                <p className={cn("text-xs text-muted-foreground truncate")}>This Certificate</p>
              </div>
              <Badge 
                variant={currentCertificate.statusBadgeVariant} 
                className={cn(currentCertificate.statusBadgeVariant !== 'outline' ? currentCertificate.statusBadgeClass : '')}
              >
                {currentCertificate.statusText}
              </Badge>
            </div>
          </div>
          
          {/* Add separator after leaf certificate if there are parent CAs */}
          {displayChain.length > 0 && (
            <ChevronDown className="h-5 w-5 text-primary my-1 rotate-180" />
          )}
          
          {/* Then render the CA chain (reversed) */}
          {displayChain.map((caNode, index) => (
            <CaHierarchyPathNode
              key={caNode.id}
              ca={caNode}
              isCurrentCa={false}
              hasNext={index < displayChain.length - 1}
              isFirst={false} // First is the current cert when inverted
              invertSeparator={true}
            />
          ))}
        </>
      ) : (
        <>
          {/* Normal order: Render the CA chain first (root to leaf) */}
          {certificateChain.map((caNode, index) => (
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
                  {currentCertificate.subject}
                </p>
                <p className={cn("text-xs text-muted-foreground truncate")}>This Certificate</p>
              </div>
              <Badge 
                variant={currentCertificate.statusBadgeVariant} 
                className={cn(currentCertificate.statusBadgeVariant !== 'outline' ? currentCertificate.statusBadgeClass : '')}
              >
                {currentCertificate.statusText}
              </Badge>
            </div>
          </div>
        </>
      )}
      {/* Add a small spacer if it's the last item */}
      <div className="h-2"></div>
    </div>
  );
};
