
'use client';

import type React from 'react';
import type { CA } from '@/lib/ca-data';
import { CaFilesystemViewItem } from './CaFilesystemViewItem';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

interface CaFilesystemViewProps {
  cas: CA[];
  router: ReturnType<typeof import('next/navigation').useRouter>; 
  allCAs: CA[];
  allCryptoEngines: ApiCryptoEngine[];
}

export const CaFilesystemView: React.FC<CaFilesystemViewProps> = ({ cas, router, allCAs, allCryptoEngines }) => {
  return (
    <ul className="space-y-1">
      {cas.map((ca) => (
        <CaFilesystemViewItem
          key={ca.id}
          ca={ca}
          level={ca.level ?? 0}
          router={router}
          allCAs={allCAs}
          allCryptoEngines={allCryptoEngines}
        />
      ))}
    </ul>
  );
};
