'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from '@/lib/router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { AlertTriangle, Download, Eye, Loader2, MoreVertical, RefreshCw, Search, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { CrlSettingsStatusBadge } from '@/components/shared/VaSettingsCard';
import { CrlViewerSheet } from '@/components/shared/CrlViewerSheet';
import { useCrlSettingsList, type CrlSettingsListItem } from '@/hooks/useCrlSettingsList';
import { isZeroOrZeroDuration } from '@/lib/duration';
import { cn } from '@/lib/utils';
import { getCrlUrl, type CrlSettingsStatus } from '@/lib/va-api';

type StatusFilter = 'ALL' | CrlSettingsStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'FINAL', label: 'Final' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const caVaTabHref = (caId: string) =>
  `/certificate-authorities/details?caId=${encodeURIComponent(caId)}&tab=validation-authority`;

const matchesSearch = ({ settings, caName }: CrlSettingsListItem, term: string) =>
  settings.ca_id.toLowerCase().includes(term) || (caName?.toLowerCase().includes(term) ?? false);

export function VerificationAuthoritiesClient() {
  const router = useRouter();
  const { items, isLoading, error, busyCaId, reload, download, purge } = useCrlSettingsList();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [caIdToPurge, setCaIdToPurge] = useState<string | null>(null);
  // The CA whose CRL the viewer shows; kept after closing so the sheet does not empty while it animates out.
  const [viewedCaId, setViewedCaId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter((item) =>
      (statusFilter === 'ALL' || item.settings.status === statusFilter) && (!term || matchesSearch(item, term)),
    );
  }, [items, searchTerm, statusFilter]);

  const hasActiveFilters = searchTerm.trim() !== '' || statusFilter !== 'ALL';

  const confirmPurge = () => {
    if (caIdToPurge) void purge(caIdToPurge);
    setCaIdToPurge(null);
  };

  return (
    <BreadcrumbPage className="space-y-6 pb-8" items={[{ label: 'Home', href: '/' }, { label: 'Verification Authorities' }]}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Verification Authorities</h1>
            <p className="text-sm text-muted-foreground mt-1">
              CRL settings and latest CRL of every Certification Authority, including those of deleted ones, whose last CRL is still served.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <Button onClick={reload} variant="secondary" disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-grow w-full space-y-1.5">
          <Label htmlFor="va-filter">Filter by CA Name or ID</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="va-filter"
              placeholder="e.g., Root CA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="w-full sm:w-[180px] space-y-1.5">
          <Label htmlFor="va-status-filter">Status</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger id="va-status-filter" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 p-4 sm:p-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading CRL settings...</p>
        </div>
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
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[110px] text-center">CRL Version</TableHead>
                <TableHead className="w-[180px] text-center">Valid From</TableHead>
                <TableHead className="w-[180px] text-center">Valid Until</TableHead>
                <TableHead className="hidden lg:table-cell w-[140px]">Refresh Interval</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map(({ settings, caName }) => {
                const caId = settings.ca_id;
                const isArchived = settings.status === 'ARCHIVED';
                const busy = busyCaId === caId;
                const refreshInterval = settings.crl_options.refresh_interval;
                return (
                  <TableRow key={caId}>
                    <TableCell>
                      <div className="min-w-0">
                        {isArchived ? (
                          <p className="font-medium text-muted-foreground">Deleted CA</p>
                        ) : (
                          <Button
                            variant="link"
                            className="font-medium truncate p-0 h-auto text-left"
                            onClick={() => router.push(caVaTabHref(caId))}
                            title={`Configure the CRL of ${caName ?? caId}`}
                          >
                            {caName ?? caId}
                          </Button>
                        )}
                        {(isArchived || caName) && (
                          <p className="font-mono text-xs text-muted-foreground break-all">{caId}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><CrlSettingsStatusBadge status={settings.status} /></TableCell>
                    <TableCell className="text-center">
                      {settings.latest_crl ? settings.latest_crl.version : <span className="text-xs text-muted-foreground">N/A</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {settings.latest_crl ? (
                        <DateDisplay date={settings.latest_crl.valid_from} className="text-xs items-center" relativeClassName="text-xs" />
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {settings.latest_crl ? (
                        <DateDisplay date={settings.latest_crl.valid_until} className="text-xs items-center" relativeClassName="text-xs" />
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {isZeroOrZeroDuration(refreshInterval) ? 'Disabled' : refreshInterval || 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                            <span className="sr-only">CRL Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isArchived && (
                            <DropdownMenuItem onClick={() => router.push(caVaTabHref(caId))}>
                              <Settings className="mr-2 h-4 w-4" /> Configure CRL
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { setViewedCaId(caId); setIsViewerOpen(true); }}>
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
