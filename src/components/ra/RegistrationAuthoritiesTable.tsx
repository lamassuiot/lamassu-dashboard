

'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit, Trash2, BookText, TerminalSquare, Router as RouterIcon, ChevronsUpDown, ArrowUpZA, ArrowDownAZ, ArrowUp01, ArrowDown10 } from "lucide-react";
import type { ApiRaItem } from '@/lib/dms-api';
import { cn } from '@/lib/utils';
import type { SortableColumn, SortDirection } from '@/app/registration-authorities/page';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';

interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

interface RegistrationAuthoritiesTableProps {
  ras: ApiRaItem[];
  getCaNameById: (caId: string) => string;
  onEdit: (raId: string) => void;
  onViewDevices: (raId: string) => void;
  onShowMetadata: (ra: ApiRaItem) => void;
  onOpenEnrollModal: (ra: ApiRaItem) => void;
  onOpenReEnrollModal: (ra: ApiRaItem) => void;
  onDelete: (ra: ApiRaItem) => void;
  sortConfig: SortConfig | null;
  requestSort: (column: SortableColumn) => void;
}

const SortableTableHeader: React.FC<{
    column: SortableColumn;
    title: string;
    onSort: (column: SortableColumn) => void;
    sortConfig: SortConfig | null;
    className?: string;
}> = ({ column, title, onSort, sortConfig, className }) => {
    const isSorted = sortConfig?.column === column;
    let Icon = ChevronsUpDown;
    if (isSorted) {
      if (column === 'creation_ts') { // Date sort icon preference
        Icon = sortConfig?.direction === 'asc' ? ArrowUp01 : ArrowDown10;
      } else { // Text-based sort icon preference
        Icon = sortConfig?.direction === 'asc' ? ArrowUpZA : ArrowDownAZ;
      }
    } else if (column === 'creation_ts') {
         Icon = ChevronsUpDown; // Default for non-sorted date
    }
    
    return (
        <TableHead className={cn("cursor-pointer hover:bg-muted/50", className)} onClick={() => onSort(column)}>
            <div className="flex items-center gap-1">
                {title} <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
            </div>
        </TableHead>
    );
};


export const RegistrationAuthoritiesTable: React.FC<RegistrationAuthoritiesTableProps> = ({
  ras,
  getCaNameById,
  onEdit,
  onViewDevices,
  onShowMetadata,
  onOpenEnrollModal,
  onOpenReEnrollModal,
  onDelete,
  sortConfig,
  requestSort,
}) => {
  const router = useRouter();

  return (
    <div className="w-full space-y-4">
      <div className="overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHeader column="name" title="Name" onSort={requestSort} sortConfig={sortConfig} />
            <TableHead className="hidden md:table-cell">Registration Mode</TableHead>
            <TableHead>Enrollment CA</TableHead>
            <TableHead className="hidden lg:table-cell">Auth Mode</TableHead>
            <SortableTableHeader column="creation_ts" title="Created At" onSort={requestSort} sortConfig={sortConfig} />
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ras.map((ra) => (
            <TableRow key={ra.id}>
              <TableCell className="font-medium truncate max-w-[150px] sm:max-w-xs">{ra.name}</TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{ra.settings.enrollment_settings.registration_mode}</Badge>
              </TableCell>
              <TableCell className="truncate max-w-[200px]">
                <span className="truncate" title={getCaNameById(ra.settings.enrollment_settings.enrollment_ca)}>
                  {getCaNameById(ra.settings.enrollment_settings.enrollment_ca)}
                </span>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <Badge variant="secondary">{ra.settings.enrollment_settings.est_rfc7030_settings?.auth_mode?.replace('_', ' ') || 'N/A'}</Badge>
              </TableCell>
              <TableCell>
                {format(parseISO(ra.creation_ts), 'MMM dd, yyyy')}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" title="More actions" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">More actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(ra.id)}>
                      <Edit className="mr-2 h-4 w-4" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewDevices(ra.id)}>
                      <RouterIcon className="mr-2 h-4 w-4" />
                      <span>View Devices</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onShowMetadata(ra)}>
                      <BookText className="mr-2 h-4 w-4" />
                      <span>Show Metadata</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <TerminalSquare className="mr-2 h-4 w-4" />
                        <span>EST (RFC-7030)</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => onOpenEnrollModal(ra)}>
                            <span>Enroll...</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onOpenReEnrollModal(ra)}>
                            <span>Re-Enroll...</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/registration-authorities/cacerts?raId=${ra.id}`)}>
                            <span>Get CA Certs</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(ra)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete</span>
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
