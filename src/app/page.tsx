

'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { navigationConfig } from '@/app/layout';
import { accentStyles } from '@/lib/page-search-accents';
import LogoFullBlue from './lamassu_full_blue.svg';

const APP_MENU_LABELS = ['KMS', 'PKI', 'IoT', 'AUTHZ & SECURITY', 'TOOLS'];

const APP_GROUPS = navigationConfig.filter(group => group.label && APP_MENU_LABELS.includes(group.label));

export default function AppMenuPage() {
  return (
    <div className="flex min-h-[calc(100vh-var(--height-header)-2rem)] w-full items-center justify-center">
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center space-y-8">
      <Image
        src={LogoFullBlue}
        height={60}
        width={280}
        alt="LamassuIoT Logo"
      />

      <div className="w-full p-1">
        {APP_GROUPS.map(group => {
          const styles = accentStyles[group.accent || 'general'];

          return (
            <div key={group.label} className="overflow-hidden p-1 text-foreground">
              <div className="flex h-7 items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styles.marker)} />
                <span>{group.label}</span>
              </div>
              <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors',
                      styles.row,
                    )}
                  >
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
                      styles.icon,
                    )}>
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium leading-none text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {item.description || item.href}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}
