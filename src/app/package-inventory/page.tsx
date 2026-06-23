'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown10,
  ArrowDownAZ,
  ArrowRight,
  ArrowUp01,
  ArrowUpZA,
  Boxes,
  ChevronsUpDown,
  ExternalLink,
  GitFork,
  Loader2,
  Minus,
  MoreVertical,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Trash2,
  Users,
} from 'lucide-react';

import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout';
import { NewPackVersionDialog, type PackForVersioning } from '@/components/iot/new-pack-version-dialog';
import { CreatePackForm } from '@/components/iot/create-pack-form';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnSelector } from '@/components/ui/column-selector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import {
  deleteUpdatePackByIdApi,
  fetchAllDevicePackVersions,
  fetchAllUpdatePacks,
  fetchUpdatePackVersionsById,
} from '@/lib/iot-api';
import { cn, compareSemver } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { ArtifactRef, UpdatePack, UpdatePackVersion } from '@/types/iot';

type PackRow = UpdatePack & { groupId: string; groupName: string; orphaned: boolean };
type SortDirection = 'asc' | 'desc';
type SortablePackColumn = 'name' | 'group' | 'version' | 'type' | 'packaging' | 'status';

interface PackSortConfig {
  column: SortablePackColumn;
  direction: SortDirection;
}

type PackColumnId = 'name' | 'group' | 'version' | 'packaging' | 'type' | 'status' | 'security';

type ColumnVisibility = Record<PackColumnId, boolean>;

const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  name: true,
  group: true,
  version: true,
  packaging: true,
  type: true,
  status: true,
  security: true,
};

// Sentinel filter value for packs whose device group no longer exists.
const ORPHANED_FILTER = '__orphaned__';

const sortableText = (value?: string) => (value || '').toLowerCase();

const PackagingBadge: React.FC<{ packaging?: string }> = ({ packaging }) => (
  <Badge variant="outline" className="font-mono text-xs">
    {packaging || 'swu'}
  </Badge>
);

