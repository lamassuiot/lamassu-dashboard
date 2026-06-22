'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { FileSearch, FilePlus2, HardDrive, UploadCloud, FileText, ShieldAlert, GitFork } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isPast, parseISO } from 'date-fns';

interface CaTableViewProps {
  cas: CA[];
  router: ReturnType<typeof useRouter>;
  allCryptoEngines: ApiCryptoEngine[];
}

function flattenCAs(cas: CA[], depth = 0): (CA & { _depth: number })[] {
  const result: (CA & { _depth: number })[] = [];
  for (const ca of cas) {
    result.push({ ...ca, _depth: depth });
    if (ca.children && ca.children.length > 0) {
      result.push(...flattenCAs(ca.children, depth + 1));
    }
  }
  return result;
}

const STATUS_STYLES: Record<CA['status'], string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
  expired: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  revoked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  unknown: 'bg-muted text-muted-foreground border-border',
};

const CA_TYPE_LABELS: Record<string, string> = {
  MANAGED: 'Managed',
  IMPORTED: 'Imported',
  EXTERNAL: 'External',
};

export const CaTableView: React.FC<CaTableViewProps> = ({ cas, router, allCryptoEngines }) => {
  const rows = useMemo(() => flattenCAs(cas), [cas]);

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-[22%]">Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Issuer</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Engine</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((ca) => {
            const isExpiredOrRevoked = ca.status === 'expired' || ca.status === 'revoked' || isPast(parseISO(ca.expires));
            const engine = allCryptoEngines.find(e => e.id === ca.kmsKeyId);
            const subjectCN = ca.subjectDN?.common_name ?? ca.name;
            const subjectOrg = ca.subjectDN?.organization;
            const issuerCN = ca.issuerDN?.common_name;
            const isSelfSigned = !issuerCN || issuerCN === subjectCN;
            const childCount = ca.children?.length ?? 0;

            return (
              <TableRow
                key={ca.id}
                className="cursor-pointer"
                onClick={() => router.push(`/certificate-authorities/details?caId=${ca.id}`)}
              >
                {/* Name */}
                <TableCell>
                  <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: ca._depth * 16 }}>
                    {isExpiredOrRevoked ? (
                      <ShieldAlert className="h-4 w-4 text-destructive flex-shrink-0" />
                    ) : engine ? (
                      <CryptoEngineViewer engine={engine} iconOnly className="h-4 w-4 flex-shrink-0" />
                    ) : ca.kmsKeyId ? (
                      <HardDrive className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : (
                      <HardDrive className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={cn('text-sm font-medium truncate', isExpiredOrRevoked && 'text-muted-foreground')}>
                        {ca.name}
                      </p>
                      {childCount > 0 && (
                        <p className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <GitFork className="h-3 w-3" />{childCount} sub-CA{childCount !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Badge variant="secondary" className={cn('text-xs capitalize', STATUS_STYLES[ca.status])}>
                    {ca.status}
                  </Badge>
                </TableCell>

                {/* Subject */}
                <TableCell>
                  <div className="min-w-0">
                    <p className="text-sm truncate max-w-[160px]">{subjectCN}</p>
                    {subjectOrg && (
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">{subjectOrg}</p>
                    )}
                  </div>
                </TableCell>

                {/* Issuer */}
                <TableCell className="text-sm text-muted-foreground">
                  {isSelfSigned ? (
                    <span className="italic">Self-signed</span>
                  ) : (
                    <span className="truncate max-w-[140px] block">{issuerCN}</span>
                  )}
                </TableCell>

                {/* Serial */}
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  <span title={ca.serialNumber}>
                    {ca.serialNumber ? `${ca.serialNumber.slice(0, 12)}…` : '—'}
                  </span>
                </TableCell>

                {/* Type */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
                    {ca.caType === 'IMPORTED' ? (
                      <UploadCloud className="h-3.5 w-3.5 flex-shrink-0" />
                    ) : ca.caType === 'EXTERNAL' ? (
                      <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    ) : null}
                    {CA_TYPE_LABELS[ca.caType ?? ''] ?? ca.caType ?? '—'}
                  </div>
                </TableCell>

                {/* Key algorithm */}
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {ca.keyAlgorithm || '—'}
                </TableCell>

                {/* Engine */}
                <TableCell>
                  {engine ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CryptoEngineViewer engine={engine} iconOnly className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate max-w-[100px]">{engine.name || engine.type}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Expires */}
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  <DateDisplay date={ca.expires} showRelative={false} />
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                     
                      className="h-7 px-2"
                      onClick={() => router.push(`/certificate-authorities/details?caId=${ca.id}`)}
                      title="Details"
                    >
                      <FileSearch className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                     
                      className="h-7 px-2"
                      onClick={() => router.push(`/certificate-authorities/issue-certificate?caId=${ca.id}`)}
                      title="Issue Certificate"
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
