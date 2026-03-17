
'use client';

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function SignoutCallbackPage() {
  const navigate = useNavigate();
  const { userManager } = useAuth();

  useEffect(() => {
    if (!userManager) {
      console.log("SignoutCallback: Waiting for UserManager. Redirecting home.");
      navigate('/');
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
        navigate('/');
      }
    };
    processSignout();
  }, [userManager, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <p className="text-lg">Processing logout, please wait...</p>
    </div>
  );
}
