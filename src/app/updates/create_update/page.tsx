// src/app/updates/create_update/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Legacy route: pack creation/versioning now lives in the Package Inventory (creation dialogs).
// Kept only so old links and bookmarks keep working.
export default function LegacyCreateUpdateRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/package-inventory');
  }, [router]);

  return null;
}
