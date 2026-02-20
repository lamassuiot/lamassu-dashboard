'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { DateDisplay } from '@/components/shared/DateDisplay';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CBOMItem,
  fetchRecentCBOMs,
  startCBOMWebSocketScan,
  storeCBOM,
} from '@/lib/cbom-api';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowRight,
  ClipboardList,
  ExternalLink,
  FileUp,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';

const SCAN_TABLE_LIMIT = 5;

const resolveProjectIdentifier = (cbomData: unknown): string => {
  if (!cbomData || typeof cbomData !== 'object') {
    return `uploaded-${Date.now()}`;
  }

  const data = cbomData as Record<string, unknown>;
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const component = metadata?.component as Record<string, unknown> | undefined;

  const candidates = [
    data.projectIdentifier,
    data.serialNumber,
    component?.purl,
    component?.['bom-ref'],
    component?.name,
  ];

  const selected = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return (selected as string | undefined) || `uploaded-${Date.now()}`;
};

const getCryptographicAssetCount = (item: CBOMItem): number | undefined => {
  const source = item.data;
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  const typed = source as Record<string, unknown>;
  const directAssets = typed.cryptographicAssets;
  if (Array.isArray(directAssets)) {
    return directAssets.length;
  }

  const components = typed.components;
  if (Array.isArray(components)) {
    return components.length;
  }

  return undefined;
};

