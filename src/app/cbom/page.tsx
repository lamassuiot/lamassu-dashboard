'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateDisplay } from '@/components/shared/DateDisplay';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ColumnSelector, type ColumnConfig } from '@/components/ui/column-selector';
import { cn } from '@/lib/utils';
import {
  CBOMItem,
  fetchRecentCBOMs,
  startCBOMWebSocketScan,
  storeCBOM,
} from '@/lib/cbom-api';
import { useToast } from '@/hooks/use-toast';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileUp,
  Loader2,
  MoreVertical,
  Search,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

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

const getComponents = (item: CBOMItem): any[] | undefined => {
  // The API returns the full object at the item level: { projectIdentifier, bom: { components } }
  // item.data may also hold a wrapped copy in some contexts, so check both.
  const raw = item as any;
  const components = raw?.bom?.components ?? raw?.data?.bom?.components ?? raw?.data?.components;
  return Array.isArray(components) ? components : undefined;
};

const getCryptographicAssetCount = (item: CBOMItem): number | undefined => {
  const components = getComponents(item);
  return components !== undefined ? components.length : undefined;
};

const getTotalFindings = (item: CBOMItem): number | undefined => {
  const components = getComponents(item);
  if (!components) return undefined;
  return components.reduce(
    (sum: number, c: any) => sum + ((c?.evidence?.occurrences?.length as number) ?? 0),
    0,
  );
};

interface ResponsivePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}

