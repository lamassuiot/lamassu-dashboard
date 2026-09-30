'use client';

import Image from 'next/image';
import { LogOut, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import LogoFullBlue from '@/app/lamassu_full_blue.svg';
import LogoFullWhite from '@/app/lamassu_full_white.svg';
import { Button } from '@/components/ui/button';

interface AccessDeniedScreenProps {
  /** `unauthorized`: the backend rejected the user. `error`: access could not be verified. */
  reason: 'unauthorized' | 'error';
  userLabel?: string;
  onLogout: () => void;
  onRetry?: () => void;
}

const COPY = {
  unauthorized: {
    icon: ShieldAlert,
    title: 'Access not authorized',
    message: 'Your account has not been authorized to access the platform. Please contact your administrator.',
  },
  error: {
    icon: WifiOff,
    title: 'Unable to verify access',
    message: 'We could not reach the authorization service to check your permissions. Try again or contact your administrator if the problem persists.',
  },
} as const;

/** Full-screen block shown before the app when the signed-in user cannot use the platform. */
export function AccessDeniedScreen({ reason, userLabel, onLogout, onRetry }: AccessDeniedScreenProps) {
  const { icon: Icon, title, message } = COPY[reason];

  return (
    <div
      role="alert"
      className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-6 text-center text-foreground"
    >
      <div className="flex w-full max-w-md flex-col items-center">
        <Image src={LogoFullBlue} width={220} height={40} alt="LamassuIoT" priority className="h-10 w-[220px] dark:hidden" />
        <Image src={LogoFullWhite} width={220} height={40} alt="LamassuIoT" priority className="hidden h-10 w-[220px] dark:block" />
        <div className="mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <Icon className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="mt-6 text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {userLabel && (
          <p className="mt-4 text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{userLabel}</span>
          </p>
        )}
        <div className="mt-8 flex gap-3">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          )}
          <Button onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
