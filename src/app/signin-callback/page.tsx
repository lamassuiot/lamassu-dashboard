
'use client';

import { useEffect } from 'react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function SigninCallbackPage() {
  const navigate = useNavigate();
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
        navigate('/');
      } catch (error) {
        console.error('SigninCallback: Error processing signin callback:', error);
        navigate('/'); // Fallback to home/login
      }
    };
    processCallback();
  }, [userManager, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <p className="text-lg">Processing login, please wait...</p>
    </div>
  );
}
