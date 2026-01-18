'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreHorizontal, Eye, Edit, Trash2, Users, ChevronRight, ChevronDown, ChevronsUpDown, ArrowUpZA, ArrowDownAZ, ArrowUp01, ArrowDown10 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DeviceGroupNode } from '@/lib/device-groups-utils';

interface DeviceGroupsListProps {
  groups: DeviceGroupNode[];
  onDelete: (groupId: string) => void;
}

type SortableColumn = 'name' | 'description' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

export function DeviceGroupsList({ groups, onDelete }: DeviceGroupsListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DeviceGroupNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'name', direction: 'asc' });

  const handleDeleteClick = (group: DeviceGroupNode) => {
    setSelectedGroup(group);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedGroup) {
      onDelete(selectedGroup.id);
      setDeleteDialogOpen(false);
      setSelectedGroup(null);
    }
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const requestSort = (column: SortableColumn) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.column === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ column, direction });
  };

  // Sort groups while maintaining hierarchy
  const sortGroups = (nodes: DeviceGroupNode[]): DeviceGroupNode[] => {
    const sorted = [...nodes].sort((a, b) => {
      let aValue: string | Date;
      let bValue: string | Date;

      if (sortConfig.column === 'created_at') {
        aValue = new Date(a.created_at);
        bValue = new Date(b.created_at);
        const comparison = aValue.getTime() - bValue.getTime();
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      } else {
        aValue = a[sortConfig.column]?.toLowerCase() || '';
        bValue = b[sortConfig.column]?.toLowerCase() || '';
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }
    });

    // Recursively sort children
    return sorted.map(node => ({
      ...node,
      children: node.children ? sortGroups(node.children) : [],
    }));
  };

  const sortedGroups = sortGroups(groups);

  // Build visible groups based on expanded state
  const getVisibleGroups = (nodes: DeviceGroupNode[]): DeviceGroupNode[] => {
    const visible: DeviceGroupNode[] = [];
    
    const traverse = (node: DeviceGroupNode) => {
      visible.push(node);
      if (expandedNodes.has(node.id) && node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child));
      }
    };
    
    nodes.forEach(node => traverse(node));
    return visible;
  };

  const visibleGroups = getVisibleGroups(sortedGroups);

  const SortableTableHeader: React.FC<{ column: SortableColumn; title: string; className?: string }> = ({ column, title, className }) => {
    const isSorted = sortConfig?.column === column;
    let Icon = ChevronsUpDown;
    if (isSorted) {
      if (column === 'created_at') {
        Icon = sortConfig?.direction === 'asc' ? ArrowUp01 : ArrowDown10;
      } else {
        Icon = sortConfig?.direction === 'asc' ? ArrowUpZA : ArrowDownAZ;
      }
    }

    return (
      <TableHead className={cn("cursor-pointer hover:bg-muted/60", className)} onClick={() => requestSort(column)}>
        <div className="flex items-center gap-1">
          {title} <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
        </div>
      </TableHead>
    );
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHeader column="name" title="Name" />
            <SortableTableHeader column="description" title="Description" />
            <SortableTableHeader column="created_at" title="Created" />
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
            {visibleGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No groups found
                </TableCell>
              </TableRow>
            ) : (
              visibleGroups.map((group) => {
                const hasChildren = group.children && group.children.length > 0;
                const isExpanded = expandedNodes.has(group.id);
                
                return (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingLeft: `${group.level * 24}px` }}
                      >
                        {hasChildren ? (
                          <button
                            onClick={() => toggleNode(group.id)}
                            className="p-0.5 hover:bg-accent rounded flex-shrink-0"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5 flex-shrink-0" />
                        )}
                        <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Link
                          href={`/device-groups/details?groupId=${group.id}`}
                          className="hover:underline truncate"
                        >
                          {group.name}
                        </Link>
                      </div>
                    </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {group.description || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(group.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/device-groups/details?groupId=${group.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/device-groups/edit?groupId=${group.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteClick(group)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedGroup?.name}&quot;? This action cannot be
              undone. Devices will not be deleted, only the group definition.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
