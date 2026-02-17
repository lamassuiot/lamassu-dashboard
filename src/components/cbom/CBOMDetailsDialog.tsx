'use client';

import React from 'react';
import { CBOMItem } from '@/lib/cbom-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface CBOMDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cbom: CBOMItem;
}

export const CBOMDetailsDialog: React.FC<CBOMDetailsDialogProps> = ({
  open,
  onOpenChange,
  cbom,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            CBOM Details
            <Badge variant="outline">{cbom.projectIdentifier}</Badge>
          </DialogTitle>
          <DialogDescription>
            Cryptographic Bill of Materials details and contents
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Project Identifier
              </p>
              <p className="text-sm font-mono">{cbom.projectIdentifier}</p>
            </div>
            
            {cbom.timestamp && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Timestamp
                </p>
                <p className="text-sm">
                  {new Date(cbom.timestamp).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">CBOM Data</p>
            <ScrollArea className="h-96 w-full rounded-md border">
              <pre className="p-4 text-xs">
                {JSON.stringify(cbom.data || cbom, null, 2)}
              </pre>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
