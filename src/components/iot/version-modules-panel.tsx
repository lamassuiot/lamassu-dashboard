'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Package } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fetchSoftwareModulesVersion, downloadModuleArtifactVersion } from '@/lib/iot-api';
import type { SoftwareModule } from '@/types/iot';

// The version-history counterpart to SoftwareModulesCard: download each software module INSIDE a
// specific past version, not only the pack's current one.
//
// Before this, the only version-scoped download was the pack's whole .swu (which now refuses
// outright for a composed hawkbit pack — see downloadSoleArtifact — because there is no single
// artifact to hand back once a set has more than one module), and there was nothing at all for a
// PAST version's individual modules; the Software Modules tab only ever shows the current one.
//
// Fetched lazily, on expand: a version row that is never opened costs nothing, matching how the
// current-version composition is already fetched lazily in SoftwareModulesCard rather than up front
// with the version list.
export function VersionModulesPanel({
  groupId,
  packName,
  version,
  perModuleDeliverables,
}: {
  groupId: string;
  packName: string;
  version: string;
  /** Whether a module has its own deliverable at all — where it does not (native), the pack's
   *  whole-version .swu (already offered elsewhere in this row) is the real download; there is
   *  nothing extra to add here beyond composition detail, so no download control is rendered. */
  perModuleDeliverables: boolean;
}) {
  const [modules, setModules] = React.useState<SoftwareModule[] | undefined>(undefined);
  const [error, setError] = React.useState<Error | null>(null);
  const [downloadingKey, setDownloadingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setModules(undefined);
    setError(null);
    fetchSoftwareModulesVersion({ groupId, packName, version })
      .then((result) => {
        if (!cancelled) setModules(result);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, packName, version]);

  const handleDownload = async (mod: SoftwareModule) => {
    setDownloadingKey(mod.key);
    try {
      const blob = await downloadModuleArtifactVersion({ groupId, packName, version, moduleKey: mod.key });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mod.name}-${version}.swu`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not download the software module', description: err?.message ?? String(err) });
    } finally {
      setDownloadingKey(null);
    }
  };

  if (error) {
    return <p className="mt-2 text-sm text-destructive">{error.message}</p>;
  }
  if (modules === undefined) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading software modules…
      </p>
    );
  }
  if (modules.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">This version has no software modules recorded.</p>;
  }

  return (
    <div className="mt-2 space-y-1.5">
      {modules.map((m) => (
        <div key={m.key} className="flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-1.5">
            <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{m.name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">v{m.version}</span>
          </div>
          {perModuleDeliverables ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0"
              disabled={!m.built || downloadingKey !== null}
              title={!m.built ? 'This module has no deliverable in this version' : undefined}
              onClick={() => handleDownload(m)}
              aria-label={`Download ${m.key} v${version}`}
            >
              {downloadingKey === m.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
