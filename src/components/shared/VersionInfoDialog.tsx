
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
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { GitCommit, Clock, GitBranch, Package, Shield, Info } from 'lucide-react';
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
      <DialogContent className="sm:max-w-2xl overflow-hidden p-0">
        {/* Header with gradient background */}
        <div className="relative bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground p-6 pb-8">
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
          <div className="relative">
            <DialogHeader className="text-center space-y-3">
              <div className="mx-auto w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
                <Package className="h-8 w-8 text-white" />
              </div>
              <DialogTitle className="text-2xl font-bold text-white">
                {versionInfo.appName}
              </DialogTitle>
              <DialogDescription className="text-primary-foreground/80 text-lg font-medium">
                System Information
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Content area */}
        <div className="p-6 space-y-6">
          {/* Main version card */}
          <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <GitCommit className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Version</h3>
                    <p className="text-sm text-muted-foreground">Current release</p>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Badge variant="default" className="text-base font-mono px-3 py-1">
                    v{versionInfo.version}
                  </Badge>
                  <div className="text-xs text-muted-foreground font-mono">
                    {versionInfo.shortCommit}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Build Information */}
            <Card className="h-fit">
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 pb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h4 className="font-medium">Build Details</h4>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Build Number</span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      #{versionInfo.buildNumber}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge 
                      variant={versionInfo.isDirty ? "destructive" : "default"}
                      className="text-xs"
                    >
                      {versionInfo.isDirty ? (
                        <><span className="w-2 h-2 bg-current rounded-full mr-1" />Dirty</>
                      ) : (
                        <><span className="w-2 h-2 bg-current rounded-full mr-1" />Clean</>
                      )}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Source Information */}
            <Card className="h-fit">
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 pb-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <h4 className="font-medium">Source Control</h4>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Branch</span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {versionInfo.branch}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Commit</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {versionInfo.shortCommit}
                    </code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Build timestamp */}
          <Card className="bg-muted/30">
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-muted-foreground/10 rounded-lg flex items-center justify-center">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Built on</span>
                    <span className="text-sm text-muted-foreground font-mono">
                      {format(parseISO(versionInfo.buildTime), 'PPpp')}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Separator />
        
        <DialogFooter className="p-6 bg-muted/20">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Lamassu PKI Dashboard</span>
            </div>
            <DialogClose asChild>
              <Button variant="secondary">
                Close
              </Button>
            </DialogClose>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
