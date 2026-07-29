'use client';

import { Network } from 'lucide-react';
import { PacketAnalyzer } from '@/components/packet-analyzer/PacketAnalyzer';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

export default function PacketAnalyzerPage() {
  return (
    <BreadcrumbPage
      items={[
        { label: 'Home', href: '/' },
        { label: 'Tools' },
        { label: 'Packet Analyzer' },
      ]}
      className="space-y-6 pb-8"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
          <Network className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-headline font-semibold">
            Packet Analyzer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect packet captures locally with Wireshark display filters,
            protocol trees, and synchronized raw bytes.
          </p>
        </div>
      </div>

      <PacketAnalyzer />
    </BreadcrumbPage>
  );
}
