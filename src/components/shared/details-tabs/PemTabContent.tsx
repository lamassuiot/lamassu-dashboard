
'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Download, ChevronRight, FileCode, Link2, ShieldCheck } from "lucide-react";
import { sileo } from '@/lib/toast';
import type { CA } from '@/lib/ca-data';
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

// ── Render PEM with highlighted BEGIN/END markers ─────────────────────────────

function HighlightedPem({ pem }: { pem: string }) {
  const lines = pem.replaceAll('\\n', '\n').split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span
          key={i}
          className={cn(
            'block',
            line.startsWith('-----') ? 'text-primary/80 font-semibold' : 'text-foreground/60'
          )}
        >
          {line || ' '}
        </span>
      ))}
    </>
  );
}

// ── Individual PEM export card ─────────────────────────────────────────────────

interface PemCardProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
  pem: string | undefined;
  filename: string;
  itemName: string;
}

function PemCard({ title, subtitle, icon: Icon, badge, pem, filename, itemName }: PemCardProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!pem) return sileo.error({ title: 'Copy Failed', description: 'No PEM data found.' });
    try {
      await navigator.clipboard.writeText(pem.replaceAll('\\n', '\n'));
      setCopied(true);
      sileo.success({ title: 'Copied!', description: `${title} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      sileo.error({ title: 'Copy Failed', description: `Could not copy ${title}.` });
    }
  };

  const download = () => {
    if (!pem) return sileo.error({ title: 'Download Failed', description: 'No PEM data found.' });
    const blob = new Blob([pem.replace(/\\n/g, '\n')], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    sileo.success({ title: 'Downloaded', description: `${filename} downloaded.` });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border">
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold leading-none">{title}</p>
              {badge}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" className="h-7 px-2.5 text-xs gap-1.5" onClick={copy} disabled={!pem}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" className="h-7 px-2.5 text-xs gap-1.5" onClick={download} disabled={!pem}>
            <Download className="h-3.5 w-3.5" />
            .pem
          </Button>
        </div>
      </div>

      {/* PEM body */}
      {pem ? (
        <ScrollArea className="h-72 bg-muted/10 flex-1">
          <pre className="p-5 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
            <HighlightedPem pem={pem} />
          </pre>
        </ScrollArea>
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground bg-muted/10">
          No PEM data available.
        </div>
      )}
    </div>
  );
}

// ── Chain strip ────────────────────────────────────────────────────────────────

function ChainStrip({
  certificateChain,
  currentCertificate,
}: {
  certificateChain: CA[];
  currentCertificate: NonNullable<PemTabContentProps['currentCertificate']>;
}) {
  const nodes: Array<{ label: string; isCurrent: boolean }> = [
    ...certificateChain.map(ca => ({ label: ca.name, isCurrent: false })),
    { label: currentCertificate.subject, isCurrent: true },
  ];

  return (
    <div className="rounded-xl border bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground mr-1">Chain of Trust</span>
        {nodes.map((node, i) => (
          <React.Fragment key={i}>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                node.isCurrent
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground'
              )}
            >
              {node.label}
            </span>
            {i < nodes.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
          </React.Fragment>
        ))}
        <Badge variant="secondary" className="ml-auto text-xs">{nodes.length} cert{nodes.length !== 1 ? 's' : ''}</Badge>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export const PemTabContent: React.FC<PemTabContentProps> = ({
  singlePemData,
  fullChainPemData,
  itemName,
  itemPathToRootCount,
  certificateChain,
  currentCertificate,
}) => {
  const sanitize = (name: string) => name.replaceAll(/[^a-z0-9_.-]/gi, '_').toLowerCase();
  const base = sanitize(itemName);
  const hasChain = !!fullChainPemData?.trim();
  const chainCount = itemPathToRootCount ?? 0;

  return (
    <div className="py-6 space-y-4">

      {/* Chain strip — only when chain data is available */}
      {hasChain && certificateChain && currentCertificate && (
        <ChainStrip certificateChain={certificateChain} currentCertificate={currentCertificate} />
      )}

      {/* Export cards */}
      <div className={cn('grid gap-4', hasChain ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>
        <PemCard
          title="Leaf Certificate"
          subtitle="PEM-encoded X.509 certificate"
          icon={FileCode}
          pem={singlePemData}
          filename={`${base}.pem`}
          itemName={itemName}
        />
        {hasChain && (
          <PemCard
            title="Full Chain"
            subtitle="Leaf-to-root bundle"
            icon={Link2}
            badge={chainCount > 0 ? <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{chainCount}</Badge> : undefined}
            pem={fullChainPemData}
            filename={`${base}_chain.pem`}
            itemName={itemName}
          />
        )}
      </div>

    </div>
  );
};
