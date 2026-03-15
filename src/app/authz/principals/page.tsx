'use client';

import { useEffect, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, AlertCircle, Eye, CheckCircle, XCircle, UserCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { listPrincipals, deletePrincipal, updatePrincipal } from '@/lib/authz-api';
import type { Principal, PrincipalType } from '@/types/authz';
import { DateDisplay } from '@/components/shared/DateDisplay';

export default function PrincipalsPage() {
  const router = useRouter();
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPrincipal, setSelectedPrincipal] = useState<Principal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPrincipals();
  }, []);

  const loadPrincipals = async () => {
    try {
      setLoading(true);
      const data = await listPrincipals();
      setPrincipals(data.principals);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load principals');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePrincipal = () => {
    router.push('/authz/principals/new');
  };

  const handleDelete = async () => {
    if (!selectedPrincipal) return;
    try {
      setSubmitting(true);
      await deletePrincipal(selectedPrincipal.id);
      setDeleteDialogOpen(false);
      setSelectedPrincipal(null);
      loadPrincipals();
    } catch (err: any) {
      setError(err.message || 'Failed to delete principal');
    } finally {
      setSubmitting(false);
    }
  };

  const _handleToggleActive = async (principal: Principal) => {
    try {
      await updatePrincipal(principal.id, { active: !principal.active });
      loadPrincipals();
    } catch (err: any) {
      setError(err.message || 'Failed to update principal');
    }
  };

  const handleViewDetails = (principal: Principal) => {
    router.push(`/authz/principals/details?principalId=${principal.id}`);
  };

  const getPrincipalTypeColor = (type: PrincipalType) => {
    switch (type) {
      case 'api_key':
        return 'default';
      case 'oidc':
        return 'secondary';
      case 'x509':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getPrincipalTypeLabel = (type: PrincipalType) => {
    switch (type) {
      case 'api_key':
        return 'API Key';
      case 'oidc':
        return 'OIDC';
      case 'x509':
        return 'X.509';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <UserCheck className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Principals</h1>
        </div>
        <Button onClick={handleCreatePrincipal}>
          <Plus className="mr-2 h-4 w-4" />
          Create Principal
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage authentication principals and identities.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div>
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
              {principals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No principals found. Create your first principal to get started.
                  </TableCell>
                </TableRow>
              ) : (
                principals.map((principal) => (
                  <TableRow key={principal.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <button
                          onClick={() => handleViewDetails(principal)}
                          className="font-medium text-left hover:underline focus:underline"
                        >
                          {principal.name}
                        </button>
                        <p className="text-sm text-muted-foreground font-mono">{principal.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {principal.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2 max-w-md">{principal.description}</p>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPrincipalTypeColor(principal.type)}>
                        {getPrincipalTypeLabel(principal.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={principal.active ? 'default' : 'secondary'}>
                        {principal.active ? (
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                        )}
                        {principal.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DateDisplay date={principal.createdAt} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetails(principal)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedPrincipal(principal);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Principal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the principal &quot;{selectedPrincipal?.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
