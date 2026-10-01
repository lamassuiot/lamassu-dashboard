
'use client';

import { useEffect } from 'react';
import { useRef } from 'react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageLoader } from '@/components/shared/FullPageLoader';

export default function SigninCallbackPage() {
  const router = useRouter();
  const { userManager } = useAuth();
  const hasProcessedCallback = useRef(false);

  useEffect(() => {
    if (hasProcessedCallback.current) {
      return;
    }

    if (!userManager) {
        console.log("SigninCallback: Waiting for UserManager...");
        return;
    }

    hasProcessedCallback.current = true;

    const processCallback = async () => {
      try {
        console.log("SigninCallback: Processing callback...");
        await userManager.signinRedirectCallback();
        console.log("SigninCallback: Callback processed, redirecting to /.");
        router.push('/');
      } catch (error) {
        console.error('SigninCallback: Error processing signin callback:', error);
        router.push('/'); // Fallback to home/login
      }
    };
    processCallback();
  }, [userManager, router]);

  return (
<FullPageLoader title="Signing In" message="Completing your login…" />  );
}
