'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown10,
  ArrowDownAZ,
  ArrowUp01,
  ArrowUpZA,
  ChevronsUpDown,
  Loader2,
  MoreVertical,
  PackagePlus,
  RefreshCw,
  Search,
} from 'lucide-react';

import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
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
  fetchAllUpdatePacks,
} from '@/lib/iot-api';
import { cn, compareSemver } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { UpdatePack } from '@/types/iot';

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

function getDetailsHref(pack: PackRow) {
  return `/updates/pack-details?groupId=${encodeURIComponent(pack.groupId)}&packName=${encodeURIComponent(pack.name)}`;
}

function getCampaignHref(pack: PackRow) {
  return `/updates?action=campaign&groupId=${encodeURIComponent(pack.groupId)}&packId=${encodeURIComponent(pack.id)}`;
}

function getGroupHref(pack: PackRow) {
  return `/device-groups/details?groupId=${encodeURIComponent(pack.groupId)}`;
}

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
  columnVisibility: ColumnVisibility;
  sortConfig: PackSortConfig;
  requestSort: (column: SortablePackColumn) => void;
  onNewVersion: (pack: PackRow) => void;
  onDelete: (pack: PackRow) => void;
}> = ({
  packs,
  columnVisibility,
  sortConfig,
  requestSort,
  onNewVersion,
  onDelete,
}) => {
  if (packs.length === 0) return null;

  const renderGroupLink = (pack: PackRow, className?: string) => {
    if (!pack.groupId || pack.orphaned) {
      return (
        <span
          className={cn('truncate text-sm text-muted-foreground', pack.orphaned && 'text-destructive', className)}
          title={pack.orphaned ? "This pack's device group no longer exists." : pack.groupName}
        >
          {pack.groupName}
        </span>
      );
    }

    return (
      <Link
        href={getGroupHref(pack)}
        className={cn('truncate text-sm font-medium text-primary hover:underline', className)}
        title={`Open ${pack.groupName}`}
      >
        {pack.groupName}
      </Link>
    );
  };

  const renderSecurityText = (pack: PackRow) => {
    const items = [
      pack.signature_key_id ? 'signed' : null,
      pack.encryption_mode || null,
      pack.allow_previous_version_download ? 'previous downloads' : null,
    ].filter(Boolean);

    return items.length > 0 ? items.join(', ') : '-';
  };

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
            <TableRow key={`${pack.groupId}-${pack.id}`}>
              {columnVisibility.name && (
                <TableCell className="min-w-[220px]">
                  <div className="min-w-0">
                    {detailsBroken ? (
                      <span className="block max-w-[260px] truncate font-medium" title={pack.name}>
                        {pack.name}
                      </span>
                    ) : (
                      <Link
                        href={detailsHref}
                        className="block max-w-[260px] truncate font-medium text-primary hover:underline"
                        title={`Open ${pack.name}`}
                      >
                        {pack.name}
                      </Link>
                    )}
                    <div className="mt-1 md:hidden">
                      {renderGroupLink(pack, 'block max-w-[220px] text-xs')}
                    </div>
                  </div>
                </TableCell>
              )}
              {columnVisibility.group && (
                <TableCell className="hidden md:table-cell">
                  {renderGroupLink(pack, 'block max-w-[220px]')}
                </TableCell>
              )}
              {columnVisibility.version && (
                <TableCell>
                  v{pack.version}
                </TableCell>
              )}
              {columnVisibility.packaging && (
                <TableCell className="hidden lg:table-cell">
                  {pack.packaging || 'swu'}
                </TableCell>
              )}
              {columnVisibility.type && (
                <TableCell className="hidden xl:table-cell">
                  {pack.type}
                </TableCell>
              )}
              {columnVisibility.status && (
                <TableCell>
                  {pack.uri ? (pack.packaging === 'non-swu' ? 'built' : 'SWU built') : 'not built'}
                </TableCell>
              )}
              {columnVisibility.security && (
                <TableCell className="hidden xl:table-cell">
                  {renderSecurityText(pack)}
                </TableCell>
              )}
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" title="More actions" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">More actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild={!detailsBroken} disabled={detailsBroken}>
                      {detailsBroken ? (
                        <span>Open Details</span>
                      ) : (
                        <Link href={detailsHref}>Open Details</Link>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild={canStartCampaign} disabled={!canStartCampaign}>
                      {canStartCampaign ? (
                        <Link href={campaignHref}>Start Campaign</Link>
                      ) : (
                        <span>Start Campaign</span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNewVersion(pack)} disabled={detailsBroken}>
                      New Version
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onDelete(pack)} className="text-destructive focus:text-destructive">
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

  const createDefaultGroupId =
    groupFilter !== 'all' && groupFilter !== ORPHANED_FILTER ? groupFilter : undefined;

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Distribution Set' }]} className="space-y-6 pb-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
            <div>
              <h1 className="text-2xl font-headline font-semibold">Distribution Set</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Every distribution set across your device groups — create packs, manage versions, and start campaigns from here.
              </p>
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

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-[230px_minmax(240px,1fr)]">
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Device Groups" />
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
              columnVisibility={columnVisibility}
              sortConfig={sortConfig}
              requestSort={requestSort}
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
                <DialogTitle>New Distribution Set</DialogTitle>
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
  );
}
