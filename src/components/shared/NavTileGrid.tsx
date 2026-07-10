
'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface NavTile {
  href: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

interface NavTileGridProps {
  tiles: NavTile[];
}

export const NavTileGrid: React.FC<NavTileGridProps> = ({ tiles }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {tiles.map(tile => (
      <Link
        key={tile.href}
        href={tile.href}
        className="flex h-full items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
          <tile.icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-foreground">{tile.label}</span>
          {tile.description && (
            <span className="block text-xs text-muted-foreground">{tile.description}</span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    ))}
  </div>
);
