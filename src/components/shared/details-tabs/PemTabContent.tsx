
'use client';

import React from 'react';
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ChevronRight, FileCode, Link2, ShieldCheck, type LucideIcon } from "lucide-react";
import { CodeSnippet } from '@/components/shared/CodeSnippet';
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
    statusBadgeVariant: BadgeVariant;
    statusText: string;
  };
}

// ── Individual PEM export card ─────────────────────────────────────────────────

interface PemCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  badge?: React.ReactNode;
  pem: string | undefined;
  filename: string;
  itemName: string;
}

export function PemCard({ title, subtitle, icon, badge, pem, filename }: Readonly<PemCardProps>) {
  return (
    <CodeSnippet
      language="pem"
      content={(pem ?? '').replaceAll('\\n', '\n').trim()}
      title={title}
      subtitle={subtitle}
      icon={icon}
      badge={badge}
      downloadFilename={filename}
      emptyMessage="No PEM data available."
    />
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
            <Badge variant={node.isCurrent ? 'default' : 'secondary'}>{node.label}</Badge>
            {i < nodes.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
          </React.Fragment>
        ))}
        <Badge variant="secondary" className="ml-auto">{nodes.length} cert{nodes.length !== 1 ? 's' : ''}</Badge>
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
    <div className="pb-6 space-y-4">

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
            badge={chainCount > 0 ? <Badge variant="secondary">{chainCount}</Badge> : undefined}
            pem={fullChainPemData}
            filename={`${base}_chain.pem`}
            itemName={itemName}
          />
        )}
      </div>

    </div>
  );
};