function ResponsivePanel({ open, onOpenChange, title, description, children }: ResponsivePanelProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          {children}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col p-0 overflow-hidden">
        <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function CBOMPage() {
  const { isLoggedIn, user } = useAuth();
  const { toast } = useToast();
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isLoadingTable, setIsLoadingTable] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [recentCboms, setRecentCboms] = useState<CBOMItem[]>([]);
  const [tableLimit, setTableLimit] = useState(5);

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    project: true,
    cbomType: true,
    date: true,
    assets: true,
    findings: true,
    action: true,
  });

  const columns: ColumnConfig[] = [
    { id: 'project', label: 'Project / Repository', visible: columnVisibility.project, disabled: true },
    { id: 'cbomType', label: 'CBOM Type', visible: columnVisibility.cbomType },
    { id: 'date', label: 'Date of Scan', visible: columnVisibility.date },
    { id: 'assets', label: 'Total Assets', visible: columnVisibility.assets },
    { id: 'findings', label: 'Findings', visible: columnVisibility.findings },
    { id: 'action', label: 'Action', visible: columnVisibility.action },
  ];

  const CBOM_TYPES = ['gitrepo', 'filesystem', 'realtime'] as const;
  type CBOMType = typeof CBOM_TYPES[number];
  const [cbomTypeFilter, setCbomTypeFilter] = useState<CBOMType | 'all'>('all');

  const getCBOMType = (item: CBOMItem): CBOMType => {
    // Resolve the raw BOM object from wherever it may be stored
    const raw = item as any;
    const bom = raw?.bom ?? raw?.data?.bom ?? raw?.data ?? raw;
    const services: any[] = bom?.metadata?.tools?.services ?? [];
    const isLiveCapture = services.some(
      (svc: any) =>
        svc?.name === 'LiveCapture' && svc?.provider?.name === 'Ikerlan_LKS',
    );
    if (isLiveCapture) return 'realtime';
    return 'gitrepo';
  };

  const filteredCboms = cbomTypeFilter === 'all'
    ? recentCboms
    : recentCboms.filter((item) => getCBOMType(item) === cbomTypeFilter);

  const handleColumnToggle = (columnId: string) => {
    setColumnVisibility((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  const [scanUrl, setScanUrl] = useState('');
  const [isScanDrawerOpen, setIsScanDrawerOpen] = useState(false);
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanFinished, setScanFinished] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanGitUrl, setScanGitUrl] = useState('');
  const [scanBranch, setScanBranch] = useState('');
  const [scanRevisionHash, setScanRevisionHash] = useState('');
  const [scanDetections, setScanDetections] = useState(0);
  const [scanFileCount, setScanFileCount] = useState<number | null>(null);
  const [scanLineCount, setScanLineCount] = useState<number | null>(null);
  const [scanDuration, setScanDuration] = useState<number | null>(null);

  // Advanced-options form fields
  const [advBranch, setAdvBranch] = useState('');
  const [advSubfolder, setAdvSubfolder] = useState('');
  const [advUsername, setAdvUsername] = useState('');
  const [advPassword, setAdvPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const finishedRef = useRef(false);
  // Track detection count in a ref so onClose always reads the latest value (avoids stale closure).
  const scanDetectionsRef = useRef(0);
  // Store the latest finishScan implementation in a ref so the WebSocket onClose
  // always invokes the most up-to-date version without capturing stale state.
  const finishScanRef = useRef<(hasError: boolean) => void>(() => {});

  const loadRecentScans = useCallback(async () => {
    if (!user?.access_token) {
      setRecentCboms([]);
      setIsLoadingTable(false);
      return;
    }

    setIsLoadingTable(true);
    setTableError(null);
    try {
      const data = await fetchRecentCBOMs(tableLimit, user.access_token);
      setRecentCboms(Array.isArray(data) ? data : []);
    } catch (error) {
      setRecentCboms([]);
      setTableError(error instanceof Error ? error.message : 'Failed to load CBOMs');
    } finally {
      setIsLoadingTable(false);
    }
  }, [tableLimit, user?.access_token]);

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
    setScanError('');
    setScanGitUrl('');
    setScanBranch('');
    setScanRevisionHash('');
    setScanDetections(0);
    scanDetectionsRef.current = 0;
    setScanFileCount(null);
    setScanLineCount(null);
    setScanDuration(null);
    setScanFinished(false);
  };

  // Keep finishScanRef up to date on every render so the WebSocket onClose always
  // calls the latest closure without stale state.
  finishScanRef.current = useCallback(
    (hasError: boolean) => {
      if (finishedRef.current) {
        return;
      }

      finishedRef.current = true;
      setIsScanning(false);

      if (!hasError) {
        setScanFinished(true);
        const detectedCount = scanDetectionsRef.current;
        toast({
          title: 'Scan finished',
          description:
            detectedCount > 0
              ? `Detected ${detectedCount} cryptographic asset${detectedCount !== 1 ? 's' : ''}`
              : 'Repository scan completed',
        });
        // Slight delay so the backend has time to persist the CBOM before we reload.
        setTimeout(() => loadRecentScans(), 800);
      }
    },
    [loadRecentScans, toast],
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
        branch: advBranch.trim() || undefined,
        subfolder: advSubfolder.trim() || undefined,
        credentials:
          advUsername.trim() || advPassword.trim()
            ? { username: advUsername.trim() || undefined, password: advPassword.trim() || undefined }
            : undefined,
        accessToken: user?.access_token,
        onOpen: () => {
          setScanStatus('Starting...');
        },
        onMessage: (message) => {
          if (message.type === 'LABEL') {
            setScanStatus(message.message);
            if (message.message === 'Finished') {
              websocketRef.current?.close();
              finishScanRef.current(false);
            }
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

          if (message.type === 'SCANNED_FILE_COUNT') {
            const count = parseInt(message.message, 10);
            if (!isNaN(count)) setScanFileCount(count);
            return;
          }

          if (message.type === 'SCANNED_NUMBER_OF_LINES') {
            const lines = parseInt(message.message, 10);
            if (!isNaN(lines)) setScanLineCount(lines);
            return;
          }

          if (message.type === 'SCANNED_DURATION') {
            const ms = parseInt(message.message, 10);
            if (!isNaN(ms)) setScanDuration(ms);
            return;
          }

          if (message.type === 'CBOM') {
            // The server persists the CBOM; the list is refreshed on connection close via finishScan → loadRecentScans()
            return;
          }

          if (message.type === 'DETECTION') {
            scanDetectionsRef.current += 1;
            setScanDetections(scanDetectionsRef.current);
            return;
          }

          if (message.type === 'ERROR') {
            setScanStatus('Failed');
            setScanError(message.message);
            finishScanRef.current(true);
          }
        },
        onError: (error) => {
          toast({
            title: 'Scan failed',
            description: error.message,
            variant: 'destructive',
          });
          finishScanRef.current(true);
        },
        onClose: () => {
          finishScanRef.current(false);
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

      setIsUploadDrawerOpen(false);
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

  if (!isLoggedIn) {
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
    <div className="w-full space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <ClipboardList className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-headline font-semibold">CBOM Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Explore repository scans, live capture sessions, and cryptographic findings in one place.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 self-start sm:self-center">
          <Button onClick={loadRecentScans} variant="secondary" disabled={isLoadingTable}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoadingTable && 'animate-spin')} />
            Refresh List
          </Button>
          <Button onClick={() => setIsUploadDrawerOpen(true)} variant="secondary">
            <FileUp className="mr-2 h-4 w-4" />
            Upload CBOM
          </Button>
          <Button onClick={() => setIsScanDrawerOpen(true)}>
            <Search className="mr-2 h-4 w-4" />
            Scan CBOM
          </Button>
        </div>
      </div>

      <ResponsivePanel
        open={isUploadDrawerOpen}
        onOpenChange={setIsUploadDrawerOpen}
        title="Upload CBOM"
        description="Import an existing CBOM JSON file and add it to the dashboard."
      >
        <div className="px-6 pt-5 pb-6">
            <label
              htmlFor="cbom-upload"
              className={cn(
                'flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all duration-150',
                isDragOver
                  ? 'border-primary bg-primary/8 scale-[1.01]'
                  : 'border-border/60 bg-muted/10 hover:border-primary/60 hover:bg-primary/5',
                isUploading && 'pointer-events-none opacity-50',
              )}
              onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                handleUploadFile(event.dataTransfer.files?.[0]);
              }}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Uploading...</span>
                </>
              ) : (
                <>
                  <div className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
                    isDragOver ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                  )}>
                    <FileUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{isDragOver ? 'Release to upload' : 'Drop file here'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">or <span className="text-primary underline underline-offset-2">browse</span></p>
                  </div>
                  <p className="max-w-[220px] text-xs text-muted-foreground">
                    Supports `.json` CBOM files that can be stored and opened from the dashboard.
                  </p>
                </>
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
          </div>
      </ResponsivePanel>

      <ResponsivePanel
        open={isScanDrawerOpen}
        onOpenChange={setIsScanDrawerOpen}
        title="Scan CBOM"
        description="Scan a public or authenticated Git repository and persist the resulting CBOM."
      >
        <div className="space-y-5 px-6 pt-5 pb-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="https://github.com/org/repo.git"
                value={scanUrl}
                onChange={(event) => setScanUrl(event.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isScanning) handleScanRepository(); }}
                className="h-10 flex-1 text-sm"
              />
              <Button
                className="h-10 shrink-0 px-4 text-sm"
                disabled={isScanning}
                onClick={handleScanRepository}
              >
                {isScanning ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Scanning</>
                ) : (
                  <><Search className="mr-1.5 h-4 w-4" />Scan Repository</>
                )}
              </Button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setAdvancedOptions((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className={cn(
                  'inline-flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] font-bold transition-colors shrink-0',
                  advancedOptions ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                )}>
                  {advancedOptions ? '✓' : ''}
                </span>
                Advanced options
              </button>

              {advancedOptions && (
                <Tabs defaultValue="scan" className="mt-4 w-full">
                  <div className="border-b">
                    <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0">
                      {[
                        { value: 'scan', label: 'Scan Settings' },
                        { value: 'auth', label: 'Authentication' },
                      ].map(({ value, label }) => (
                        <TabsTrigger
                          key={value}
                          value={value}
                          className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                          {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  <TabsContent value="scan" className="mt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="adv-branch" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Branch</Label>
                        <Input id="adv-branch" placeholder="main" value={advBranch} onChange={(e) => setAdvBranch(e.target.value)} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adv-subfolder" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subfolder</Label>
                        <Input id="adv-subfolder" placeholder="src/" value={advSubfolder} onChange={(e) => setAdvSubfolder(e.target.value)} className="h-9 text-sm" />
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="auth" className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="adv-username" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Username</Label>
                      <Input id="adv-username" placeholder="username" value={advUsername} onChange={(e) => setAdvUsername(e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adv-password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Password Or Personal Access Token</Label>
                      <div className="relative">
                        <Input
                          id="adv-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••"
                          value={advPassword}
                          onChange={(e) => setAdvPassword(e.target.value)}
                          className="h-9 pr-8 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {(isScanning || scanStatus || scanGitUrl || scanDetections > 0 || scanError) && (
              <div className={cn(
                'rounded-lg border px-4 py-3 text-xs',
                scanError
                  ? 'border-destructive/40 bg-destructive/5'
                  : scanFinished
                    ? 'border-blue-400/40 bg-blue-50/50 dark:bg-blue-950/20'
                    : 'border-border/60 bg-muted/20',
              )}>
                <div className="flex items-center gap-1.5">
                  {isScanning && !scanError && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                  {scanFinished && !scanError && <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                  <span className={cn('font-medium', scanError ? 'text-destructive' : scanFinished ? 'text-blue-600 dark:text-blue-400' : 'text-foreground')}>
                    {scanStatus || 'Waiting...'}
                  </span>
                  {scanError && <span className="ml-1 text-destructive">{scanError}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {scanGitUrl && <span className="truncate max-w-xs"><span className="text-foreground/60">Repo:</span> {scanGitUrl}</span>}
                  {scanBranch && <span><span className="text-foreground/60">Branch:</span> {scanBranch}</span>}
                  {scanRevisionHash && <span><span className="text-foreground/60">Rev:</span> {scanRevisionHash.slice(0, 10)}</span>}
                  {scanDetections > 0 && <span><span className="text-foreground/60">Detections:</span> {scanDetections}</span>}
                  {scanFileCount !== null && scanFileCount > 0 && <span><span className="text-foreground/60">Files:</span> {scanFileCount.toLocaleString()}</span>}
                  {scanLineCount !== null && scanLineCount > 0 && <span><span className="text-foreground/60">Lines:</span> {scanLineCount.toLocaleString()}</span>}
                  {scanDuration !== null && scanDuration > 0 && (
                    <span><span className="text-foreground/60">Duration:</span> {scanDuration >= 1000 ? `${(scanDuration / 1000).toFixed(1)}s` : `${scanDuration}ms`}</span>
                  )}
                </div>
              </div>
            )}
          </div>
      </ResponsivePanel>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
            {(recentCboms.length > 0 || isLoadingTable) && (
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tableLimitSelect" className="text-xs text-muted-foreground whitespace-nowrap">Show</Label>
                <Select value={String(tableLimit)} onValueChange={(v) => setTableLimit(Number(v))} disabled={isLoadingTable}>
                  <SelectTrigger id="tableLimitSelect" className="h-8 w-[72px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {recentCboms.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">Type:</span>
                <Button
                  variant={cbomTypeFilter === 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setCbomTypeFilter('all')}
                >
                  All
                </Button>
                {CBOM_TYPES.map((type) => (
                  <Button
                    key={type}
                    variant={cbomTypeFilter === type ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setCbomTypeFilter(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            )}
        </div>

        {tableError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading CBOMs</AlertTitle>
            <AlertDescription>{tableError}</AlertDescription>
          </Alert>
        )}

        {isLoadingTable && recentCboms.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border bg-muted/10 py-10">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading CBOMs...</span>
          </div>
        )}

        {!tableError && recentCboms.length > 0 && (
          <>
            <div className="flex justify-end">
              <ColumnSelector columns={columns} onColumnToggle={handleColumnToggle} align="end" />
            </div>
            <div className={cn(
              'overflow-x-auto transition-opacity duration-300',
              isLoadingTable && 'pointer-events-none opacity-50',
            )}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {columnVisibility.project && (
                      <TableHead className="w-[300px]">Project / Repository</TableHead>
                    )}
                    {columnVisibility.cbomType && (
                      <TableHead className="w-32">CBOM Type</TableHead>
                    )}
                    {columnVisibility.date && (
                      <TableHead className="w-40">Date of Scan</TableHead>
                    )}
                    {columnVisibility.assets && (
                      <TableHead className="w-28 text-right">Total Assets</TableHead>
                    )}
                    {columnVisibility.findings && (
                      <TableHead className="w-28 text-right">Findings</TableHead>
                    )}
                    {columnVisibility.action && (
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCboms.map((item, index) => {
                    const assetCount = getCryptographicAssetCount(item);
                    const findingsCount = getTotalFindings(item);
                    const scanDate = item.createdAt ?? item.timestamp;
                    const cbomType = getCBOMType(item);
                    return (
                      <TableRow key={`${item.projectIdentifier}-${index}`} className="group">
                        {columnVisibility.project && (
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-1.5">
                              <Link
                                href={`/cbom/details?projectId=${encodeURIComponent(item.projectIdentifier)}`}
                                className="truncate text-sm font-medium hover:underline"
                                title={item.projectIdentifier}
                              >
                                {item.projectIdentifier}
                              </Link>
                              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
                            </div>
                          </TableCell>
                        )}
                        {columnVisibility.cbomType && (
                          <TableCell className="w-32">
                            <Badge
                              variant="outline"
                              className={
                                cbomType === 'gitrepo'
                                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs'
                                  : cbomType === 'filesystem'
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs'
                                    : 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs'
                              }
                            >
                              {cbomType}
                            </Badge>
                          </TableCell>
                        )}
                        {columnVisibility.date && (
                          <TableCell className="w-40">
                            {scanDate ? (
                              <DateDisplay
                                date={scanDate}
                                formatString="dd/MM/yyyy HH:mm"
                                className="text-xs"
                                relativeClassName="text-xs"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {columnVisibility.assets && (
                          <TableCell className="w-28 text-right tabular-nums">
                            {assetCount !== undefined ? (
                              <span className="text-sm font-medium">{assetCount}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {columnVisibility.findings && (
                          <TableCell className="w-28 text-right tabular-nums">
                            {findingsCount !== undefined ? (
                              <span className="text-sm font-medium">{findingsCount}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        {columnVisibility.action && (
                          <TableCell className="w-24 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">CBOM Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/cbom/details?projectId=${encodeURIComponent(item.projectIdentifier)}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    {assetCount !== undefined
                                      ? `View ${assetCount} asset${assetCount !== 1 ? 's' : ''}`
                                      : 'View Assets'}
                                    <ArrowRight className="ml-auto h-3 w-3" />
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    const dataStr = JSON.stringify(item.data || item, null, 2);
                                    const blob = new Blob([dataStr], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `cbom-${item.projectIdentifier}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                >
                                  <Download className="mr-2 h-4 w-4" /> Download JSON
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {!tableError && !isLoadingTable && filteredCboms.length === 0 && recentCboms.length > 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/10 py-8 text-center">
            <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No {cbomTypeFilter} scans found</p>
            <p className="mt-0.5 text-xs text-muted-foreground/60">Try a different type filter.</p>
          </div>
        )}

        {!tableError && !isLoadingTable && recentCboms.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/10 py-12 text-center">
            <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No CBOMs yet</p>
            <p className="mt-0.5 text-xs text-muted-foreground/60">Use Upload CBOM or Scan CBOM to add your first scan.</p>
          </div>
        )}
      </section>
    </div>
  );
}
