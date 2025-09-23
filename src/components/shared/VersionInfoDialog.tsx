
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DetailItem } from './DetailItem';
import { GitCommit } from 'lucide-react';
import type { VersionInfo } from '@/lib/version';
import { format, parseISO } from 'date-fns';

interface VersionInfoDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  versionInfo: VersionInfo;
}

export const VersionInfoDialog: React.FC<VersionInfoDialogProps> = ({
  isOpen,
  onOpenChange,
  versionInfo,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <GitCommit className="mr-2 h-5 w-5 text-primary" />
            Version Information
          </DialogTitle>
          <DialogDescription>{versionInfo.appName}</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <DetailItem label="Version" value={<Badge variant="secondary">{versionInfo.version}</Badge>} />
          <DetailItem label="Build Number" value={versionInfo.buildNumber} />
          <DetailItem label="Build Time" value={format(parseISO(versionInfo.buildTime), 'PPpp')} />
          <DetailItem label="Git Branch" value={versionInfo.branch} />
          <DetailItem label="Git Commit" value={<span className="font-mono text-xs">{versionInfo.shortCommit}</span>} />
          <DetailItem label="Node Version" value={versionInfo.nodeVersion} />
          <DetailItem label="Dirty Build" value={versionInfo.isDirty ? 'Yes' : 'No'} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
