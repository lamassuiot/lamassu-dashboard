'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  PlusCircle,
  RefreshCw,
  AlertTriangle,
  Loader2,
  UserCheck,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listPrincipals, deletePrincipal } from '@/lib/authz-api';
import type { Principal, PrincipalFilters, PrincipalType, PrincipalSortField } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { SortableTableHead } from '@/components/shared/SortableTableHead';
import {
  PrincipalFilterBar,
  defaultPrincipalDateFilterValue,
  type PrincipalActiveFilter,
} from '@/components/shared/filters/PrincipalFilterBar';
import type { GenericDateFilterValue } from '@/components/shared/filters/GenericFilterBar';
import { toApiDateFilter } from '@/lib/date-filter';
import { useBookmarkList } from '@/hooks/useBookmarkList';
import { BookmarkPaginationFooter } from '@/components/shared/BookmarkPaginationFooter';
import { AuthzRowActionsMenu } from '@/components/authz/AuthzRowActionsMenu';

const PRINCIPAL_TYPE_LABEL: Record<PrincipalType, string> = {
  oidc: 'OIDC',
  x509: 'X.509',
};

const PRINCIPAL_TYPE_CLASSES: Record<PrincipalType, string> = {
  oidc: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  x509: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
};

type SortDirection = 'asc' | 'desc';
interface SortConfig { column: PrincipalSortField; direction: SortDirection }

const DATE_COLUMNS = new Set<PrincipalSortField>(['created_at', 'updated_at']);

const getPrincipalListErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Failed to load principals';

