'use client';

import React, { useMemo, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { AlertTriangle, ArrowRight, Download, Eye, HardDrive, Loader2, MoreVertical, ShieldCheck, Trash2 } from 'lucide-react';
import Link from '@/components/shared/RouterLink';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { CrlSettingsStatusBadge } from '@/components/shared/VaSettingsCard';
import { CrlViewerSheet } from '@/components/shared/CrlViewerSheet';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { useCrlSettingsList, type CrlSettingsListItem } from '@/hooks/useCrlSettingsList';
import { isZeroOrZeroDuration } from '@/lib/duration';
import { cn } from '@/lib/utils';
import { getCrlUrl, type CrlSettingsStatus } from '@/lib/va-api';
import { TableSkeleton } from '@/components/shared/PageSkeletons';
import { ListPageHero, RefreshButton } from '@/components/shared/ListPageHero';
import { VaFilterBar } from '@/components/shared/filters/VaFilterBar';
import { ColumnSelector } from '@/components/ui/column-selector';
import { useColumnVisibility, type ColumnDefinition } from '@/hooks/useColumnVisibility';

type VaColumnId = 'ca' | 'status' | 'crlVersion' | 'validFrom' | 'validUntil' | 'refreshInterval';

const VA_COLUMNS: ColumnDefinition<VaColumnId>[] = [
  { id: 'ca', label: 'Certification Authority', alwaysVisible: true },
  { id: 'status', label: 'Status' },
  { id: 'crlVersion', label: 'CRL Version' },
  { id: 'validFrom', label: 'Valid From' },
  { id: 'validUntil', label: 'Valid Until' },
  { id: 'refreshInterval', label: 'Refresh Interval' },
];

const caVaTabHref = (caId: string) =>
  `/certificate-authorities/details?caId=${encodeURIComponent(caId)}&tab=validation-authority`;

const matchesSearch = ({ settings, caName, caSubject }: CrlSettingsListItem, term: string) =>
  [settings.ca_id, caName, caSubject].some((value) => value?.toLowerCase().includes(term));

export function VerificationAuthoritiesClient() {
  const { items, isLoading, error, busyCaIds, reload, download, purge } = useCrlSettingsList();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilters, setStatusFilters] = useState<CrlSettingsStatus[]>([]);
  const { isVisible, toggle: toggleColumn, columns } = useColumnVisibility(VA_COLUMNS, 'lamassu.vaTable.columns');
  const [caIdToPurge, setCaIdToPurge] = useState<string | null>(null);
  // The CA whose CRL the viewer shows; kept after closing so the sheet does not empty while it animates out.
  const [viewedCaId, setViewedCaId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter((item) =>
      (statusFilters.length === 0 || statusFilters.includes(item.settings.status)) && (!term || matchesSearch(item, term)),
    );
  }, [items, searchTerm, statusFilters]);

  const viewedItem = viewedCaId ? items.find((item) => item.settings.ca_id === viewedCaId) : undefined;
  const viewedCa = viewedItem && {
    id: viewedItem.settings.ca_id,
    deleted: viewedItem.settings.status === 'ARCHIVED',
    name: viewedItem.caName ?? (viewedItem.settings.status === 'ARCHIVED' ? 'Deleted CA' : viewedItem.settings.ca_id),
    subject: viewedItem.caSubject,
    cryptoEngine: viewedItem.cryptoEngine,
  };

  const hasActiveFilters = searchTerm.trim() !== '' || statusFilters.length > 0;

  const openViewer = (caId: string) => {
    setViewedCaId(caId);
    setIsViewerOpen(true);
  };

  const confirmPurge = () => {
    if (caIdToPurge) void purge(caIdToPurge);
    setCaIdToPurge(null);
  };

  return (
    <BreadcrumbPage className="space-y-6 pb-8" items={[{ label: 'Home', href: '/' }, { label: 'Verification Authorities' }]}>
      <ListPageHero
        icon={ShieldCheck}
        title="Verification Authorities"
        description="CRL settings and latest CRL of every Certification Authority, including those of deleted ones, whose last CRL is still served."
      >
        <RefreshButton onClick={reload} isLoading={isLoading} />
      </ListPageHero>

      <VaFilterBar
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        statusFilters={statusFilters}
        onStatusFiltersChange={setStatusFilters}
        actions={<ColumnSelector columns={columns} onColumnToggle={toggleColumn} align="end" className="xl:hidden" />}
      />

      {isLoading && items.length === 0 && (
        <TableSkeleton label="Loading CRL settings…" pagination={false} />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading CRL Settings</AlertTitle>
          <AlertDescription>
            {error} <Button variant="link" onClick={reload} className="p-0 h-auto">Try again?</Button>
          </AlertDescription>
        </Alert>
      )}

      {!error && filteredItems.length > 0 && (
          <div className={cn('overflow-x-auto transition-opacity duration-300', isLoading && 'opacity-50 pointer-events-none')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Certification Authority</TableHead>
                  {isVisible('status') && <TableHead className="w-[120px]">Status</TableHead>}
                  {isVisible('crlVersion') && <TableHead className="w-[110px] text-center">CRL Version</TableHead>}
                  {isVisible('validFrom') && <TableHead className="w-[180px] text-center">Valid From</TableHead>}
                  {isVisible('validUntil') && <TableHead className="w-[180px] text-center">Valid Until</TableHead>}
                  {isVisible('refreshInterval') && <TableHead className="hidden lg:table-cell w-[140px]">Refresh Interval</TableHead>}
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(({ settings, caName, caSubject, cryptoEngine }) => {
                  const caId = settings.ca_id;
                  const isArchived = settings.status === 'ARCHIVED';
                  const busy = busyCaIds.has(caId);
                  const refreshInterval = settings.crl_options.refresh_interval;
                  const displayName = isArchived ? 'Deleted CA' : caName ?? caId;
                  // A deleted CA has no subject left to show, so its ID identifies it.
                  const secondaryLine = isArchived ? caId : caSubject;
                  return (
                    <TableRow key={caId}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                            {cryptoEngine ? (
                              <CryptoEngineViewer engine={cryptoEngine} iconOnly className="h-6 w-6" />
                            ) : (
                              <HardDrive className="h-6 w-6 text-primary" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <Button
                              variant="link"
                              className={cn('h-auto max-w-full p-0 text-left font-medium', isArchived && 'text-muted-foreground')}
                              onClick={() => openViewer(caId)}
                              title={`Fetch and show the CRL of ${caName ?? caId}`}
                            >
                              <span className="truncate">{displayName}</span>
                            </Button>
                            {secondaryLine && (
                              <p className={cn('text-xs text-muted-foreground break-all', isArchived && 'font-mono')}>{secondaryLine}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      {isVisible('status') && <TableCell><CrlSettingsStatusBadge status={settings.status} /></TableCell>}
                      {isVisible('crlVersion') && (
                        <TableCell className="text-center">
                          {settings.latest_crl ? settings.latest_crl.version : <span className="text-xs text-muted-foreground">N/A</span>}
                        </TableCell>
                      )}
                      {isVisible('validFrom') && (
                        <TableCell className="text-center">
                          {settings.latest_crl ? (
                            <DateDisplay date={settings.latest_crl.valid_from} className="text-xs items-center" relativeClassName="text-xs" />
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                      )}
                      {isVisible('validUntil') && (
                        <TableCell className="text-center">
                          {settings.latest_crl ? (
                            <DateDisplay date={settings.latest_crl.valid_until} className="text-xs items-center" relativeClassName="text-xs" />
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                      )}
                      {isVisible('refreshInterval') && (
                        <TableCell className="hidden lg:table-cell text-sm">
                          {isZeroOrZeroDuration(refreshInterval) ? 'Disabled' : refreshInterval || 'N/A'}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isArchived ? (
                            // Keeps the menu buttons aligned across rows.
                            <span aria-hidden className="h-8 w-8" />
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                                  <Link href={caVaTabHref(caId)} aria-label={`Configure the VA of ${caName ?? caId}`}>
                                    <ArrowRight className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Configure VA</TooltipContent>
                            </Tooltip>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                                <span className="sr-only">CRL Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewer(caId)}>
                                <Eye className="mr-2 h-4 w-4" /> Fetch &amp; Show CRL
                              </DropdownMenuItem>
                              {settings.latest_crl && (
                                <DropdownMenuItem onClick={() => void download(caId)}>
                                  <Download className="mr-2 h-4 w-4" /> Download CRL
                                </DropdownMenuItem>
                              )}
                              {isArchived && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setCaIdToPurge(caId)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete CRL Settings
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
      )}

      {!error && !isLoading && filteredItems.length === 0 && (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">
            {hasActiveFilters ? 'No Matching CRL Settings Found' : 'No CRL Settings'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters ? 'Try adjusting your filters.' : 'CRL settings are created along with each Certification Authority.'}
          </p>
        </div>
      )}

      {viewedCaId && (
        <CrlViewerSheet
          open={isViewerOpen}
          onOpenChange={setIsViewerOpen}
          defaultUrl={getCrlUrl(viewedCaId)}
          downloadFileName={`${viewedCaId}.crl`}
          presentation="docked"
          ca={viewedCa}
        />
      )}

      <AlertDialog open={caIdToPurge !== null} onOpenChange={(open) => !open && setCaIdToPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Archived CRL Settings</AlertDialogTitle>
            <AlertDialogDescription>
              The CRL of the deleted CA <code className="font-mono">{caIdToPurge}</code> will stop being served, so anyone checking
              its certificates against it will no longer find it. The CRLs already published stay in the CRL bucket. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPurge} className={cn(buttonVariants({ variant: 'destructive' }))}>
              Delete CRL Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
