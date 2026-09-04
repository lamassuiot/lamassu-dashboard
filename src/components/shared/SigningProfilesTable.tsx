

'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit, Trash2, Users, ChevronsUpDown, ArrowUpZA, ArrowDownAZ } from "lucide-react";
import type { ApiSigningProfile } from '@/lib/ca-data';
import type { ProfileSortConfig, SortableProfileColumn } from '@/app/signing-profiles/page';
import { cn } from '@/lib/utils';

interface SigningProfilesTableProps {
  profiles: ApiSigningProfile[];
  sortConfig: ProfileSortConfig | null;
  requestSort: (column: SortableProfileColumn) => void;
  onEdit: (profileId: string) => void;
  onDelete: (profile: ApiSigningProfile) => void;
  onViewUsage: (profile: ApiSigningProfile) => void;
  columnVisibility: Record<string, boolean>;
}

const validityToString = (validity: ApiSigningProfile['validity']): string => {
  if (!validity) return "Not Specified";
  switch (validity.type) {
    case 'Duration':
      return validity.duration ? `Duration: ${validity.duration}` : "Not Specified";
    case 'Date':
      if (validity.time?.startsWith('9999-12-31')) return "Never Expires";
      return validity.time ? `Until: ${new Date(validity.time).toLocaleDateString()}` : "Not Specified";
    case 'Indefinite':
      return "Never Expires";
    default:
      return "Not Specified";
  }
};

const SortableTableHeader: React.FC<{
    column: SortableProfileColumn;
    title: string;
    onSort: (column: SortableProfileColumn) => void;
    sortConfig: ProfileSortConfig | null;
    className?: string;
}> = ({ column, title, onSort, sortConfig, className }) => {
    const isSorted = sortConfig?.column === column;
    let Icon = ChevronsUpDown;
    if (isSorted) {
      // All current sortable columns are text-based, but we keep the pattern for consistency
      Icon = sortConfig?.direction === 'asc' ? ArrowUpZA : ArrowDownAZ;
    }
    
    return (
        <TableHead className={cn("cursor-pointer hover:bg-muted/50", className)} onClick={() => onSort(column)}>
            <div className="flex items-center gap-1">
                {title} <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
            </div>
        </TableHead>
    );
};


export const SigningProfilesTable: React.FC<SigningProfilesTableProps> = ({ profiles, sortConfig, requestSort, onEdit, onDelete, onViewUsage, columnVisibility }) => {
  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow>
            {columnVisibility.name && <SortableTableHeader column="name" title="Name" onSort={requestSort} sortConfig={sortConfig} />}
            {columnVisibility.description && <TableHead className="hidden md:table-cell">Description</TableHead>}
            {columnVisibility.validity && <TableHead>Validity</TableHead>}
            {columnVisibility.policies && <TableHead className="hidden lg:table-cell">Policies</TableHead>}
            {columnVisibility.usages && <TableHead className="hidden xl:table-cell">Usages</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((profile) => (
            <TableRow key={profile.id}>
              {columnVisibility.name && (
                <TableCell className="font-medium truncate max-w-[150px] sm:max-w-xs">
                  <Button
                    variant="link"
                    className="p-0 h-auto font-medium text-left justify-start truncate"
                    onClick={() => onEdit(profile.id)}
                    title={`Edit ${profile.name}`}
                  >
                    <span className="truncate">{profile.name}</span>
                  </Button>
                </TableCell>
              )}
              {columnVisibility.description && (
                <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
                  {profile.description}
                </TableCell>
              )}
              {columnVisibility.validity && (
                <TableCell className="truncate max-w-[180px]">{validityToString(profile.validity)}</TableCell>
              )}
              {columnVisibility.policies && (
                <TableCell className="hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {profile.sign_as_ca && <Badge variant="default" className="bg-green-600/90 text-white">CA</Badge>}
                    {profile.honor_subject && <Badge variant="secondary">Honor Subject</Badge>}
                    {profile.honor_key_usage && <Badge variant="secondary">Honor KU</Badge>}
                    {profile.honor_extended_key_usages && <Badge variant="secondary">Honor EKU</Badge>}
                    {profile.honor_extensions && <Badge variant="secondary">Honor Ext</Badge>}
                  </div>
                </TableCell>
              )}
              {columnVisibility.usages && (
                <TableCell className="hidden xl:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {profile.key_usage.slice(0, 2).map(usage => (
                      <Badge key={usage} variant="secondary" className="text-xs">{usage}</Badge>
                    ))}
                    {[...profile.extended_key_usages, ...(profile.extra_extended_key_usage_oids || [])].slice(0, 2).map(eku => (
                      <Badge key={eku} variant="secondary" className="text-xs">{eku}</Badge>
                    ))}
                    {(profile.key_usage.length + profile.extended_key_usages.length + (profile.extra_extended_key_usage_oids?.length || 0)) > 4 && (
                      <Badge variant="secondary">...</Badge>
                    )}
                  </div>
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
                    <DropdownMenuItem onClick={() => onEdit(profile.id)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewUsage(profile)}>
                      <Users className="mr-2 h-4 w-4" /> Show Usage
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(profile)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
};
