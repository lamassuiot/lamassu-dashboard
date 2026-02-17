'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRecentCBOMs, deleteCBOM, CBOMItem } from '@/lib/cbom-api';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, Eye, Download, RefreshCw, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CBOMDetailsDialog } from './CBOMDetailsDialog';

export const CBOMList: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cboms, setCboms] = useState<CBOMItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [limit, setLimit] = useState(10);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCbom, setSelectedCbom] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedCbomDetails, setSelectedCbomDetails] = useState<CBOMItem | null>(null);

  const loadCBOMs = async () => {
    if (!user?.access_token) return;

    setIsLoading(true);
    try {
      const data = await fetchRecentCBOMs(limit, user.access_token);
      setCboms(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch CBOMs:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load CBOMs',
        variant: 'destructive',
      });
      setCboms([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCBOMs();
  }, [limit, user]);

  const handleDelete = async () => {
    if (!selectedCbom || !user?.access_token) return;

    try {
      await deleteCBOM(selectedCbom, user.access_token);
      toast({
        title: 'Success',
        description: 'CBOM deleted successfully',
      });
      loadCBOMs();
    } catch (error) {
      console.error('Failed to delete CBOM:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete CBOM',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setSelectedCbom(null);
    }
  };

  const handleViewDetails = (cbom: CBOMItem) => {
    setSelectedCbomDetails(cbom);
    setDetailsDialogOpen(true);
  };

  const handleDownload = (cbom: CBOMItem) => {
    const dataStr = JSON.stringify(cbom.data || cbom, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cbom-${cbom.projectIdentifier}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="limit" className="text-sm font-medium">
            Show:
          </label>
          <Select value={limit.toString()} onValueChange={(val) => setLimit(parseInt(val))}>
            <SelectTrigger id="limit" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">recent CBOMs</span>
        </div>
        <Button variant="outline" size="sm" onClick={loadCBOMs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {cboms.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No CBOMs found</p>
          <p className="text-sm mt-2">Upload or scan a repository to generate your first CBOM</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Identifier</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cboms.map((cbom, index) => (
                <TableRow key={cbom.projectIdentifier || index}>
                  <TableCell className="font-medium">
                    {cbom.projectIdentifier || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    {cbom.timestamp 
                      ? new Date(cbom.timestamp).toLocaleString() 
                      : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(cbom)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(cbom)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCbom(cbom.projectIdentifier);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the CBOM for project &quot;{selectedCbom}&quot;. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedCbomDetails && (
        <CBOMDetailsDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          cbom={selectedCbomDetails}
        />
      )}
    </div>
  );
};
