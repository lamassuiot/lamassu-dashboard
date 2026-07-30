'use client';

import { Network } from 'lucide-react';
import { PacketAnalyzer } from '@/components/packet-analyzer/PacketAnalyzer';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

export default function PacketAnalyzerPage() {
  return (
    <BreadcrumbPage
      items={[
        { label: 'Home', href: '/' },
        { label: 'CBOM', href: '/cbom' },
        { label: 'Packet Analyzer' },
      ]}
      className="space-y-5"
    >
      <div className="pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
            <Network className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Packet Analyzer
            </h1>
            <p className="text-sm text-muted-foreground">
              Inspect packet captures locally with Wireshark display filters,
              protocol trees, and synchronized raw bytes.
            </p>
          </div>
        </div>
      </div>

      <PacketAnalyzer />
    </BreadcrumbPage>
  );
}
