
'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Download, Link, FileCode, GitBranch, Info } from "lucide-react";
import { sileo } from '@/lib/toast';
import type { CA } from '@/lib/ca-data';
import { IssuanceChainVisualizer } from '@/components/shared/IssuanceChainVisualizer';
import { cn } from '@/lib/utils';

interface PemTabContentProps {
  singlePemData: string | undefined;
  fullChainPemData?: string | undefined;
  itemName: string;
  itemPathToRootCount?: number;
  certificateChain?: CA[];
  currentCertificate?: {
    subject: string;
    statusBadgeVariant: "default" | "secondary" | "destructive" | "outline";
    statusBadgeClass?: string;
    statusText: string;
  };
}

// ── PEM block card ─────────────────────────────────────────────────────────────

interface PemBlockProps {
  title: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
  pem: string | undefined;
  onCopy: () => void;
  onDownload: () => void;
  copied: boolean;
  height?: string;
}

const PemBlock: React.FC<PemBlockProps> = ({
  title, icon: Icon, badge, pem, onCopy, onDownload, copied, height = 'h-72',
}) => (
  <div className="rounded-xl border bg-card overflow-hidden">
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background border">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <span className="text-sm font-semibold truncate">{title}</span>
        {badge}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5" onClick={onCopy} disabled={!pem}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5" onClick={onDownload} disabled={!pem}>
          <Download className="h-3.5 w-3.5" />
          .pem
        </Button>
      </div>
    </div>

    {pem ? (
      <ScrollArea className={cn('w-full', height)}>
        <pre className="p-4 text-xs font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
          {pem.replace(/\\n/g, '\n')}
        </pre>
      </ScrollArea>
    ) : (
      <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
        No PEM data available.
      </div>
    )}
  </div>
);

// ── main export ────────────────────────────────────────────────────────────────

export const PemTabContent: React.FC<PemTabContentProps> = ({
  singlePemData,
  fullChainPemData,
  itemName,
  itemPathToRootCount,
  certificateChain,
  currentCertificate,
}) => {
  const [certificateCopied, setCertificateCopied] = useState(false);
  const [chainCopied, setChainCopied] = useState(false);

  const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();

  const copyText = async (text: string, label: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text.replace(/\\n/g, '\n'));
      setCopied(true);
      sileo.success({ title: 'Copied!', description: `${label} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      sileo.error({ title: 'Copy Failed', description: `Could not copy ${label}.` });
    }
  };

  const downloadPem = (text: string, filename: string, label: string) => {
    const blob = new Blob([text.replace(/\\n/g, '\n')], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    sileo.success({ title: 'Downloaded', description: `${label} downloaded.` });
  };

  const hasChain = !!fullChainPemData && !!fullChainPemData.trim();
  const chainCount = itemPathToRootCount ?? 0;

  return (
    <div className="space-y-5">

      {/* Single certificate PEM */}
      <PemBlock
        title="This Certificate"
        icon={FileCode}
        pem={singlePemData}
        onCopy={() => singlePemData
          ? copyText(singlePemData, `Certificate PEM for ${itemName}`, setCertificateCopied)
          : sileo.error({ title: 'Copy Failed', description: 'No PEM data found.' })}
        onDownload={() => singlePemData
          ? downloadPem(singlePemData, `${sanitizeFilename(itemName)}.pem`, `Certificate PEM for ${itemName}`)
          : sileo.error({ title: 'Download Failed', description: 'No PEM data found.' })}
        copied={certificateCopied}
      />

      {/* Full chain */}
      {hasChain && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background border">
                <Link className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm font-semibold">Full Certificate Chain</span>
              {chainCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {chainCount} cert{chainCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => copyText(fullChainPemData!, `Full chain PEM for ${itemName}`, setChainCopied)}
              >
                {chainCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {chainCopied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => downloadPem(fullChainPemData!, `${sanitizeFilename(itemName)}_chain.pem`, `Chain PEM for ${itemName}`)}
              >
                <Download className="h-3.5 w-3.5" />
                .pem
              </Button>
            </div>
          </div>

          {/* Two-column body: PEM left, chain visualizer right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
            <ScrollArea className="h-96">
              <pre className="p-4 text-xs font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
                {fullChainPemData!.replace(/\\n/g, '\n')}
              </pre>
            </ScrollArea>

            {certificateChain && currentCertificate && (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chain of Trust</span>
                </div>
                <div className="px-4 pt-3">
                  <div className="flex items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
                    <Info className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      The PEM chain is ordered from <strong>leaf → Root</strong>. This diagram follows the same order.
                    </p>
                  </div>
                </div>
                <ScrollArea className="h-[calc(24rem-2.5rem-3.5rem)]">
                  <div className="p-4">
                    <IssuanceChainVisualizer
                      certificateChain={certificateChain}
                      currentCertificate={currentCertificate}
                      invert={true}
                    />
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
