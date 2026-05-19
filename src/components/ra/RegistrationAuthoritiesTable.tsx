

'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuPortal, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit, Trash2, BookText, TerminalSquare, Router as RouterIcon, ChevronsUpDown, ArrowUpZA, ArrowDownAZ, ArrowUp01, ArrowDown10, Settings2 } from "lucide-react";
import type { ApiRaItem } from '@/lib/dms-api';
import { cn } from '@/lib/utils';
import type { SortableColumn, SortDirection } from '@/app/registration-authorities/page';
import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { useRouter } from 'next/navigation';
import { DateDisplay } from '@/components/shared/DateDisplay';
import type { CA } from '@/lib/ca-data';
import { findCaById } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { parseISO, isPast, formatDistanceToNowStrict } from 'date-fns';
import type { ColumnConfig } from '@/components/ui/column-selector';

interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

interface RegistrationAuthoritiesTableProps {
  ras: ApiRaItem[];
  getCaNameById: (caId: string) => string;
  allCAs: CA[];
  allCryptoEngines?: ApiCryptoEngine[];
  onEdit: (raId: string) => void;
  onViewDevices: (raId: string) => void;
  onShowMetadata: (ra: ApiRaItem) => void;
  onOpenEnrollModal: (ra: ApiRaItem) => void;
  onOpenReEnrollModal: (ra: ApiRaItem) => void;
  onOpenCaCertsPanel: (ra: ApiRaItem) => void;
  onOpenCmpEnrollModal: (ra: ApiRaItem) => void;
  onDelete: (ra: ApiRaItem) => void;
  sortConfig: SortConfig | null;
  requestSort: (column: SortableColumn) => void;
  columnVisibility: Record<string, boolean>;
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
        <TableHead className={cn("cursor-pointer hover:bg-muted/50", 
          column === 'creation_ts' && "text-center", 
          className)} onClick={() => onSort(column)}>
            <div className={cn("flex items-center gap-1", 
              column === 'creation_ts' && "justify-center")}>
                {title} <Icon className={cn("h-4 w-4", isSorted ? "text-primary" : "text-muted-foreground/50")} />
            </div>
        </TableHead>
    );
};


