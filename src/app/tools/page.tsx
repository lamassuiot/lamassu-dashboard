

'use client';

import React from 'react';
import { NavTileGrid } from '@/components/shared/NavTileGrid';
import { navigationConfig } from '@/app/layout';

const TOOLS_GROUP = navigationConfig.find(group => group.label === 'TOOLS');
const TILES = (TOOLS_GROUP?.items ?? []).filter(item => item.href !== '/tools');

export default function ToolsDashboardPage() {
  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tools</h1>
        <p className="text-muted-foreground mt-1">Utilities for inspecting certificates and exploring the API.</p>
      </div>
      <NavTileGrid tiles={TILES} />
    </div>
  );
}
