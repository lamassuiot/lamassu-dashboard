'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Package, PackagePlus, Search, Loader2, RefreshCw, AlertTriangle, ChevronRight, ChevronDown, Plus, ArrowRight, Minus, ExternalLink, Rocket, Boxes, GitFork, Trash2, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { toast } from '@/hooks/use-toast';
import { fetchAllUpdatePacks, fetchUpdatePackVersionsById, deleteUpdatePackByIdApi } from '@/lib/iot-api';
import type { UpdatePack, UpdatePackVersion, ArtifactRef } from '@/types/iot';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { compareSemver } from '@/lib/utils';
import { CreatePackForm } from '@/components/iot/create-pack-form';
import { NewPackVersionDialog, type PackForVersioning } from '@/components/iot/new-pack-version-dialog';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

type PackRow = UpdatePack & { groupId: string; groupName: string; orphaned: boolean };

// Sentinel filter value for packs whose device group no longer exists.
const ORPHANED_FILTER = '__orphaned__';

const PackagingBadge: React.FC<{ packaging?: string }> = ({ packaging }) => {
  const isNonSwu = packaging === 'non-swu';
  return (
    <Badge variant="outline" className={cn('text-xs',
      isNonSwu
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-700/30 dark:text-purple-300 border-purple-300 dark:border-purple-700'
        : 'bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-300 border-sky-300 dark:border-sky-700')}>
      {packaging || 'swu'}
    </Badge>
  );
};

// The pack's device group as a visible tag — packs are group-scoped, so this matters everywhere.
// An orphaned pack (its device group was deleted or its group ID changed after a re-run) is shown
// with a warning tag carrying the raw, now-dangling group ID.
const GroupTag: React.FC<{ groupName: string; orphaned?: boolean }> = ({ groupName, orphaned }) =>
  orphaned ? (
    <Badge
      variant="outline"
      title="This pack's device group no longer exists (deleted, or its ID changed after a re-run). The pack data is preserved here."
      className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300 border-amber-300 dark:border-amber-700 gap-1"
    >
      <AlertTriangle className="h-3 w-3" />
      <span className="font-mono">{groupName}</span>
      <span>(orphaned)</span>
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs bg-muted/60 text-foreground/80 border-border gap-1">
      <Boxes className="h-3 w-3" />
      {groupName}
    </Badge>
  );

// Artifact changes of a version relative to the previous (older) version's manifest.
function diffArtifacts(curr: ArtifactRef[], prev: ArtifactRef[]) {
  const prevMap = new Map(prev.map((a) => [a.name, a.version]));
  const currMap = new Map(curr.map((a) => [a.name, a.version]));
  const added = curr.filter((a) => !prevMap.has(a.name));
  const changed = curr
    .filter((a) => prevMap.has(a.name) && prevMap.get(a.name) !== a.version)
    .map((a) => ({ name: a.name, from: prevMap.get(a.name) || '', to: a.version }));
  const removed = prev.filter((a) => !currMap.has(a.name));
  return { added, changed, removed };
}

