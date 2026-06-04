'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  PlusCircle,
  RefreshCw,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  UserCheck,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listPrincipals, deletePrincipal } from '@/lib/authz-api';
import type { Principal, PrincipalType } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

const PRINCIPAL_TYPE_LABEL: Record<PrincipalType, string> = {
  oidc: 'OIDC',
  x509: 'X.509',
};

export default function PrincipalsPage() {
  const router = useRouter();

  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [principalToDelete, setPrincipalToDelete] = useState<Principal | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadPrincipals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listPrincipals();
      setPrincipals(data.principals);
    } catch (err: any) {
      setError(err.message || 'Failed to load principals');
      setPrincipals([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrincipals();
  }, [loadPrincipals]);

  const handleDelete = async () => {
    if (!principalToDelete) return;
    setIsDeleting(true);
    try {
      await deletePrincipal(principalToDelete.id);
      setPrincipals(prev => prev.filter(p => p.id !== principalToDelete.id));
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
          <Button variant="secondary" onClick={loadPrincipals} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => router.push('/authz/principals/new')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create Principal
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <Button variant="link" onClick={loadPrincipals} className="p-0 h-auto">
              Try again?
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && principals.length === 0 ? (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">No Principals Found</h3>
          <p className="text-sm text-muted-foreground">
            No authentication principals have been created yet.
          </p>
          <Button onClick={() => router.push('/authz/principals/new')} className="mt-4">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Principal
          </Button>
        </div>
      ) : (
        <div className={cn('space-y-4', isLoading && 'opacity-50 pointer-events-none')}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {principals.map((principal) => (
                  <TableRow key={principal.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => router.push(`/authz/principals/details?principalId=${principal.id}`)}
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
                      <Badge variant="secondary" className="text-xs">
                        {PRINCIPAL_TYPE_LABEL[principal.type] ?? principal.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={principal.active ? 'default' : 'secondary'} className="text-xs">
                        {principal.active ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {principal.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DateDisplay date={principal.createdAt} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Principal Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/authz/principals/details?principalId=${principal.id}`)}
                          >
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/authz/principals/edit?principalId=${principal.id}`)}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => { setPrincipalToDelete(principal); setIsDeleteDialogOpen(true); }}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
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
