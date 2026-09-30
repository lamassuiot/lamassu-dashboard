
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageLoader } from '@/components/shared/FullPageLoader';

export default function SignoutCallbackPage() {
  const router = useRouter();
  const { userManager } = useAuth();

  useEffect(() => {
    if (!userManager) {
      console.log("SignoutCallback: Waiting for UserManager. Redirecting home.");
      router.push('/');
      return;
    }

    const processSignout = async () => {
      try {
        console.log("SignoutCallback: Processing signout callback...");
        await userManager.signoutRedirectCallback();
        console.log("SignoutCallback: Signout callback processed.");
      } catch (error) {
        console.error('SignoutCallback: Error processing signout callback:', error);
      } finally {
        console.log("SignoutCallback: Redirecting to /.");
        router.push('/');
      }
    };
    processSignout();
  }, [userManager, router]);

  return (
<FullPageLoader title="Signing Out" message="Ending your session…" />  );
}
