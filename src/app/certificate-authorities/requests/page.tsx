

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, FileSignature, AlertTriangle, MoreVertical, Trash2, Fingerprint, Download, PlusCircle, ShieldCheck, ArrowLeft, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ViewCsrModal } from '@/components/ca/requests/ViewCsrModal';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchCaRequests, deleteCaRequest, type CACertificateRequest } from '@/lib/ca-data';


type SortableColumn = 'id' | 'subject' | 'status' | 'creation_ts';
type SortDirection = 'asc' | 'desc';
interface SortConfig {
    column: SortableColumn;
    direction: SortDirection;
}

const StatusBadge: React.FC<{ status: CACertificateRequest['status'] }> = ({ status }) => {
  let badgeClass = "";
  switch (status) {
    case 'PENDING':
      badgeClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-700/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700";
      break;
    case 'ISSUED':
      badgeClass = "bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700";
      break;
    default:
      badgeClass = "bg-muted text-muted-foreground border-border";
  }
  return <Badge variant="outline" className={cn("text-xs capitalize", badgeClass)}>{status.toLowerCase()}</Badge>;
};

export default function CaRequestsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const [requests, setRequests] = useState<CACertificateRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtering, Sorting, Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<'id' | 'subject'>('subject');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ISSUED'>('ALL');
  const [pageSize, setPageSize] = useState('9');
  const [bookmarkStack, setBookmarkStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextTokenFromApi, setNextTokenFromApi] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ column: 'creation_ts', direction: 'desc' });
  
  const [selectedRequestForCsrView, setSelectedRequestForCsrView] = useState<CACertificateRequest | null>(null);
  const [isCsrModalOpen, setIsCsrModalOpen] = useState(false);
  
  // State for delete dialog
  const [requestToDelete, setRequestToDelete] = useState<CACertificateRequest | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset pagination when filters or sorting change
  useEffect(() => {
    setCurrentPageIndex(0);
    setBookmarkStack([null]);
  }, [pageSize, debouncedSearchTerm, searchField, statusFilter, sortConfig]);

  const fetchRequests = useCallback(async (bookmarkToFetch: string | null) => {
    if (!isAuthenticated() || !user?.access_token) {
      if (!authLoading) setError("User not authenticated.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      
      // Sorting
      if (sortConfig) {
          const apiSortColumn = sortConfig.column === 'subject' ? 'subject.common_name' : sortConfig.column;
          params.append('sort_by', apiSortColumn);
          params.append('sort_mode', sortConfig.direction);
      } else {
          params.append('sort_by', 'creation_ts');
          params.append('sort_mode', 'desc');
      }

      // Pagination
      params.append('page_size', pageSize);
      if (bookmarkToFetch) {
        params.append('bookmark', bookmarkToFetch);
      }

      // Filtering
      const filtersToApply: string[] = [];
      if (debouncedSearchTerm.trim() !== '') {
        const field = searchField === 'subject' ? 'subject.common_name' : 'id';
        filtersToApply.push(`${field}[contains]${debouncedSearchTerm.trim()}`);
      }
      if (statusFilter !== 'ALL') {
        filtersToApply.push(`status[equal]${statusFilter}`);
      }
      filtersToApply.forEach(f => params.append('filter', f));
      
      const data = await fetchCaRequests(params, user.access_token);
      setRequests(data.list || []);
      setNextTokenFromApi(data.next || null);

    } catch (err: any) {
      setError(err.message);
      setRequests([]);
      setNextTokenFromApi(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, authLoading, toast, sortConfig, pageSize, debouncedSearchTerm, searchField, statusFilter]);

  useEffect(() => {
    if (!authLoading && isAuthenticated()) {
      fetchRequests(bookmarkStack[currentPageIndex]);
    }
  }, [authLoading, isAuthenticated, bookmarkStack, currentPageIndex, fetchRequests]);

  const handleNextPage = () => {
    if (isLoading || !nextTokenFromApi) return;
    const potentialNextPageIndex = currentPageIndex + 1;
    if (potentialNextPageIndex < bookmarkStack.length) {
      setCurrentPageIndex(potentialNextPageIndex);
    } else {
      setBookmarkStack(prev => [...prev, nextTokenFromApi]);
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (isLoading || currentPageIndex === 0) return;
    setCurrentPageIndex(prev => prev - 1);
  };

  const handleRefresh = () => {
    fetchRequests(bookmarkStack[currentPageIndex]);
  };

  const handleViewCsr = (request: CACertificateRequest) => {
    setSelectedRequestForCsrView(request);
    setIsCsrModalOpen(true);
  };
  
  const handleDownloadCsr = (request: CACertificateRequest) => {
    if (!request.csr) {
        toast({ title: "Error", description: "No CSR data available for this request.", variant: "destructive" });
        return;
    }
    try {
        const pemContent = window.atob(request.csr);
        const blob = new Blob([pemContent], { type: 'application/x-pem-file' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${request.subject.common_name || request.id}.csr`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "CSR Downloaded", description: `The CSR for "${request.subject.common_name}" has started downloading.` });
    } catch (error) {
        toast({ title: "Download Failed", description: "Failed to decode or download the CSR.", variant: "destructive" });
        console.error("CSR download error:", error);
    }
  };

  const handleDeleteRequest = async () => {
    if (!requestToDelete || !user?.access_token) {
      toast({ title: "Error", description: "Request details or authentication missing.", variant: "destructive" });
      return;
    }
    setIsDeleting(true);
    try {
      await deleteCaRequest(requestToDelete.id, user.access_token);

      toast({
        title: "Request Deleted",
        description: `Request for "${requestToDelete.subject.common_name}" has been deleted.`,
        variant: "default",
      });
      setRequestToDelete(null); // Close dialog by resetting state
      handleRefresh(); // Refresh the list
    } catch (error: any) {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };


  if (authLoading && requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Authenticating...</p>
      </div>
    );
  }
  
  const hasActiveFilters = debouncedSearchTerm || statusFilter !== 'ALL';
  const statusOptions = [
    { label: 'All Statuses', value: 'ALL' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Issued', value: 'ISSUED' },
  ];

  const content = (
    <>
      {isLoading && requests.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading requests...</p>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Requests</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : requests.length > 0 ? (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", isLoading && "opacity-50")}>
            {requests.map((req) => (
            <Card key={req.id} className="flex flex-col shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex-grow min-w-0">
                            <CardTitle className="truncate text-lg" title={req.subject.common_name}>
                                {req.subject.common_name}
                            </CardTitle>
                            <CardDescription className="mt-1">
                                ID: <span className="font-mono text-xs">{req.id}</span>
                            </CardDescription>
                            <CardDescription className="flex items-start gap-1.5 mt-1" title={req.fingerprint}>
                                <Fingerprint className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5"/>
                                <span className="font-mono text-xs break-all">{req.fingerprint}</span>
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge status={req.status} />
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">More actions for request {req.id}</span>
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewCsr(req)}>
                                    <FileSignature className="mr-2 h-4 w-4" />
                                    View CSR
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadCsr(req)}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download CSR
                                </DropdownMenuItem>
                                {req.status === 'PENDING' && (
                                    <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => router.push(`/certificate-authorities/new/approve-request?requestId=${req.id}`)}>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        <span>Import CA Certificate</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setRequestToDelete(req)}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Request
                                    </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Key Type</span>
                        <span className="font-medium">{req.key_metadata.type} {req.key_metadata.bits}-bit</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Engine</span>
                        <Badge variant="outline">{req.engine_id}</Badge>
                    </div>
                </CardContent>
                <CardFooter className="border-t pt-3 pb-3 text-xs text-muted-foreground">
                    <span>Created: {format(parseISO(req.creation_ts), 'MMM dd, yyyy HH:mm')}</span>
                </CardFooter>
            </Card>
        ))}
        </div>
      ) : (
        <div className="mt-6 p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
          <h3 className="text-lg font-semibold text-muted-foreground">{hasActiveFilters ? "No Requests Found" : "No CA Requests Found"}</h3>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters ? "Try adjusting your filters." : "There are no pending or historical Certification Authority requests."}
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6 w-full pb-8">
      <Button variant="outline" onClick={() => router.push('/certificate-authorities')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certification Authorities
      </Button>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileSignature className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Certification Authority Requests</h1>
        </div>
        <div className="flex items-center space-x-2">
            <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={() => router.push('/certificate-authorities/new/generate-csr')}>
                <PlusCircle className="mr-2 h-4 w-4" /> Create Request
            </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        View and manage pending and completed requests for new Certification Authorities.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div className="relative col-span-1">
            <Label htmlFor="reqSearchTermInput">Search Term</Label>
            <Search className="absolute left-3 top-[calc(50%+6px)] -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
                id="reqSearchTermInput"
                type="text"
                placeholder="Filter by ID or Subject..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 mt-1"
                disabled={isLoading || authLoading}
            />
        </div>
        <div className="col-span-1">
            <Label htmlFor="reqSearchFieldSelect">Search In</Label>
            <Select value={searchField} onValueChange={(value: 'id' | 'subject') => setSearchField(value)} disabled={isLoading || authLoading}>
                <SelectTrigger id="reqSearchFieldSelect" className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="id">Request ID</SelectItem>
                    <SelectItem value="subject">Subject</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <div className="col-span-1">
            <Label htmlFor="reqStatusFilterSelect">Status</Label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'ALL' | 'PENDING' | 'ISSUED')} disabled={isLoading || authLoading}>
                <SelectTrigger id="reqStatusFilterSelect" className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {statusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
         <div className="col-span-1">
            <Label htmlFor="reqSortSelect">Sort By</Label>
            <Select
                value={`${sortConfig?.column ?? 'creation_ts'}-${sortConfig?.direction ?? 'desc'}`}
                onValueChange={(value) => {
                const [column, direction] = value.split('-') as [SortableColumn, SortDirection];
                setSortConfig({ column, direction });
                }}
                disabled={isLoading || authLoading}
            >
                <SelectTrigger id="reqSortSelect" className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="creation_ts-desc">Newest First</SelectItem>
                    <SelectItem value="creation_ts-asc">Oldest First</SelectItem>
                    <SelectItem value="subject-asc">Subject (A-Z)</SelectItem>
                    <SelectItem value="subject-desc">Subject (Z-A)</SelectItem>
                    <SelectItem value="status-asc">Status</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </div>
      
      {content}

      {(requests.length > 0 || hasActiveFilters) && (
          <div className="flex justify-between items-center mt-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="pageSizeSelectReqList" className="text-sm text-muted-foreground whitespace-nowrap">Page Size:</Label>
                <Select value={pageSize} onValueChange={setPageSize} disabled={isLoading || authLoading}>
                  <SelectTrigger id="pageSizeSelectReqList" className="w-[80px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                  <Button onClick={handlePreviousPage} disabled={isLoading || currentPageIndex === 0} variant="outline">
                      <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <Button onClick={handleNextPage} disabled={isLoading || !nextTokenFromApi} variant="outline">
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
              </div>
          </div>
      )}

      <ViewCsrModal
        isOpen={isCsrModalOpen}
        onOpenChange={setIsCsrModalOpen}
        request={selectedRequestForCsrView}
      />
      
      <AlertDialog open={!!requestToDelete} onOpenChange={(open) => !open && setRequestToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the CA request for "<strong>{requestToDelete?.subject.common_name}</strong>".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRequest}
              className={buttonVariants({ variant: "destructive" })}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