export default function PrincipalsPage() {
  const router = useRouter();

  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'created_at', direction: 'desc' });
  const [pageSize, setPageSize] = useState<string>('25');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilters, setTypeFilters] = useState<PrincipalType[]>([]);
  const [activeFilter, setActiveFilter] = useState<PrincipalActiveFilter>('ALL');
  const [idFilter, setIdFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [createdAtFilter, setCreatedAtFilter] = useState<GenericDateFilterValue>(defaultPrincipalDateFilterValue);
  const [updatedAtFilter, setUpdatedAtFilter] = useState<GenericDateFilterValue>(defaultPrincipalDateFilterValue);

  const [principalToDelete, setPrincipalToDelete] = useState<Principal | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filters = useMemo<PrincipalFilters>(() => {
    const nextFilters: PrincipalFilters = {};
    const trimmedSearchTerm = searchTerm.trim();
    const trimmedIdFilter = idFilter.trim();
    const trimmedDescriptionFilter = descriptionFilter.trim();
    const createdAt = toApiDateFilter(createdAtFilter);
    const updatedAt = toApiDateFilter(updatedAtFilter);

    if (trimmedSearchTerm) nextFilters.name = trimmedSearchTerm;
    if (typeFilters.length > 0) nextFilters.type = typeFilters;
    if (activeFilter !== 'ALL') nextFilters.active = activeFilter === 'true';
    if (trimmedIdFilter) nextFilters.id = trimmedIdFilter;
    if (trimmedDescriptionFilter) nextFilters.description = trimmedDescriptionFilter;
    if (createdAt) nextFilters.created_at = createdAt;
    if (updatedAt) nextFilters.updated_at = updatedAt;

    return nextFilters;
  }, [
    activeFilter,
    createdAtFilter,
    descriptionFilter,
    idFilter,
    searchTerm,
    typeFilters,
    updatedAtFilter,
  ]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const loadPrincipalPage = useCallback(({ pageSize, bookmark, sortConfig, filters }: {
    pageSize: number;
    bookmark?: string;
    sortConfig: SortConfig;
    filters?: PrincipalFilters;
  }) => listPrincipals({
    pageSize,
    bookmark,
    sortBy: sortConfig.column,
    sortMode: sortConfig.direction,
    ...(filters ? { filters } : {}),
  }), []);

  const {
    items: principals,
    isLoading,
    error,
    setError,
    currentPageIndex,
    bookmarkStack,
    nextTokenFromApi,
    handleNextPage,
    handlePreviousPage,
    handleRefresh,
    replaceItems: replacePrincipals,
  } = useBookmarkList<Principal, SortConfig, PrincipalFilters>({
    pageSize,
    sortConfig,
    filters,
    hasActiveFilters,
    loadPage: loadPrincipalPage,
    getErrorMessage: getPrincipalListErrorMessage,
  });

  const requestSort = (column: PrincipalSortField) => {
    setSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  const handleDelete = async () => {
    if (!principalToDelete) return;
    setIsDeleting(true);
    try {
      await deletePrincipal(principalToDelete.id);
      replacePrincipals(prev => prev.filter(p => p.id !== principalToDelete.id));
      setIsDeleteDialogOpen(false);
      setPrincipalToDelete(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete principal');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && principals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Principals...</p>
      </div>
    );
  }

  return (
    <BreadcrumbPage
      className="space-y-6 pb-8"
      items={[{ label: 'Home', href: '/' }, { label: 'Authorization', href: '/authz' }, { label: 'Principals' }]}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <UserCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Principals</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage authentication principals and identities used in authorization policies.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => router.push('/authz/principals/new')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create Principal
          </Button>
        </div>
      </div>

      <PrincipalFilterBar
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        typeFilters={typeFilters}
        onTypeFiltersChange={setTypeFilters}
        activeFilter={activeFilter}
        onActiveFilterChange={setActiveFilter}
        idFilter={idFilter}
        onIdFilterChange={setIdFilter}
        descriptionFilter={descriptionFilter}
        onDescriptionFilterChange={setDescriptionFilter}
        createdAtFilter={createdAtFilter}
        onCreatedAtFilterChange={setCreatedAtFilter}
        updatedAtFilter={updatedAtFilter}
        onUpdatedAtFilterChange={setUpdatedAtFilter}
        disabled={isLoading}
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <Button variant="link" onClick={handleRefresh} className="p-0 h-auto">
              Try again?
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && principals.length === 0 ? (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">
            {hasActiveFilters ? 'No Matching Principals' : 'No Principals Found'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'No authentication principals match the current filters.'
              : 'No authentication principals have been created yet.'}
          </p>
          {!hasActiveFilters && (
            <Button onClick={() => router.push('/authz/principals/new')} className="mt-4">
              <PlusCircle className="mr-2 h-4 w-4" /> Create Principal
            </Button>
          )}
        </div>
      ) : (
        <div className={cn('space-y-4', isLoading && 'opacity-50 pointer-events-none')}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    column="name"
                    title="Principal"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                  />
                  <TableHead className="text-left">Description</TableHead>
                  <SortableTableHead
                    column="type"
                    title="Type"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                  />
                  <SortableTableHead
                    column="active"
                    title="Status"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                  />
                  <SortableTableHead
                    column="created_at"
                    title="Created"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                    isDateColumn={DATE_COLUMNS.has('created_at')}
                  />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {principals.map((principal) => (
                  <TableRow key={principal.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => router.push(`/authz/principals/details?principal_id=${principal.id}`)}
                        className="text-left text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                      >
                        {principal.name}
                      </button>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{principal.id}</p>
                    </TableCell>
                    <TableCell>
                      {principal.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2 max-w-xs">{principal.description}</p>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', PRINCIPAL_TYPE_CLASSES[principal.type])}>
                        {PRINCIPAL_TYPE_LABEL[principal.type] ?? principal.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {principal.active ? (
                        <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 text-xs">
                          <CheckCircle className="h-3 w-3" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <XCircle className="h-3 w-3" /> Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DateDisplay date={principal.created_at} />
                    </TableCell>
                    <TableCell className="text-right">
                      <AuthzRowActionsMenu
                        label="Principal Actions"
                        onView={() => router.push(`/authz/principals/details?principal_id=${principal.id}`)}
                        onEdit={() => router.push(`/authz/principals/edit?principal_id=${principal.id}`)}
                        onDelete={() => { setPrincipalToDelete(principal); setIsDeleteDialogOpen(true); }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <BookmarkPaginationFooter
            pageSizeId="principalPageSize"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            isLoading={isLoading}
            currentPageIndex={currentPageIndex}
            canGoNext={currentPageIndex < bookmarkStack.length - 1 || Boolean(nextTokenFromApi)}
            onPreviousPage={handlePreviousPage}
            onNextPage={handleNextPage}
          />
        </div>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { setIsDeleteDialogOpen(open); if (!open) setPrincipalToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Principal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{principalToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
