'use client';

import React from 'react';
import { DmsProvider } from '@/contexts/DmsContext';

// The Package Inventory page lists packs across every device group, so it needs the DMS context
// (availableDms). DmsProvider is self-contained — it fetches the device groups itself.
export default function PackageInventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <DmsProvider>
      <div className="space-y-6">{children}</div>
    </DmsProvider>
  );
}
