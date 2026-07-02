
'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check } from 'lucide-react';
import type { VersionInfo } from '@/lib/version';
import { format, parseISO } from 'date-fns';
import { DialogBrandHeader } from '@/components/shared/DialogBrandHeader';

interface VersionInfoDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  versionInfo: VersionInfo;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-muted-foreground hover:text-foreground"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {children}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group flex items-center justify-between py-2.5 px-1 rounded hover:bg-muted/40 transition-colors">
      <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

export const VersionInfoDialog: React.FC<VersionInfoDialogProps> = ({
  isOpen,
  onOpenChange,
  versionInfo,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-hidden p-0 gap-0" showCloseButton={false}>

        <DialogBrandHeader
          title={versionInfo.appName}
          subtitle="System Information"
          action={
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="font-mono text-sm border-header-foreground/20 text-header-foreground bg-header-foreground/5 px-2.5"
              >
                v{versionInfo.version}
              </Badge>
              <Badge
                variant="outline"
                className={
                  versionInfo.isDirty
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs'
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${versionInfo.isDirty ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                {versionInfo.isDirty ? 'Dirty' : 'Clean'}
              </Badge>
            </div>
          }
        />

        {/* Body */}
        <div className="px-5 pb-4 pt-1">
          <SectionLabel>Release</SectionLabel>

          <PropertyRow label="Version">
            <span className="font-mono text-sm text-foreground">{versionInfo.version}</span>
            <CopyButton value={versionInfo.version} />
          </PropertyRow>

          <PropertyRow label="Build Number">
            <span className="font-mono text-sm text-foreground">#{versionInfo.buildNumber}</span>
            <CopyButton value={versionInfo.buildNumber} />
          </PropertyRow>

          <PropertyRow label="Build Time">
            <span className="font-mono text-sm text-foreground">
              {(() => { try { return format(parseISO(versionInfo.buildTime), 'yyyy-MM-dd HH:mm:ss'); } catch { return versionInfo.buildTime; } })()} UTC
            </span>
          </PropertyRow>

          <SectionLabel>Source Control</SectionLabel>

          <PropertyRow label="Branch">
            <span className="font-mono text-sm text-foreground">{versionInfo.branch}</span>
            <CopyButton value={versionInfo.branch} />
          </PropertyRow>

          <PropertyRow label="Short SHA">
            <code className="font-mono text-sm text-foreground bg-muted px-1.5 py-0.5 rounded">
              {versionInfo.shortCommit}
            </code>
            <CopyButton value={versionInfo.shortCommit} />
          </PropertyRow>

          <PropertyRow label="Full SHA">
            <code className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">
              {versionInfo.commit}
            </code>
            <CopyButton value={versionInfo.commit} />
          </PropertyRow>
        </div>

        {/* Footer */}
        <div className="border-t bg-muted/20 px-5 py-3.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground/60 font-mono">
            lamassu-pki · {versionInfo.shortCommit}
          </span>
          <DialogClose asChild>
            <Button variant="secondary">
              Close
            </Button>
          </DialogClose>
        </div>

      </DialogContent>
    </Dialog>
  );
};
