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
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listPolicies, deletePolicy } from '@/lib/authz-api';
import type { Policy } from '@/types/authz';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

export default function PoliciesPage() {
  const router = useRouter();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [policyToDelete, setPolicyToDelete] = useState<Policy | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadPolicies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listPolicies();
      setPolicies(data.policies);
    } catch (err: any) {
      setError(err.message || 'Failed to load policies');
      setPolicies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const handleDelete = async () => {
    if (!policyToDelete) return;
    setIsDeleting(true);
    try {
      await deletePolicy(policyToDelete.id);
      setPolicies(prev => prev.filter(p => p.id !== policyToDelete.id));
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
          <Button variant="secondary" onClick={loadPolicies} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => router.push('/authz/policies/new')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create Policy
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <Button variant="link" onClick={loadPolicies} className="p-0 h-auto">
              Try again?
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && policies.length === 0 ? (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">No Policies Found</h3>
          <p className="text-sm text-muted-foreground">
            No authorization policies have been created yet.
          </p>
          <Button onClick={() => router.push('/authz/policies/new')} className="mt-4">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Policy
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
                  <TableHead>Rules</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">
                      <button
                        onClick={() => router.push(`/authz/policies/details?policyId=${policy.id}`)}
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
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Policy Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/authz/policies/details?policyId=${policy.id}`)}
                          >
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/authz/policies/edit?policyId=${policy.id}`)}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => { setPolicyToDelete(policy); setIsDeleteDialogOpen(true); }}
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
