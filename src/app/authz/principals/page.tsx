'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, AlertCircle, Eye, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { listPrincipals, createPrincipal, deletePrincipal, updatePrincipal } from '@/lib/authz-api';
import type { Principal, PrincipalType } from '@/types/authz';

export default function PrincipalsPage() {
  const router = useRouter();
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPrincipal, setSelectedPrincipal] = useState<Principal | null>(null);
  const [formData, setFormData] = useState({
    id: crypto.randomUUID(),
    name: '',
    type: 'api_key' as PrincipalType,
    active: true,
  });
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
    setFormData({
      id: crypto.randomUUID(),
      name: '',
      type: 'api_key',
      active: true,
    });
    setOpenDialog(true);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      // Default auth config based on type
      let authConfig: any = {};
      if (formData.type === 'api_key') {
        authConfig = { apiKeyHash: '' };
      } else if (formData.type === 'oidc') {
        authConfig = { issuer: '', claims: [] };
      } else if (formData.type === 'x509') {
        authConfig = { caFingerprint: '', matchMode: 'any_from_ca' };
      }

      await createPrincipal({
        id: formData.id,
        name: formData.name,
        type: formData.type,
        authConfig,
        active: formData.active,
      });
      setOpenDialog(false);
      loadPrincipals();
    } catch (err: any) {
      setError(err.message || 'Failed to create principal');
    } finally {
      setSubmitting(false);
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Principals</h1>
          <p className="text-muted-foreground mt-2">
            Manage authentication principals and identities
          </p>
        </div>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button onClick={handleCreatePrincipal}>
              <Plus className="mr-2 h-4 w-4" />
              Create Principal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Principal</DialogTitle>
              <DialogDescription>
                Add a new authentication principal
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Principal Name</Label>
                <Input
                  id="name"
                  placeholder="Enter principal name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Principal Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: PrincipalType) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="oidc">OIDC</SelectItem>
                    <SelectItem value="x509">X.509 Certificate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, active: checked })
                  }
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpenDialog(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Principal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Principals</h2>
          <p className="text-sm text-muted-foreground">
            {principals.length} {principals.length === 1 ? 'principal' : 'principals'} configured
          </p>
        </div>
        <Table>
          <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {principals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No principals found. Create your first principal to get started.
                  </TableCell>
                </TableRow>
              ) : (
                principals.map((principal) => (
                  <TableRow key={principal.id}>
                    <TableCell className="font-medium">{principal.name}</TableCell>
                    <TableCell>
                      <Badge variant={getPrincipalTypeColor(principal.type)}>
                        {principal.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {principal.active ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-400" />
                        )}
                        <span className={principal.active ? 'text-green-600' : 'text-gray-400'}>
                          {principal.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(principal.createdAt).toLocaleDateString()}
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
