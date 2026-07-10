

'use client';

import React from 'react';
import { NavTileGrid } from '@/components/shared/NavTileGrid';
import { navigationConfig } from '@/app/layout';

const AUTHZ_GROUP = navigationConfig.find(group => group.label === 'AUTHZ & SECURITY');
const TILES = (AUTHZ_GROUP?.items ?? []).filter(item => item.href !== '/authz');

export default function AuthzDashboardPage() {
  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Authorization & Security</h1>
        <p className="text-muted-foreground mt-1">Manage principals, policies, and test access decisions.</p>
      </div>
      <NavTileGrid tiles={TILES} />
    </div>
  );
}