export const RegistrationAuthoritiesTable: React.FC<RegistrationAuthoritiesTableProps> = ({
  ras,
  getCaNameById,
  allCAs,
  allCryptoEngines,
  onEdit,
  onViewDevices,
  onShowMetadata,
  onOpenEnrollModal,
  onOpenReEnrollModal,
  onOpenCaCertsPanel,
  onOpenCmpEnrollModal,
  onDelete,
  sortConfig,
  requestSort,
  columnVisibility,
}) => {
  const router = useRouter();

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow>
            {columnVisibility.icon && <TableHead className="w-12"></TableHead>}
            {columnVisibility.name && <SortableTableHeader column="name" title="Name" onSort={requestSort} sortConfig={sortConfig} />}
            {columnVisibility.registrationMode && <TableHead className="hidden md:table-cell">Registration Mode</TableHead>}
            {columnVisibility.enrollmentCA && <TableHead className="min-w-[280px]">Enrollment CA</TableHead>}
            {columnVisibility.authMode && <TableHead className="hidden lg:table-cell">Auth Mode</TableHead>}
            {columnVisibility.createdAt && <SortableTableHeader column="creation_ts" title="Created At" onSort={requestSort} sortConfig={sortConfig} />}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ras.map((ra) => (
            <TableRow key={ra.id}>
              {columnVisibility.icon && (
                <TableCell className="w-12">
                  <div className="flex justify-center">
                    {(() => {
                      const profile = ra.settings.enrollment_settings.device_provisioning_profile;
                      const IconComponent = getLucideIconByName(profile.icon);
                      const [iconColor, bgColor] = (profile.icon_color || '#888888-#e0e0e0').split('-');
                      
                      return (
                        <div className="p-2 rounded-md flex-shrink-0" style={{ backgroundColor: bgColor }}>
                          {IconComponent ? (
                            <IconComponent className="h-5 w-5" style={{ color: iconColor }} />
                          ) : (
                            <Settings2 className="h-5 w-5 text-primary" />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </TableCell>
              )}
              {columnVisibility.name && (
                <TableCell className="font-medium max-w-[150px] sm:max-w-xs">
                  <div className="flex flex-col">
                    <Button
                      variant="link"
                      className="p-0 h-auto font-medium text-left justify-start truncate"
                      onClick={() => onEdit(ra.id)}
                      title={`Edit ${ra.name}`}
                    >
                      <span className="truncate">{ra.name}</span>
                    </Button>
                    <span className="text-xs text-muted-foreground truncate" title={ra.id}>{ra.id}</span>
                  </div>
                </TableCell>
              )}
              {columnVisibility.registrationMode && (
                <TableCell className="hidden md:table-cell">
                  <Badge variant="secondary">{ra.settings.enrollment_settings.registration_mode}</Badge>
                </TableCell>
              )}
              {columnVisibility.enrollmentCA && (
                <TableCell className="max-w-[280px]">
                  {(() => {
                    const ca = findCaById(ra.settings.enrollment_settings.enrollment_ca, allCAs);
                    if (!ca) return <span className="text-muted-foreground text-sm">—</span>;
                    const expiryDate = parseISO(ca.expires);
                    const isRevoked = ca.status === 'revoked';
                    const isExpired = !isRevoked && isPast(expiryDate);
                    const statusLabel = isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active';
                    const statusClass = isRevoked
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                      : isExpired
                      ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20'
                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
                    const expiryText = isRevoked ? null : isExpired
                      ? `Expired ${formatDistanceToNowStrict(expiryDate)} ago`
                      : `Expires in ${formatDistanceToNowStrict(expiryDate)}`;
                    return (
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => router.push(`/certificate-authorities/details?caId=${ca.id}`)}
                          className="text-sm font-medium text-primary hover:underline truncate"
                        >
                          {ca.name}
                        </button>
                        <Badge variant="secondary" className={`shrink-0 text-xs ${statusClass}`}>{statusLabel}</Badge>
                        {expiryText && <span className="text-xs text-muted-foreground shrink-0">{expiryText}</span>}
                      </div>
                    );
                  })()}
                </TableCell>
              )}
              {columnVisibility.authMode && (
                <TableCell className="hidden lg:table-cell">
                  <Badge variant="secondary">{ra.settings.enrollment_settings.est_rfc7030_settings?.auth_mode?.replace('_', ' ') || 'N/A'}</Badge>
                </TableCell>
              )}
              {columnVisibility.createdAt && (
                <TableCell>
                  <DateDisplay date={ra.creation_ts} />
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
                  <DropdownMenuContent align="end" className="w-56">
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
                    {/* Protocol-aware enrollment menus: only the protocol
                        actually configured on the RA is offered, so the
                        operator can't accidentally click EST commands on a
                        CMP-only DMS (or vice versa). The fallback `auth_mode`
                        presence check guards against older RAs that may have
                        been migrated without the top-level protocol field. */}
                    {(ra.settings.enrollment_settings.protocol === 'EST'
                        || !!ra.settings.enrollment_settings.est_rfc7030_settings?.auth_mode) && (
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
                            <DropdownMenuItem onClick={() => onOpenCaCertsPanel(ra)}>
                              <span>Get CA Certs</span>
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    )}
                    {(ra.settings.enrollment_settings.protocol === 'CMP'
                        || !!ra.settings.enrollment_settings.lwc_rfc9483_settings?.auth_mode) && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <TerminalSquare className="mr-2 h-4 w-4" />
                          <span>CMP (RFC-9483)</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => onOpenCmpEnrollModal(ra)}>
                              <span>Enroll...</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/registration-authorities/transactions?raId=${ra.id}`)}>
                              <span>View Transactions</span>
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    )}
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
