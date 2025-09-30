
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function UpdatesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the default "Manage Packs" page.
    router.replace('/updates/create_update');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <p className="text-lg text-muted-foreground">Redirecting...</p>
    </div>
  );
}
