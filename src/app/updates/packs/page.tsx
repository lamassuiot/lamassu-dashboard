// src/app/updates/packs/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Legacy route: the all-packs list is the Package Inventory now.
// Kept only so old links and bookmarks keep working.
export default function LegacyUpdatePacksRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/package-inventory');
  }, [router]);

  return null;
}
