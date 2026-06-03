
'use client';

import React from 'react';
import { DmsProvider } from '@/contexts/DmsContext';

function UpdatesLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            {children}
        </div>
    );
}


export default function UpdatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <DmsProvider>
        <UpdatesLayoutContent>{children}</UpdatesLayoutContent>
    </DmsProvider>
  );
}