const PackStatusBadge: React.FC<{ pack: PackRow }> = ({ pack }) => {
  if (pack.uri) {
    return (
      <Badge variant="secondary" className="text-xs">
        {pack.packaging === 'non-swu' ? 'built' : 'SWU built'}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      not built
    </Badge>
  );
};

const GroupBadge: React.FC<{ pack: PackRow }> = ({ pack }) => (
  <Badge
    variant={pack.orphaned ? 'destructive' : 'outline'}
    title={pack.orphaned ? "This pack's device group no longer exists." : undefined}
    className="max-w-[220px] justify-start gap-1 text-xs"
  >
    {pack.orphaned ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Boxes className="h-3 w-3 shrink-0" />}
    <span className="truncate">{pack.groupName}</span>
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

function getDetailsHref(pack: PackRow) {
  return `/updates/pack-details?groupId=${encodeURIComponent(pack.groupId)}&packName=${encodeURIComponent(pack.name)}`;
}

function getCampaignHref(pack: PackRow) {
  return `/updates?action=campaign&groupId=${encodeURIComponent(pack.groupId)}&packId=${encodeURIComponent(pack.id)}`;
}

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="py-3 first:pt-0">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="mt-1.5 text-sm font-medium">{children}</div>
  </div>
);

const VersionDelta: React.FC<{
  version: UpdatePackVersion;
  previous?: UpdatePackVersion;
}> = ({ version, previous }) => {
  const currArts = version.artifacts || [];
  const { added, changed, removed } = previous
    ? diffArtifacts(currArts, previous.artifacts || [])
    : { added: currArts, changed: [], removed: [] };
  const hasChanges = added.length > 0 || changed.length > 0 || removed.length > 0;

  if (currArts.length === 0) {
    return <p className="text-xs text-muted-foreground">No artifacts declared for this version.</p>;
  }

  if (!hasChanges) {
    return <p className="text-xs text-muted-foreground">No changes from previous version.</p>;
  }

  return (
    <div className="space-y-1">
      {added.map((artifact) => (
        <div key={`added-${artifact.name}`} className="flex min-w-0 items-center gap-2 text-xs">
          <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{artifact.name}</span>
          <span className="font-mono text-muted-foreground">{artifact.version || 'unversioned'}</span>
          {!previous && <span className="text-muted-foreground">initial</span>}
        </div>
      ))}
      {changed.map((artifact) => (
        <div key={`changed-${artifact.name}`} className="flex min-w-0 items-center gap-2 text-xs">
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{artifact.name}</span>
          <span className="font-mono text-muted-foreground">
            {artifact.from || 'unversioned'} → {artifact.to || 'unversioned'}
          </span>
        </div>
      ))}
      {removed.map((artifact) => (
        <div key={`removed-${artifact.name}`} className="flex min-w-0 items-center gap-2 text-xs">
          <Minus className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground line-through">{artifact.name}</span>
        </div>
      ))}
    </div>
  );
};

const PackDetailPanel: React.FC<{ pack: PackRow }> = ({ pack }) => {
  const { user } = useAuth();
  const [expandedVersion, setExpandedVersion] = useState<string | null>(pack.version);

  const [versionsResp, setVersionsResp] = useState<{ list: UpdatePackVersion[]; next: string | null } | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [devicePackData, setDevicePackData] = useState<{ list: { version: string }[] } | undefined>(undefined);

  const fetchVersions = useCallback(async () => {
    if (!user?.access_token) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchUpdatePackVersionsById({ packId: pack.id });
      setVersionsResp(result);
    } catch (err) {
      setError(err as Error);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [pack.id, user?.access_token]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  const fetchDevicePacks = useCallback(async () => {
    if (!user?.access_token) return;
    try {
      const result = await fetchAllDevicePackVersions({ packName: pack.name, pageSize: 500 });
      setDevicePackData(result);
    } catch (err) {
      console.error(err);
    }
  }, [pack.name, user?.access_token]);

  useEffect(() => { fetchDevicePacks(); }, [fetchDevicePacks]);

  const deviceCountsByVersion = useMemo(() => {
    const counts = new Map<string, number>();
    (devicePackData?.list || []).forEach((dpv: { version: string }) => {
      counts.set(dpv.version, (counts.get(dpv.version) || 0) + 1);
    });
    return counts;
  }, [devicePackData]);

  const versions = useMemo(
    () => (versionsResp?.list || []).slice().sort((a, b) => compareSemver(b.version, a.version)),
    [versionsResp?.list],
  );

  return (
    <div className="grid grid-cols-1 gap-x-8 px-6 py-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
      <div className="divide-y">
        <DetailRow label="Name">{pack.name}</DetailRow>
        <DetailRow label="Current Version">
          <span className="font-mono">v{pack.version}</span>
        </DetailRow>
        <DetailRow label="Device Group">
          <GroupBadge pack={pack} />
        </DetailRow>
        <DetailRow label="Packaging">
          <div className="flex flex-wrap gap-1.5">
            <PackagingBadge packaging={pack.packaging} />
            <Badge variant="outline" className="font-mono text-xs">{pack.type}</Badge>
            <PackStatusBadge pack={pack} />
          </div>
        </DetailRow>
        <DetailRow label="Security">
          <div className="flex flex-wrap gap-1.5">
            {pack.signature_key_id && <Badge variant="outline" className="text-xs">signed</Badge>}
            {pack.encryption_mode && <Badge variant="outline" className="text-xs">{pack.encryption_mode}</Badge>}
            {pack.allow_previous_version_download && <Badge variant="outline" className="text-xs">previous downloads</Badge>}
            {!pack.signature_key_id && !pack.encryption_mode && !pack.allow_previous_version_download && (
              <span className="text-muted-foreground">None configured</span>
            )}
          </div>
        </DetailRow>
        {pack.createdAt && (
          <DetailRow label="Created">
            <DateDisplay date={pack.createdAt} showRelative />
          </DetailRow>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Version History</h2>
          {versions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {versions.length} version{versions.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading versions…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No built versions yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {versions.map((version, index) => {
              const previous = versions[index + 1];
              const isCurrent = version.version === pack.version;
              const isExpanded = expandedVersion === version.version;
              const artifactCount = version.artifacts?.length || 0;
              const deviceCount = deviceCountsByVersion.get(version.version);

              return (
                <div key={version.id || version.version}>
                  <button
                    type="button"
                    onClick={() => setExpandedVersion(isExpanded ? null : version.version)}
                    className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <span className="font-mono text-sm font-medium">v{version.version}</span>
                    {isCurrent && <Badge variant="secondary" className="text-xs">current</Badge>}
                    {version.created_at && (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        <DateDisplay date={version.created_at} />
                      </span>
                    )}
                    {deviceCount != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {deviceCount}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {artifactCount} artifact{artifactCount === 1 ? '' : 's'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t bg-muted/20 px-3 py-2">
                      <VersionDelta version={version} previous={previous} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const SortableHeader: React.FC<{
  column: SortablePackColumn;
  title: string;
  sortConfig: PackSortConfig;
  requestSort: (column: SortablePackColumn) => void;
  className?: string;
  numeric?: boolean;
}> = ({ column, title, sortConfig, requestSort, className, numeric = false }) => {
  const isSorted = sortConfig.column === column;
  let Icon = ChevronsUpDown;

  if (isSorted) {
    Icon = numeric
      ? sortConfig.direction === 'asc' ? ArrowUp01 : ArrowDown10
      : sortConfig.direction === 'asc' ? ArrowUpZA : ArrowDownAZ;
  }

  return (
    <TableHead className={cn('cursor-pointer hover:bg-muted/50', className)} onClick={() => requestSort(column)}>
      <div className="flex items-center gap-1">
        {title}
        <Icon className={cn('h-4 w-4', isSorted ? 'text-primary' : 'text-muted-foreground/50')} />
      </div>
    </TableHead>
  );
};

const PackInventoryTable: React.FC<{
  packs: PackRow[];
  selectedPackId?: string;
  columnVisibility: ColumnVisibility;
  sortConfig: PackSortConfig;
  requestSort: (column: SortablePackColumn) => void;
  onInspectPack: (pack: PackRow) => void;
  onNewVersion: (pack: PackRow) => void;
  onDelete: (pack: PackRow) => void;
}> = ({
  packs,
  selectedPackId,
  columnVisibility,
  sortConfig,
  requestSort,
  onInspectPack,
  onNewVersion,
  onDelete,
}) => {
  if (packs.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columnVisibility.name && (
            <SortableHeader column="name" title="Name" sortConfig={sortConfig} requestSort={requestSort} />
          )}
          {columnVisibility.group && (
            <SortableHeader column="group" title="Device Group" sortConfig={sortConfig} requestSort={requestSort} className="hidden md:table-cell" />
          )}
          {columnVisibility.version && (
            <SortableHeader column="version" title="Version" sortConfig={sortConfig} requestSort={requestSort} numeric />
          )}
          {columnVisibility.packaging && (
            <SortableHeader column="packaging" title="Packaging" sortConfig={sortConfig} requestSort={requestSort} className="hidden lg:table-cell" />
          )}
          {columnVisibility.type && (
            <SortableHeader column="type" title="Type" sortConfig={sortConfig} requestSort={requestSort} className="hidden xl:table-cell" />
          )}
          {columnVisibility.status && (
            <SortableHeader column="status" title="Status" sortConfig={sortConfig} requestSort={requestSort} />
          )}
          {columnVisibility.security && <TableHead className="hidden xl:table-cell">Security</TableHead>}
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {packs.map((pack) => {
          const detailsBroken = !pack.groupId;
          const canStartCampaign = !!pack.uri && !pack.orphaned;
          const detailsHref = getDetailsHref(pack);
          const campaignHref = getCampaignHref(pack);

          return (
            <TableRow
              key={`${pack.groupId}-${pack.id}`}
              data-state={selectedPackId === pack.id ? 'selected' : undefined}
              className="cursor-pointer"
              onClick={() => onInspectPack(pack)}
            >
              {columnVisibility.name && (
                <TableCell className="min-w-[220px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="block truncate text-left font-medium hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onInspectPack(pack);
                        }}
                        title={`Inspect ${pack.name}`}
                      >
                        {pack.name}
                      </button>
                      <div className="mt-1 md:hidden">
                        <GroupBadge pack={pack} />
                      </div>
                    </div>
                  </div>
                </TableCell>
              )}
              {columnVisibility.group && (
                <TableCell className="hidden md:table-cell">
                  <GroupBadge pack={pack} />
                </TableCell>
              )}
              {columnVisibility.version && (
                <TableCell>
                  <span className="font-mono text-xs">v{pack.version}</span>
                </TableCell>
              )}
              {columnVisibility.packaging && (
                <TableCell className="hidden lg:table-cell">
                  <PackagingBadge packaging={pack.packaging} />
                </TableCell>
              )}
              {columnVisibility.type && (
                <TableCell className="hidden xl:table-cell">
                  <Badge variant="outline" className="font-mono text-xs">{pack.type}</Badge>
                </TableCell>
              )}
              {columnVisibility.status && (
                <TableCell>
                  <PackStatusBadge pack={pack} />
                </TableCell>
              )}
              {columnVisibility.security && (
                <TableCell className="hidden xl:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {pack.signature_key_id && <Badge variant="outline" className="text-xs">signed</Badge>}
                    {pack.encryption_mode && <Badge variant="outline" className="text-xs">{pack.encryption_mode}</Badge>}
                    {pack.allow_previous_version_download && <Badge variant="outline" className="text-xs">previous</Badge>}
                    {!pack.signature_key_id && !pack.encryption_mode && !pack.allow_previous_version_download && (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </TableCell>
              )}
              <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" title="More actions" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">More actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onInspectPack(pack)}>
                      <Package className="mr-2 h-4 w-4" />
                      Inspect
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild={!detailsBroken} disabled={detailsBroken}>
                      {detailsBroken ? (
                        <span>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open Details
                        </span>
                      ) : (
                        <Link href={detailsHref}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open Details
                        </Link>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild={canStartCampaign} disabled={!canStartCampaign}>
                      {canStartCampaign ? (
                        <Link href={campaignHref}>
                          <Rocket className="mr-2 h-4 w-4" />
                          Start Campaign
                        </Link>
                      ) : (
                        <span>
                          <Rocket className="mr-2 h-4 w-4" />
                          Start Campaign
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNewVersion(pack)} disabled={detailsBroken}>
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
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default function PackageInventoryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { availableDms } = useDms();
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [packToVersion, setPackToVersion] = useState<PackForVersioning | null>(null);
  const [packToDelete, setPackToDelete] = useState<PackRow | null>(null);
  const [selectedPack, setSelectedPack] = useState<PackRow | null>(null);
  const [sortConfig, setSortConfig] = useState<PackSortConfig>({ column: 'name', direction: 'asc' });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(DEFAULT_COLUMN_VISIBILITY);

  const [rawPacks, setRawPacks] = useState<UpdatePack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  // One fleet-wide call returns every pack regardless of group, so packs whose device group was
  // deleted (or whose group ID changed after a lamassuiot re-run) still surface here.
  const fetchPacks = useCallback(async () => {
    if (!user?.access_token) return;
    setIsFetching(true);
    if (rawPacks.length === 0) setIsLoading(true);
    setError(null);
    try {
      const resp = await fetchAllUpdatePacks({ pageSize: 500 });
      setRawPacks(resp.list);
    } catch (err) {
      setError(err as Error);
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [user?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchPacks(); }, [fetchPacks]);

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

  const handleDeletePack = async (pack: PackRow) => {
    setIsDeleting(true);
    try {
      const data = await deleteUpdatePackByIdApi({ packId: pack.id });
      toast({ title: 'Distribution Set Deleted', description: `Pack "${pack.name}" has been deleted. ${data?.message || ''}` });
      if (selectedPack?.id === pack.id) setSelectedPack(null);
      fetchPacks();
    } catch (err: Error | any) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: `Could not delete pack "${pack.name}". ${err.message}` });
    } finally {
      setIsDeleting(false);
      setPackToDelete(null);
    }
  };

  const requestSort = (column: SortablePackColumn) => {
    setSortConfig((current) => ({
      column,
      direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const filtered = useMemo(() => {
    const result = packs
      .filter((p) => groupFilter === 'all' || (groupFilter === ORPHANED_FILTER ? p.orphaned : p.groupId === groupFilter))
      .filter((p) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.groupName.toLowerCase().includes(q) ||
          p.version.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q) ||
          (p.packaging || 'swu').toLowerCase().includes(q)
        );
      });

    return result.sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.column) {
        case 'group':
          comparison = sortableText(a.groupName).localeCompare(sortableText(b.groupName));
          break;
        case 'version':
          comparison = compareSemver(a.version, b.version);
          break;
        case 'type':
          comparison = sortableText(a.type).localeCompare(sortableText(b.type));
          break;
        case 'packaging':
          comparison = sortableText(a.packaging || 'swu').localeCompare(sortableText(b.packaging || 'swu'));
          break;
        case 'status':
          comparison = Number(Boolean(a.uri)) - Number(Boolean(b.uri));
          break;
        case 'name':
        default:
          comparison = sortableText(a.name).localeCompare(sortableText(b.name));
      }

      return sortConfig.direction === 'asc' ? comparison : comparison * -1;
    });
  }, [packs, groupFilter, search, sortConfig]);

  const handleColumnToggle = (columnId: string) => {
    if (columnId === 'name') return;
    setColumnVisibility((current) => ({
      ...current,
      [columnId]: !current[columnId as PackColumnId],
    }));
  };

  const goToPackDetails = (groupId: string, packName: string) => {
    router.push(`/updates/pack-details?groupId=${encodeURIComponent(groupId)}&packName=${encodeURIComponent(packName)}`);
  };

  const handleInspectPack = (pack: PackRow) => {
    setSelectedPack((current) => (current?.id === pack.id ? null : pack));
  };

  const createDefaultGroupId =
    groupFilter !== 'all' && groupFilter !== ORPHANED_FILTER ? groupFilter : undefined;

  return (
    <MasterDetailLayout
      isDetailOpen={!!selectedPack}
      onClose={() => setSelectedPack(null)}
      detailTitle={selectedPack ? selectedPack.name : null}
      detailSubtitle={selectedPack ? `v${selectedPack.version}` : null}
      detailActions={
        selectedPack ? (
          <>
            <Button
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setPackToVersion({
                id: selectedPack.id,
                name: selectedPack.name,
                version: selectedPack.version,
                groupId: selectedPack.groupId,
                groupName: selectedPack.groupName,
              })}
              disabled={!selectedPack.groupId}
            >
              New Version
            </Button>
            <Button
              variant="ghost"
              className="h-7 text-xs"
              disabled={!selectedPack.groupId}
              onClick={() => goToPackDetails(selectedPack.groupId, selectedPack.name)}
            >
              Open full page →
            </Button>
          </>
        ) : null
      }
      detail={selectedPack ? <PackDetailPanel key={selectedPack.id} pack={selectedPack} /> : null}
      list={
        <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Distribution Set' }]} className="space-y-6 pb-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-headline font-semibold">Distribution Set</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every distribution set across your device groups — create packs, manage versions, and start campaigns from here.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={() => fetchPacks()} variant="secondary" size="icon" disabled={isFetching} title="Refresh">
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              </Button>
              <Button onClick={() => setIsCreateOpen(true)}>
                <PackagePlus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New Distribution Set</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border bg-card p-3 lg:flex-row lg:items-center">
            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-[230px_minmax(240px,1fr)]">
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger>
                  <span className="flex min-w-0 items-center gap-2">
                    <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
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

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search distribution sets..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 lg:justify-end">
              {!isLoading && (
                <span className="text-xs text-muted-foreground">
                  {filtered.length} of {packs.length} pack{packs.length === 1 ? '' : 's'}
                </span>
              )}
              <ColumnSelector
                columns={[
                  { id: 'name', label: 'Name', visible: columnVisibility.name, disabled: true },
                  { id: 'group', label: 'Device Group', visible: columnVisibility.group },
                  { id: 'version', label: 'Version', visible: columnVisibility.version },
                  { id: 'packaging', label: 'Packaging', visible: columnVisibility.packaging },
                  { id: 'type', label: 'Type', visible: columnVisibility.type },
                  { id: 'status', label: 'Status', visible: columnVisibility.status },
                  { id: 'security', label: 'Security', visible: columnVisibility.security },
                ]}
                onColumnToggle={handleColumnToggle}
                align="end"
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error.message}
                <Button variant="link" onClick={() => fetchPacks()} className="ml-2 h-auto p-0">Try again?</Button>
              </AlertDescription>
            </Alert>
          )}

          {orphanedCount > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{orphanedCount} orphaned pack{orphanedCount === 1 ? '' : 's'}</AlertTitle>
              <AlertDescription>
                {orphanedCount === 1 ? 'This pack references' : 'These packs reference'} a device group that no longer exists.
                The pack data is preserved, but campaigns cannot be launched until the group is restored.
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading distribution sets…
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 rounded-lg border-2 border-dashed bg-muted/20 p-8 text-center">
              <h3 className="text-lg font-semibold text-muted-foreground">No Distribution Sets Found</h3>
              <p className="text-sm text-muted-foreground">
                {search || groupFilter !== 'all' ? 'No packs match your filters.' : 'Create a distribution set to get started.'}
              </p>
              {!search && groupFilter === 'all' && (
                <Button onClick={() => setIsCreateOpen(true)} className="mt-4">
                  <PackagePlus className="mr-2 h-4 w-4" />
                  New Distribution Set
                </Button>
              )}
            </div>
          ) : (
            <PackInventoryTable
              packs={filtered}
              selectedPackId={selectedPack?.id}
              columnVisibility={columnVisibility}
              sortConfig={sortConfig}
              requestSort={requestSort}
              onInspectPack={handleInspectPack}
              onNewVersion={(pack) => setPackToVersion({
                id: pack.id,
                name: pack.name,
                version: pack.version,
                groupId: pack.groupId,
                groupName: pack.groupName,
              })}
              onDelete={(pack) => setPackToDelete(pack)}
            />
          )}

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PackagePlus className="h-5 w-5 text-primary" />
                  New Distribution Set
                </DialogTitle>
                <DialogDescription>
                  Create the pack as a repository. You'll upload artifacts and build the SWU, if applicable, on the pack's page afterwards.
                </DialogDescription>
              </DialogHeader>
              <CreatePackForm
                showGroupSelector
                defaultGroupId={createDefaultGroupId}
                onCreated={(gid, packName) => {
                  setIsCreateOpen(false);
                  fetchPacks();
                  goToPackDetails(gid, packName);
                }}
              />
            </DialogContent>
          </Dialog>

          <NewPackVersionDialog
            pack={packToVersion}
            onOpenChange={(open) => { if (!open) setPackToVersion(null); }}
            onCreated={(gid, packName) => {
              fetchPacks();
              goToPackDetails(gid, packName);
            }}
          />

          <AlertDialog open={!!packToDelete} onOpenChange={(open) => { if (!open) setPackToDelete(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Distribution Set</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{packToDelete?.name}" (v{packToDelete?.version}) from{' '}
                  {packToDelete?.groupName}? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => packToDelete && handleDeletePack(packToDelete)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </BreadcrumbPage>
      }
    />
  );
}
