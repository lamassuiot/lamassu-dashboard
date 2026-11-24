'use client';

import React from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RevokeButtonProps {
  onClick: () => void;
  isRevoking?: boolean;
}

/** Outlined destructive action shown in the hero of CA and certificate details; fills in on hover. */
export const RevokeButton: React.FC<RevokeButtonProps> = ({ onClick, isRevoking = false }) => (
  <Button
    variant="outline"
    className="gap-2 border-destructive/40 bg-transparent text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground dark:border-destructive/50 dark:bg-transparent dark:hover:bg-destructive"
    onClick={onClick}
    disabled={isRevoking}
  >
    {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
    {isRevoking ? 'Revoking…' : 'Revoke'}
  </Button>
);