export default function CBOMPage() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isLoadingTable, setIsLoadingTable] = useState(true);
  const [recentCboms, setRecentCboms] = useState<CBOMItem[]>([]);

  const [scanUrl, setScanUrl] = useState('');
  const [advancedOptions, setAdvancedOptions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanGitUrl, setScanGitUrl] = useState('');
  const [scanBranch, setScanBranch] = useState('');
  const [scanRevisionHash, setScanRevisionHash] = useState('');
  const [scanDetections, setScanDetections] = useState(0);

  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const finishedRef = useRef(false);

  const loadRecentScans = useCallback(async () => {
    if (!user?.access_token) {
      setRecentCboms([]);
      setIsLoadingTable(false);
      return;
    }

    setIsLoadingTable(true);
    try {
      const data = await fetchRecentCBOMs(SCAN_TABLE_LIMIT, user.access_token);
      setRecentCboms(Array.isArray(data) ? data : []);
    } catch (error) {
      setRecentCboms([]);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load scanned CBOMs',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingTable(false);
    }
  }, [toast, user?.access_token]);

  useEffect(() => {
    if (user) {
      setIsLoadingPage(false);
    }
  }, [user]);

  useEffect(() => {
    loadRecentScans();
  }, [loadRecentScans]);

  useEffect(() => {
    return () => {
      websocketRef.current?.close();
      websocketRef.current = null;
    };
  }, []);

  const resetScanState = () => {
    setScanStatus('Starting...');
    setScanGitUrl('');
    setScanBranch('');
    setScanRevisionHash('');
    setScanDetections(0);
  };

  const finishScan = useCallback(
    (hasError: boolean) => {
      if (finishedRef.current) {
        return;
      }

      finishedRef.current = true;
      setIsScanning(false);

      if (!hasError) {
        toast({
          title: 'Scan finished',
          description:
            scanDetections > 0
              ? `Detected ${scanDetections} cryptographic assets`
              : 'Repository scan completed',
        });
        loadRecentScans();
      }
    },
    [loadRecentScans, scanDetections, toast],
  );

  const handleScanRepository = () => {
    if (!scanUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Enter a Git URL or package URL to scan',
        variant: 'destructive',
      });
      return;
    }

    websocketRef.current?.close();
    finishedRef.current = false;
    resetScanState();
    setIsScanning(true);

    try {
      websocketRef.current = startCBOMWebSocketScan({
        scanUrl: scanUrl.trim(),
        accessToken: user?.access_token,
        onOpen: () => {
          setScanStatus('Starting...');
        },
        onMessage: (message) => {
          if (message.type === 'LABEL') {
            setScanStatus(message.message);
            return;
          }

          if (message.type === 'GITURL') {
            setScanGitUrl(message.message);
            return;
          }

          if (message.type === 'BRANCH') {
            setScanBranch(message.message);
            return;
          }

          if (message.type === 'REVISION_HASH') {
            setScanRevisionHash(message.message);
            return;
          }

          if (message.type === 'DETECTION') {
            setScanDetections((previous) => previous + 1);
          }
        },
        onError: (error) => {
          toast({
            title: 'Scan failed',
            description: error.message,
            variant: 'destructive',
          });
          finishScan(true);
        },
        onClose: () => {
          finishScan(false);
        },
      });
    } catch (error) {
      setIsScanning(false);
      toast({
        title: 'Scan failed',
        description: error instanceof Error ? error.message : 'Failed to start scan',
        variant: 'destructive',
      });
    }
  };

  const handleUploadFile = async (file?: File) => {
    if (!file || !user?.access_token) {
      return;
    }

    setIsUploading(true);

    try {
      const text = await file.text();
      const parsedData = JSON.parse(text);
      const projectIdentifier = resolveProjectIdentifier(parsedData);

      await storeCBOM(projectIdentifier, parsedData, user.access_token);
      toast({
        title: 'Upload complete',
        description: `Stored CBOM for ${projectIdentifier}`,
      });

      loadRecentScans();
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload CBOM file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!isAuthenticated()) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to access CBOM management.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoadingPage) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-6 w-[500px]" />
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-6 py-8 space-y-10">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">CBOMkit-LAMASSU</h1>
        <p className="text-base text-muted-foreground">
          Explore the use of cryptography in software with Cryptography Bills of Materials (CBOM)
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardList className="h-6 w-6" />
          <h2>Explore previously scanned CBOMs</h2>
        </div>

        <Card className="border bg-muted/20 p-0">
          <CardContent className="p-0">
            {isLoadingTable ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : recentCboms.length === 0 ? (
              <div className="px-6 py-8 text-muted-foreground">No scans found yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Most recent scans</TableHead>
                    <TableHead>Date of scan</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentCboms.map((item, index) => {
                    const assetCount = getCryptographicAssetCount(item);
                    return (
                      <TableRow key={`${item.projectIdentifier}-${index}`}>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <Link
                              href={`/cbom/details?projectId=${encodeURIComponent(item.projectIdentifier)}`}
                              className="truncate hover:underline"
                              title={item.projectIdentifier}
                            >
                              {item.projectIdentifier}
                            </Link>
                            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.timestamp ? (
                            <DateDisplay
                              date={item.timestamp}
                              formatString="dd/MM/yyyy"
                              showRelative={false}
                              className="text-sm text-muted-foreground"
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/cbom/details?projectId=${encodeURIComponent(item.projectIdentifier)}`}
                            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            {assetCount !== undefined
                              ? `See ${assetCount} cryptographic assets`
                              : 'See cryptographic assets'}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border bg-muted/20">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Search className="h-6 w-6" />
              Generate a new CBOM
            </CardTitle>
            <CardDescription className="text-base text-foreground/90">
              Submit a new public Git repository to scan and generate a CBOM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-3">
              <Input
                placeholder="Enter Git URL or Package URL to scan"
                value={scanUrl}
                onChange={(event) => setScanUrl(event.target.value)}
                className="h-11 text-sm"
              />
              <Button className="h-11 min-w-28 text-sm" disabled={isScanning} onClick={handleScanRepository}>
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning
                  </>
                ) : (
                  <>
                    Scan
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="advanced-options"
                checked={advancedOptions}
                onCheckedChange={(checked) => setAdvancedOptions(checked === true)}
              />
              <Label htmlFor="advanced-options" className="text-sm">
                Advanced options
              </Label>
            </div>

            {advancedOptions && (
              <p className="text-sm text-muted-foreground">
                Advanced scan options are currently disabled for protocol-compatible scans.
              </p>
            )}

            {(isScanning || scanStatus || scanGitUrl || scanBranch || scanRevisionHash || scanDetections > 0) && (
              <div className="rounded-md border border-border/70 bg-background/40 px-4 py-3 text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">Status:</span> {scanStatus || 'Waiting for updates...'}
                </p>
                {scanGitUrl && (
                  <p>
                    <span className="font-medium text-foreground">Repo:</span> {scanGitUrl}
                  </p>
                )}
                {scanBranch && (
                  <p>
                    <span className="font-medium text-foreground">Branch:</span> {scanBranch}
                  </p>
                )}
                {scanRevisionHash && (
                  <p>
                    <span className="font-medium text-foreground">Revision:</span> {scanRevisionHash}
                  </p>
                )}
                <p>
                  <span className="font-medium text-foreground">Detections:</span> {scanDetections}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-muted/20">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Upload className="h-6 w-6" />
              Upload a CBOM
            </CardTitle>
            <CardDescription className="text-base text-foreground/90">
              Upload an existing CBOM to visualize it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label
              htmlFor="cbom-upload"
              className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed px-4 py-8 text-center transition-colors ${
                isDragOver ? 'border-primary bg-primary/5' : 'border-border/70 bg-background/30'
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                handleUploadFile(event.dataTransfer.files?.[0]);
              }}
            >
              <FileUp className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-semibold text-primary">Drop a CBOM here</p>
                <p className="text-sm text-primary/90">(or click to browse)</p>
              </div>
              {isUploading && (
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading CBOM...
                </p>
              )}
            </label>
            <input
              id="cbom-upload"
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={isUploading}
              onChange={(event) => handleUploadFile(event.target.files?.[0])}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
