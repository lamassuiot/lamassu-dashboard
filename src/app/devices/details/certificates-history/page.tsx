'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format, formatDistanceStrict, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { getDisplayDateFormat } from '@/lib/config';
import { ApiStatusBadge } from '@/components/shared/ApiStatusBadge';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { useDeviceDetails, type CertificateHistoryEntry, getCertSubjectCommonName } from '../DeviceContext';

export default function CertificatesHistoryPage() {
  const { device } = useDeviceDetails();
  const router = useRouter();

  const [fullList, setFullList] = useState<{ version: string; serialNumber: string }[]>([]);
  const [history, setHistory] = useState<CertificateHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!device?.identity?.versions) { setFullList([]); setIsLoading(false); return; }
    const sorted = Object.entries(device.identity.versions)
      .map(([version, serialNumber]) => ({ version, serialNumber }))
      .sort((a, b) => parseInt(b.version, 10) - parseInt(a.version, 10));
    setFullList(sorted);
    setCurrentPage(1);
  }, [device?.identity?.versions]);

  useEffect(() => {
    if (fullList.length === 0) { setHistory([]); setIsLoading(false); return; }

    const fetchPage = async () => {
      setIsLoading(true);
      setError(null);
      const pageItems = fullList.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      if (!pageItems.length) { setHistory([]); setIsLoading(false); return; }
      try {
        const entries = await Promise.all(
          pageItems.map(async ({ version, serialNumber }) => {
            const { certificates } = await fetchIssuedCertificates({
              apiQueryString: `filter=serial_number[equal_ignorecase]${serialNumber}&page_size=1`,
            });
            const cert = certificates[0];
            if (!cert) return null;
            const isSuperseded = device?.identity ? parseInt(version, 10) < device.identity.active_version : false;
            return {
              version, serialNumber: cert.serialNumber, apiStatus: cert.apiStatus,
              revocationReason: cert.revocationReason, revocationTimestamp: cert.revocationTimestamp,
              isSuperseded, commonName: getCertSubjectCommonName(cert.subject),
              ca: getCertSubjectCommonName(cert.issuer), issuerCaId: cert.issuerCaId,
              validFrom: cert.validFrom, validTo: cert.validTo,
              lifespan: formatDistanceStrict(parseISO(cert.validTo), parseISO(cert.validFrom)),
            } as CertificateHistoryEntry;
          })
        );
        setHistory(entries.filter((e): e is CertificateHistoryEntry => e !== null));
      } catch (err: any) {
        setError(err.message || 'Failed to load certificate history.');
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPage();
  }, [fullList, currentPage, pageSize, device?.identity]);

  const totalPages = Math.ceil(fullList.length / pageSize);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading certificate history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading History</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!history.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">This device does not have an identity with a certificate history.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Serial Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Common Name</TableHead>
              <TableHead className="hidden lg:table-cell">CA</TableHead>
              <TableHead className="hidden lg:table-cell text-center">Valid From</TableHead>
              <TableHead className="hidden lg:table-cell text-center">Valid To</TableHead>
              <TableHead className="hidden md:table-cell">Lifespan</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((cert) => (
              <TableRow key={cert.version} className={cn(cert.isSuperseded && 'opacity-60')}>
                <TableCell>{cert.version}</TableCell>
                <TableCell className="font-mono text-xs">
                  <Button variant="link" className="h-auto p-0 text-xs"
                    onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}>
                    <IdentifierDisplay value={cert.serialNumber} className="text-xs" />
                  </Button>
                </TableCell>
                <TableCell>
                  <ApiStatusBadge status={cert.apiStatus} />
                  {cert.apiStatus === 'REVOKED' && (
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {cert.revocationReason && <p className="max-w-[120px] truncate" title={cert.revocationReason}>{cert.revocationReason}</p>}
                      {cert.revocationTimestamp && <p className="max-w-[120px] truncate">{format(parseISO(cert.revocationTimestamp), 'dd/MM/yy HH:mm')}</p>}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">{cert.commonName}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  {cert.issuerCaId ? (
                    <Button variant="link" className="h-auto p-0 text-left font-normal leading-tight whitespace-normal"
                      onClick={() => router.push(`/certificate-authorities/details?caId=${cert.issuerCaId}`)}>
                      {cert.ca}
                    </Button>
                  ) : cert.ca}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <DateDisplay date={cert.validFrom} formatString={getDisplayDateFormat()} className="text-xs" />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <DateDisplay date={cert.validTo} formatString={getDisplayDateFormat()} className="text-xs" highlightExpired />
                </TableCell>
                <TableCell className="hidden md:table-cell">{cert.lifespan}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" title="View Certificate Details"
                    onClick={() => router.push(`/certificates/details?certificateId=${cert.serialNumber}`)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Label htmlFor="pageSizeSelect" className="text-sm text-muted-foreground">Page Size:</Label>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }} disabled={isLoading}>
            <SelectTrigger id="pageSizeSelect" className="h-9 w-[70px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
          <Button onClick={() => setCurrentPage(p => p - 1)} disabled={isLoading || currentPage === 1} variant="secondary">
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <Button onClick={() => setCurrentPage(p => p + 1)} disabled={isLoading || currentPage >= totalPages} variant="secondary">
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
