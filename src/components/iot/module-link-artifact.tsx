'use client';

import React from 'react';
import { ChevronDown, ChevronRight, Link2, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { fetchAllArtifacts, linkArtifactToSoftwareModule } from '@/lib/iot-api';
import type { Artifact } from '@/types/iot';

// Reuse a binary that is already in the global artifact catalog instead of uploading it again.
//
// Linking is per MODULE, never per set: in a composed set every binary belongs to some module, and a
// set-level link cannot say which one it meant. The backend route is addressed by (set, module key),
// so this is only offered for a module that sits in a set — a module in no set has no link route.
//
// What a link does differs by backend: native references the same artifact (same id and checksum,
// shared across sets); hawkBit cannot share artifacts between its software modules, so it copies the
// bytes into this module. To the operator both are "use this file here" with no re-upload.
//
// Collapsed by default so opening the sheet does not read the fleet-wide catalog for nothing.
export function ModuleLinkArtifact({
  groupId,
  packName,
  moduleKey,
  linkedIds,
  disabled,
  onLinked,
}: {
  groupId: string;
  packName: string;
  moduleKey: string;
  /** Artifacts already on this module, shown as linked rather than offered again. */
  linkedIds: string[];
  disabled?: boolean;
  onLinked: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [artifacts, setArtifacts] = React.useState<Artifact[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [linking, setLinking] = React.useState<string | null>(null);
  // Linked during this visit. The module prop does not always refresh under the sheet (a module
  // addressed by key is re-read by the card, not here), so this keeps the row honest meanwhile.
  const [justLinked, setJustLinked] = React.useState<string[]>([]);

  React.useEffect(() => { setJustLinked([]); setOpen(false); setQuery(''); }, [moduleKey]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    const t = setTimeout(() => {
      fetchAllArtifacts({ pageSize: 50, ...(query.trim() ? { name: query.trim() } : {}) })
        .then((r) => { if (!cancelled) setArtifacts(r.list); })
        .catch((e) => { if (!cancelled) { setArtifacts([]); setError(e instanceof Error ? e.message : String(e)); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, query]);

  const linked = new Set([...linkedIds, ...justLinked]);

  const link = async (a: Artifact) => {
    setLinking(a.id);
    try {
      await linkArtifactToSoftwareModule({ groupId, packName, moduleKey, artifactId: a.id });
      setJustLinked((prev) => [...prev, a.id]);
      toast({ title: 'Artifact linked', description: `${a.filename || a.name} is now part of ${moduleKey}.` });
      await onLinked();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not link the artifact', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium hover:text-primary disabled:opacity-50"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Use an existing artifact
      </button>
      {!open ? (
        <p className="pl-6 text-xs text-muted-foreground">Pick a file already uploaded to the platform instead of uploading it again.</p>
      ) : (
        <div className="space-y-2 pl-6">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by artifact name…"
              aria-label="Filter existing artifacts"
              className="h-8 pl-8 text-sm"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {artifacts === null ? (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading artifacts…</p>
          ) : artifacts.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{query.trim() ? `No artifact matches “${query.trim()}”.` : 'No artifacts uploaded yet.'}</p>
          ) : (
            <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {artifacts.map((a) => {
                const isLinked = linked.has(a.id);
                const usedIn = a.packs?.length ?? 0;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-medium">{a.name}</span>
                        {a.version && <span className="ml-2 font-mono text-xs text-muted-foreground">v{a.version}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={a.filename}>
                        {a.filename}
                        {usedIn > 0 && ` · in ${usedIn} distribution set${usedIn === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {isLinked ? (
                      <span className="shrink-0 text-xs text-muted-foreground">On this module</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={disabled || linking !== null}
                        onClick={() => link(a)}
                      >
                        {linking === a.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                        Link
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
