'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listPolicies, deletePolicy } from '@/lib/authz-api';
import type { Policy, PolicyFilters, PolicySortField } from '@/types/authz';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { SortableTableHead } from '@/components/shared/SortableTableHead';
import {
  PolicyFilterBar,
  defaultPolicyDateFilterValue,
} from '@/components/shared/filters/PolicyFilterBar';
import type { GenericDateFilterValue } from '@/components/shared/filters/GenericFilterBar';
import { toApiDateFilter } from '@/lib/date-filter';
import { useBookmarkList } from '@/hooks/useBookmarkList';
import { BookmarkPaginationFooter } from '@/components/shared/BookmarkPaginationFooter';
import { AuthzRowActionsMenu } from '@/components/authz/AuthzRowActionsMenu';

type SortDirection = 'asc' | 'desc';
interface SortConfig { column: PolicySortField; direction: SortDirection }

const DATE_COLUMNS = new Set<PolicySortField>(['created_at', 'updated_at']);

const getPolicyListErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Failed to load policies';

export default function PoliciesPage() {
  const router = useRouter();

  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'created_at', direction: 'desc' });
  const [pageSize, setPageSize] = useState<string>('25');
  const [searchTerm, setSearchTerm] = useState('');
  const [idFilter, setIdFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [createdAtFilter, setCreatedAtFilter] = useState<GenericDateFilterValue>(defaultPolicyDateFilterValue);
  const [updatedAtFilter, setUpdatedAtFilter] = useState<GenericDateFilterValue>(defaultPolicyDateFilterValue);

  const [policyToDelete, setPolicyToDelete] = useState<Policy | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filters = useMemo<PolicyFilters>(() => {
    const nextFilters: PolicyFilters = {};
    const trimmedSearchTerm = searchTerm.trim();
    const trimmedIdFilter = idFilter.trim();
    const trimmedDescriptionFilter = descriptionFilter.trim();
    const createdAt = toApiDateFilter(createdAtFilter);
    const updatedAt = toApiDateFilter(updatedAtFilter);

    if (trimmedSearchTerm) nextFilters.name = trimmedSearchTerm;
    if (trimmedIdFilter) nextFilters.id = trimmedIdFilter;
    if (trimmedDescriptionFilter) nextFilters.description = trimmedDescriptionFilter;
    if (createdAt) nextFilters.created_at = createdAt;
    if (updatedAt) nextFilters.updated_at = updatedAt;

    return nextFilters;
  }, [
    createdAtFilter,
    descriptionFilter,
    idFilter,
    searchTerm,
    updatedAtFilter,
  ]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const loadPolicyPage = useCallback(({ pageSize, bookmark, sortConfig, filters }: {
    pageSize: number;
    bookmark?: string;
    sortConfig: SortConfig;
    filters?: PolicyFilters;
  }) => listPolicies({
    pageSize,
    bookmark,
    sortBy: sortConfig.column,
    sortMode: sortConfig.direction,
    ...(filters ? { filters } : {}),
  }), []);

  const {
    items: policies,
    isLoading,
    error,
    setError,
    currentPageIndex,
    bookmarkStack,
    nextTokenFromApi,
    handleNextPage,
    handlePreviousPage,
    handleRefresh,
    replaceItems: replacePolicies,
  } = useBookmarkList<Policy, SortConfig, PolicyFilters>({
    pageSize,
    sortConfig,
    filters,
    hasActiveFilters,
    loadPage: loadPolicyPage,
    getErrorMessage: getPolicyListErrorMessage,
  });

  const requestSort = (column: PolicySortField) => {
    setSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  const handleDelete = async () => {
    if (!policyToDelete) return;
    setIsDeleting(true);
    try {
      await deletePolicy(policyToDelete.id);
      replacePolicies(prev => prev.filter(p => p.id !== policyToDelete.id));
      setIsDeleteDialogOpen(false);
      setPolicyToDelete(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete policy');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && policies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Policies...</p>
      </div>
    );
  }

  return (
    <BreadcrumbPage
      className="space-y-6 pb-8"
      items={[{ label: 'Home', href: '/' }, { label: 'Authorization', href: '/authz' }, { label: 'Policies' }]}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
            <ScrollText className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Authorization Policies</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage access control policies and rules.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => router.push('/authz/policies/new')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create Policy
          </Button>
        </div>
      </div>

      <PolicyFilterBar
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
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

      {!isLoading && !error && policies.length === 0 ? (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">
            {hasActiveFilters ? 'No Matching Policies' : 'No Policies Found'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'No authorization policies match the current filters.'
              : 'No authorization policies have been created yet.'}
          </p>
          {!hasActiveFilters && (
            <Button onClick={() => router.push('/authz/policies/new')} className="mt-4">
              <PlusCircle className="mr-2 h-4 w-4" /> Create Policy
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
                    title="Name"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    align="left"
                  />
                  <TableHead>Description</TableHead>
                  <SortableTableHead
                    column="created_at"
                    title="Created"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    isDateColumn={DATE_COLUMNS.has('created_at')}
                  />
                  <SortableTableHead
                    column="updated_at"
                    title="Updated"
                    activeColumn={sortConfig.column}
                    direction={sortConfig.direction}
                    onSort={requestSort}
                    isDateColumn={DATE_COLUMNS.has('updated_at')}
                  />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => router.push(`/authz/policies/details?policy_id=${policy.id}`)}
                        className="text-left text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
                      >
                        {policy.name}
                      </button>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{policy.id}</p>
                    </TableCell>
                    <TableCell>
                      {policy.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2 max-w-xs">{policy.description}</p>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <DateDisplay date={policy.created_at} showRelative className="items-center" />
                    </TableCell>
                    <TableCell className="text-center">
                      <DateDisplay date={policy.updated_at} showRelative className="items-center" />
                    </TableCell>
                    <TableCell className="text-right">
                      <AuthzRowActionsMenu
                        label="Policy Actions"
                        onView={() => router.push(`/authz/policies/details?policy_id=${policy.id}`)}
                        onEdit={() => router.push(`/authz/policies/edit?policy_id=${policy.id}`)}
                        onDelete={() => { setPolicyToDelete(policy); setIsDeleteDialogOpen(true); }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <BookmarkPaginationFooter
            pageSizeId="policyPageSize"
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

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { setIsDeleteDialogOpen(open); if (!open) setPolicyToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{policyToDelete?.name}&quot;? This action cannot be undone.
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