// One expandable update pack: lazily loads its version snapshots and shows artifact changes
// between consecutive versions.
const PackInventoryRow: React.FC<{
  pack: PackRow;
  onNewVersion: (pack: PackRow) => void;
  onDelete: (pack: PackRow) => void;
}> = ({ pack, onNewVersion, onDelete }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Address versions by pack ID (not group+name) so history loads even for orphaned/empty-group packs.
  const { data: versionsResp, isLoading, error } = useQuery<{ list: UpdatePackVersion[]; next: string | null }, Error>({
    queryKey: ['packInventoryVersions', pack.id],
    queryFn: () => fetchUpdatePackVersionsById({ packId: pack.id, accessToken: user!.access_token! }),
    enabled: open && !!user?.access_token,
  });

  // Newest version first.
  const versions = (versionsResp?.list || []).slice().sort((a, b) => compareSemver(b.version, a.version));

  const detailsHref = `/updates/pack-details?groupId=${encodeURIComponent(pack.groupId)}&packName=${encodeURIComponent(pack.name)}`;
  const campaignHref = `/updates?action=campaign&groupId=${encodeURIComponent(pack.groupId)}&packId=${encodeURIComponent(pack.id)}`;
  // An orphaned pack's device group is gone, so it has no devices to start a campaign for.
  const canStartCampaign = !!pack.uri && !pack.orphaned;
  const campaignTitle = pack.orphaned
    ? "This pack's device group no longer exists — nothing to start a campaign for"
    : pack.uri ? undefined : 'Build the package before starting a campaign';
  // The pack-details page is addressed by group+name; with an empty group ID its URL collapses to
  // /groups//... and 404s. Packs with a non-empty (even if deleted) group still resolve, so gate
  // only on an empty group ID. Version history is available inline below regardless.
  const detailsBroken = !pack.groupId;
  const detailsTitle = detailsBroken
    ? 'This pack has no device group — the details page is unavailable. Expand the row to see its versions, or delete it to clean up.'
    : undefined;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex w-full items-center gap-2 px-4 py-3 hover:bg-muted/40">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <Package className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-semibold truncate">{pack.name}</span>
          <Badge variant="secondary" className="font-mono text-xs">v{pack.version}</Badge>
          <GroupTag groupName={pack.groupName} orphaned={pack.orphaned} />
          <PackagingBadge packaging={pack.packaging} />
          <Badge variant="outline" className="text-xs">{pack.type}</Badge>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          {pack.uri
            ? <Badge variant="outline" className="text-xs bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700">{pack.packaging === 'non-swu' ? 'package built' : 'SWU built'}</Badge>
            : <Badge variant="outline" className="text-xs">not built</Badge>}
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild={!detailsBroken} disabled={detailsBroken} title={detailsTitle}>
            {detailsBroken ? (
              <span className="flex items-center"><ExternalLink className="mr-1 h-3 w-3" />Details</span>
            ) : (
              <Link href={detailsHref}>
                <ExternalLink className="mr-1 h-3 w-3" />
                Details
              </Link>
            )}
          </Button>
          <Button size="sm" className="h-7 text-xs" disabled={!canStartCampaign} asChild={canStartCampaign} title={campaignTitle}>
            {canStartCampaign ? (
              <Link href={campaignHref}>
                <Rocket className="mr-1 h-3 w-3" />
                Campaign
              </Link>
            ) : (
              <span className="flex items-center"><Rocket className="mr-1 h-3 w-3" />Campaign</span>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onNewVersion(pack)} disabled={detailsBroken} title={detailsTitle}>
                <GitFork className="mr-2 h-4 w-4" />
                New Version
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(pack)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Pack
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            {!detailsBroken && (
              <Button variant="outline" size="sm" asChild>
                <Link href={detailsHref}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  View Pack Details
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onNewVersion(pack)} disabled={detailsBroken} title={detailsTitle}>
              <GitFork className="mr-1.5 h-3.5 w-3.5" />
              New Version
            </Button>
            {canStartCampaign && (
              <Button variant="outline" size="sm" asChild>
                <Link href={campaignHref}>
                  <Rocket className="mr-1.5 h-3.5 w-3.5" />
                  Campaign
                </Link>
              </Button>
            )}
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading version history…</div>
          ) : error ? (
            <p className="text-sm text-destructive">{error.message}</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No built versions yet — no artifact history to show.</p>
          ) : (
            <ol className="space-y-3">
              {versions.map((v, i) => {
                const prev = versions[i + 1]; // the next-older version
                const currArts = v.artifacts || [];
                const { added, changed, removed } = prev ? diffArtifacts(currArts, prev.artifacts || []) : { added: currArts, changed: [], removed: [] };
                const hasChanges = added.length > 0 || changed.length > 0 || removed.length > 0;
                const isInitial = !prev;
                return (
                  <li key={v.id || v.version} className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">v{v.version}</Badge>
                      {isInitial && <span className="text-xs text-muted-foreground">(initial)</span>}
                      {v.created_at && <span className="ml-auto text-xs text-muted-foreground"><DateDisplay date={v.created_at} /></span>}
                    </div>
                    <div className="mt-2 space-y-1">
                      {currArts.length === 0 && (added.length + changed.length + removed.length) === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No artifacts declared for this version.</p>
                      ) : !hasChanges ? (
                        <p className="text-xs text-muted-foreground italic">No artifact changes from the previous version.</p>
                      ) : (
                        <>
                          {added.map((a) => (
                            <div key={`a-${a.name}`} className="flex items-center gap-2 text-xs">
                              <Plus className="h-3 w-3 text-green-600 dark:text-green-400" />
                              <span className="font-medium">{a.name}</span>
                              <span className="font-mono text-muted-foreground">{a.version || 'unversioned'}</span>
                              <span className="text-muted-foreground">{isInitial ? '' : '(added)'}</span>
                            </div>
                          ))}
                          {changed.map((a) => (
                            <div key={`c-${a.name}`} className="flex items-center gap-2 text-xs">
                              <ArrowRight className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                              <span className="font-medium">{a.name}</span>
                              <span className="font-mono text-muted-foreground">{a.from || 'unversioned'} → {a.to || 'unversioned'}</span>
                            </div>
                          ))}
                          {removed.map((a) => (
                            <div key={`r-${a.name}`} className="flex items-center gap-2 text-xs">
                              <Minus className="h-3 w-3 text-red-600 dark:text-red-400" />
                              <span className="font-medium line-through text-muted-foreground">{a.name}</span>
                              <span className="text-muted-foreground">(removed)</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
};

export default function PackageInventoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { availableDms } = useDms();
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [packToVersion, setPackToVersion] = useState<PackForVersioning | null>(null);
  const [packToDelete, setPackToDelete] = useState<PackRow | null>(null);

  // One fleet-wide call returns every pack regardless of group, so packs whose device group was
  // deleted (or whose group ID changed after a lamassuiot re-run) still surface here.
  const { data: rawPacks = [], isLoading, error, refetch, isFetching } = useQuery<UpdatePack[], Error>({
    queryKey: ['packInventoryAllPacks'],
    queryFn: async ({ signal }) => {
      if (!user?.access_token) return [];
      const resp = await fetchAllUpdatePacks({ accessToken: user.access_token }, { pageSize: 500 }, { signal });
      return resp.list;
    },
    enabled: !!user?.access_token,
  });

  // Resolve each pack's group name from availableDms; a pack whose group is no longer present is
  // flagged orphaned. Done in a memo (not the query) so flags recompute when the DMS list arrives,
  // regardless of which request finishes first.
  const packs = useMemo<PackRow[]>(() => {
    const dmsById = new Map(availableDms.map((d) => [d.id, d.name]));
    return rawPacks.map((p) => {
      const groupId = p.group_id ?? '';
      const groupName = dmsById.get(groupId);
      return { ...p, groupId, groupName: groupName ?? (groupId || 'unknown'), orphaned: !groupName };
    });
  }, [rawPacks, availableDms]);

  const orphanedCount = useMemo(() => packs.filter((p) => p.orphaned).length, [packs]);

  const deleteMutation = useMutation({
    mutationFn: (pack: PackRow) =>
      deleteUpdatePackByIdApi({ packId: pack.id, accessToken: user!.access_token! }),
    onSuccess: (data, pack) => {
      toast({ title: 'Update Pack Deleted', description: `Pack "${pack.name}" has been deleted. ${data?.message || ''}` });
      queryClient.invalidateQueries({ queryKey: ['packInventoryAllPacks'] });
    },
    onError: (err: Error, pack) => {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: `Could not delete pack "${pack.name}". ${err.message}` });
    },
    onSettled: () => setPackToDelete(null),
  });

  const filtered = useMemo(() => packs
    .filter((p) => groupFilter === 'all' || (groupFilter === ORPHANED_FILTER ? p.orphaned : p.groupId === groupFilter))
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.groupName.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())), [packs, groupFilter, search]);

  const goToPackDetails = (groupId: string, packName: string) => {
    router.push(`/updates/pack-details?groupId=${encodeURIComponent(groupId)}&packName=${encodeURIComponent(packName)}`);
  };

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Distribution Set' }]} className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Distribution Set</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every update pack across your device groups — create packs, manage versions, and start campaigns from here.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={() => refetch()} variant="outline" disabled={isFetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90">
            <PackagePlus className="mr-2 h-4 w-4" /> New Update Pack
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-[230px]">
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger>
              <span className="flex items-center gap-2 truncate">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="All Device Groups" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Device Groups</SelectItem>
              {orphanedCount > 0 && (
                <SelectItem value={ORPHANED_FILTER}>Orphaned ({orphanedCount})</SelectItem>
              )}
              {availableDms.map((dms) => (
                <SelectItem key={dms.id} value={dms.id}>{dms.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by pack or group…" className="pl-9" />
        </div>
        {!isLoading && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} of {packs.length} pack{packs.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error.message}
            <Button variant="link" onClick={() => refetch()} className="p-0 h-auto ml-2">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {orphanedCount > 0 && (
        <Alert className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle>{orphanedCount} orphaned pack{orphanedCount === 1 ? '' : 's'}</AlertTitle>
          <AlertDescription>
            {orphanedCount === 1 ? 'This pack references' : 'These packs reference'} a device group that no longer exists
            (deleted, or its ID changed after a lamassuiot re-run). The pack data is preserved — you can still view details
            or delete {orphanedCount === 1 ? 'it' : 'them'}, but {orphanedCount === 1 ? 'it' : 'they'} can't be launched
            until the group is restored.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading update packs…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg bg-muted/20">
          <Package className="h-14 w-14 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground">No update packs</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md">
            {search || groupFilter !== 'all' ? 'No packs match your filters.' : 'Create an update pack to get started.'}
          </p>
          {!search && groupFilter === 'all' && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <PackagePlus className="mr-2 h-4 w-4" /> New Update Pack
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <PackInventoryRow
              key={`${p.groupId}-${p.id}`}
              pack={p}
              onNewVersion={(pack) => setPackToVersion({ id: pack.id, name: pack.name, version: pack.version, groupId: pack.groupId, groupName: pack.groupName })}
              onDelete={(pack) => setPackToDelete(pack)}
            />
          ))}
        </div>
      )}

      {/* Create a brand-new update pack without leaving the inventory. */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-primary" />
              New Update Pack
            </DialogTitle>
            <DialogDescription>
              Create the pack as a repository. You'll upload artifacts (and build the SWU, if applicable)
              on the pack's page afterwards.
            </DialogDescription>
          </DialogHeader>
          <CreatePackForm
            showGroupSelector
            defaultGroupId={groupFilter !== 'all' ? groupFilter : undefined}
            onCreated={(gid, packName) => {
              setIsCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ['packInventoryAllPacks'] });
              goToPackDetails(gid, packName);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Bump an existing pack to a new version. */}
      <NewPackVersionDialog
        pack={packToVersion}
        onOpenChange={(open) => { if (!open) setPackToVersion(null); }}
        onCreated={(gid, packName) => {
          queryClient.invalidateQueries({ queryKey: ['packInventoryAllPacks'] });
          queryClient.invalidateQueries({ queryKey: ['packInventoryVersions'] });
          goToPackDetails(gid, packName);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!packToDelete} onOpenChange={(open) => { if (!open) setPackToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Update Pack</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{packToDelete?.name}" (v{packToDelete?.version}) from{' '}
              {packToDelete?.groupName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => packToDelete && deleteMutation.mutate(packToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
