'use client';

import Link from '@/components/shared/RouterLink';
import { FolderPlus, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { buildDeviceGroupTree, type DeviceGroupNode } from '@/lib/device-groups-utils';
import { useDeviceGroupStats } from '@/hooks/useDeviceGroupStats';
import type { DeviceGroup } from '@/types/device-group';

interface GroupHierarchyTreeProps {
  group: DeviceGroup;
  /** Root-first ancestor chain. */
  ancestors: DeviceGroup[];
  /** Every group nested under `group`. */
  descendants: DeviceGroup[];
  refreshKey?: number;
}

function DeviceCount({ groupId, refreshKey }: Readonly<{ groupId: string; refreshKey: number }>) {
  const { stats, isLoading } = useDeviceGroupStats(groupId, refreshKey);
  if (isLoading) return <Skeleton className="h-4 w-14" />;
  if (!stats) return null;
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {stats.total.toLocaleString()} device{stats.total === 1 ? '' : 's'}
    </span>
  );
}

function TreeRow({
  group,
  depth,
  isCurrent = false,
  refreshKey,
}: Readonly<{ group: DeviceGroup; depth: number; isCurrent?: boolean; refreshKey: number }>) {
  const ruleCount = group.criteria?.length ?? 0;
  return (
    <li
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2',
        isCurrent ? 'border border-primary/30 bg-primary/5' : 'hover:bg-muted/50',
      )}
      style={{ marginLeft: `${depth * 24}px` }}
    >
      {depth > 0 && (
        <span aria-hidden className="absolute -left-3 top-0 h-1/2 w-3 rounded-bl-md border-b border-l border-border" />
      )}
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
        <Layers className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        {isCurrent ? (
          <span className="truncate text-sm font-semibold">{group.name}</span>
        ) : (
          <Link href={`/device-groups/details?groupId=${group.id}`} className="truncate text-sm font-medium hover:underline">
            {group.name}
          </Link>
        )}
        {isCurrent && <Badge>This group</Badge>}
        <span className="text-xs text-muted-foreground">
          {ruleCount === 0 ? 'no own rules' : `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`}
        </span>
      </div>
      <DeviceCount groupId={group.id} refreshKey={refreshKey} />
    </li>
  );
}

export function GroupHierarchyTree({ group, ancestors, descendants, refreshKey = 0 }: Readonly<GroupHierarchyTreeProps>) {
  // Re-root the descendants under the current group so levels start at 1.
  const subtree: DeviceGroupNode[] = buildDeviceGroupTree(descendants).filter((node) => node.parent_id === group.id);
  const baseDepth = ancestors.length;

  const renderSubtree = (nodes: DeviceGroupNode[], depth: number): React.ReactNode[] =>
    nodes.flatMap((node) => [
      <TreeRow key={node.id} group={node} depth={depth} refreshKey={refreshKey} />,
      ...renderSubtree(node.children, depth + 1),
    ]);

  return (
    <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
      <div>
        <p className="font-semibold">Hierarchy</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Subgroups narrow their parent: they contain only devices that also match every ancestor&apos;s rules.
          Deleting a group also deletes all of its subgroups.
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href={`/device-groups/new?parentId=${group.id}`}>
            <FolderPlus className="mr-2 h-4 w-4" /> Add Subgroup
          </Link>
        </Button>
      </div>

      <div className="lg:col-span-2">
        <ul className="space-y-1" aria-label="Group hierarchy">
          {ancestors.map((ancestor, index) => (
            <TreeRow key={ancestor.id} group={ancestor} depth={index} refreshKey={refreshKey} />
          ))}
          <TreeRow group={group} depth={baseDepth} isCurrent refreshKey={refreshKey} />
          {renderSubtree(subtree, baseDepth + 1)}
        </ul>
        {subtree.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground" style={{ marginLeft: `${(baseDepth + 1) * 24}px` }}>
            No subgroups yet.
          </p>
        )}
      </div>
    </div>
  );
}
