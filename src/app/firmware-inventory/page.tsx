'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Cpu, Search, Loader2, RefreshCw, AlertTriangle,
  ChevronLeft, ChevronRight, Eye, ArrowLeft, MonitorDot, Package,
  Download, Copy, Check, ShieldCheck, ShieldAlert, History, HardDrive, Hash, UploadCloud, Plus,
  MoreVertical, ArrowUpCircle, Trash2,
} from 'lucide-react';
import { cn, formatBytes, isValidSemver, compareSemver } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fetchAllArtifacts, fetchAllDeviceArtifactVersions, downloadArtifact, uploadArtifact, deleteArtifact } from '@/lib/iot-api';
import type { Artifact, DeviceArtifactVersion, ArtifactVersionStatus } from '@/types/iot';
import { DateDisplay } from '@/components/shared/DateDisplay';

// ─── status badge ──────────────────────────────────────────────────────────────
const ArtifactStatusBadge: React.FC<{ status: ArtifactVersionStatus }> = ({ status }) => {
  const classes: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700',
    backup: 'bg-amber-100 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    inactive: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge variant="outline" className={cn('text-xs capitalize', classes[status] || classes.inactive)}>
      {status}
    </Badge>
  );
};

// ─── copyable hash chip ──────────────────────────────────────────────────────────
const HashCell: React.FC<{ hash?: string; full?: boolean }> = ({ hash, full }) => {
  const [copied, setCopied] = useState(false);
  if (!hash) return <span className="text-xs text-muted-foreground">—</span>;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: 'Copied', description: 'SHA-256 copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access the clipboard.', variant: 'destructive' });
    }
  };

  const shown = full ? hash : `${hash.slice(0, 10)}…${hash.slice(-4)}`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Hash className="h-3 w-3 shrink-0 opacity-60" />
            <span>{shown}</span>
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 opacity-50" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[420px] break-all font-mono text-xs">{hash}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ─── types ─────────────────────────────────────────────────────────────────────
interface ArtifactRow {
  name: string;
  latest: Artifact;       // latest catalog entry (by uploaded_at, tie-break pack_version)
  versions: Artifact[];   // all catalog entries for this name, newest first
  packs: string[];        // deduplicated list of pack names that carry this artifact
}

interface Selected {
  name: string;
  version: string; // '' = show all versions
}

// ─── helpers ───────────────────────────────────────────────────────────────────
function uploadedSortKey(a: Artifact): string {
  // Sort by uploaded_at desc; entries without a timestamp sort last.
  return a.uploaded_at || '';
}

function buildArtifactRows(artifacts: Artifact[]): ArtifactRow[] {
  const map = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const list = map.get(a.name) || [];
    list.push(a);
    map.set(a.name, list);
  }
  const rows: ArtifactRow[] = [];
  for (const [name, list] of map.entries()) {
    const versions = [...list].sort((x, y) => {
      const k = uploadedSortKey(y).localeCompare(uploadedSortKey(x));
      return k !== 0 ? k : y.version.localeCompare(x.version, undefined, { numeric: true });
    });
    // Packs that reference any version of this artifact (reverse lookup from the junction).
    const packs = [...new Set(versions.flatMap(v => (v.packs || []).map(p => p.pack_name)))].filter(Boolean);
    rows.push({ name, latest: versions[0], versions, packs });
  }
  // Most recently updated artifact first.
  return rows.sort((a, b) => uploadedSortKey(b.latest).localeCompare(uploadedSortKey(a.latest)));
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// Follow the `next` bookmark until the backend has no more rows, so fleet-wide counts and
// integrity verdicts are computed over the COMPLETE set (not a silently-truncated first page).
// maxPages is a safety cap; `truncated` reports whether it was hit.
const PAGE_FETCH_SIZE = 500;
const MAX_PAGES = 100; // up to 50k rows per list
async function fetchAllPages<T>(
  fetchPage: (bookmark?: string) => Promise<{ list: T[]; next: string | null }>,
): Promise<{ list: T[]; truncated: boolean }> {
  const acc: T[] = [];
  let bookmark: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { list, next } = await fetchPage(bookmark);
    acc.push(...list);
    if (!next) return { list: acc, truncated: false };
    bookmark = next;
  }
  return { list: acc, truncated: true };
}

// ─── main page ─────────────────────────────────────────────────────────────────
export default function FirmwareInventoryPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([]);
  const [deviceVersions, setDeviceVersions] = useState<DeviceArtifactVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Standalone artifact upload
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Destructive per-artifact actions (kebab menu)
  const [confirmDelete, setConfirmDelete] = useState<{ mode: 'last' | 'all'; row: ArtifactRow } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── upload version validation (X.Y.Z + strictly greater than current latest) ───
  // The current latest valid version among the global pool for the name being uploaded.
  const latestForName = useMemo(() => {
    const name = uploadName.trim();
    if (!name) return null;
    const versions = allArtifacts.filter(a => a.name === name).map(a => a.version).filter(isValidSemver);
    if (versions.length === 0) return null;
    return versions.sort((x, y) => compareSemver(y, x))[0];
  }, [allArtifacts, uploadName]);

  const versionError = useMemo(() => {
    const v = uploadVersion.trim();
    if (!v) return null; // empty is handled by disabling submit, not an inline error
    if (!isValidSemver(v)) return 'Version must be in X.Y.Z format (e.g. 1.2.3).';
    if (latestForName && compareSemver(v, latestForName) <= 0) {
      return `Must be greater than the current latest version ${latestForName}.`;
    }
    return null;
  }, [uploadVersion, latestForName]);

  const [nameInput, setNameInput] = useState('');
  const [appliedName, setAppliedName] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Drill-down: selected artifact name (+ optional version for device list)
  const [selected, setSelected] = useState<Selected | null>(null);
  const [devicePage, setDevicePage] = useState(0);
  const DEVICE_PAGE_SIZE = 15;

  // ── fetch ────────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (authLoading || !isAuthenticated() || !user?.access_token) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = user.access_token;
      const [catalogRes, devicesRes] = await Promise.all([
        fetchAllPages(b => fetchAllArtifacts({ accessToken: token }, { pageSize: PAGE_FETCH_SIZE, bookmark: b })),
        fetchAllPages(b => fetchAllDeviceArtifactVersions({ accessToken: token }, { pageSize: PAGE_FETCH_SIZE, bookmark: b })),
      ]);
      setAllArtifacts(catalogRes.list);
      setDeviceVersions(devicesRes.list);
      setTruncated(catalogRes.truncated || devicesRes.truncated);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch firmware inventory.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token, authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading && isAuthenticated()) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // ── download ─────────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async (art: Artifact, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user?.access_token) return;
    if (!art.filename) {
      toast({ title: 'No binary', description: 'This artifact has no uploaded binary on record.', variant: 'destructive' });
      return;
    }
    setDownloadingId(art.id);
    try {
      const blob = await downloadArtifact({ id: art.id, accessToken: user.access_token });
      triggerBlobDownload(blob, art.filename);
      toast({ title: 'Download started', description: `${art.filename} (${formatBytes(art.size)})` });
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message || 'Could not download the artifact binary.', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  }, [user?.access_token]);

  // ── upload (standalone global artifact) ────────────────────────────────────────
  const handleUploadArtifact = useCallback(async () => {
    if (!user?.access_token || !uploadFile) return;
    if (!uploadVersion.trim()) {
      toast({ title: 'Version required', description: 'Give the artifact a semantic version (e.g. 2.1.0).', variant: 'destructive' });
      return;
    }
    if (versionError) {
      toast({ title: 'Invalid version', description: versionError, variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      const name = uploadName.trim() || uploadFile.name.replace(/\.[^.]+$/, '');
      await uploadArtifact({ name, version: uploadVersion.trim(), file: uploadFile, accessToken: user.access_token });
      toast({ title: 'Artifact uploaded', description: `${name} ${uploadVersion.trim()}` });
      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadName('');
      setUploadVersion('');
      loadData();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Could not upload the artifact.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [user?.access_token, uploadFile, uploadName, uploadVersion, versionError, loadData]);

  // ── per-artifact actions (kebab) ───────────────────────────────────────────────
  // "Upgrade" = upload a newer version of this artifact (opens the upload dialog with the name fixed).
  const handleUpgrade = useCallback((row: ArtifactRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setUploadFile(null);
    setUploadName(row.name);
    setUploadVersion('');
    setIsUploadOpen(true);
  }, []);

  // Delete the newest version, or every version, of an artifact (confirmed via dialog).
  const performDelete = useCallback(async () => {
    if (!user?.access_token || !confirmDelete) return;
    const { mode, row } = confirmDelete;
    const targets = mode === 'all' ? row.versions : [row.versions[0]];
    setIsDeleting(true);
    try {
      for (const art of targets) {
        await deleteArtifact({ id: art.id, accessToken: user.access_token });
      }
      toast({
        title: mode === 'all' ? 'Artifact removed' : 'Version removed',
        description: mode === 'all'
          ? `Deleted all ${targets.length} version(s) of "${row.name}".`
          : `Deleted "${row.name}" ${row.versions[0]?.version || ''}.`,
      });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message || 'Could not delete the artifact.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      loadData(); // reflect actual state even if a multi-delete failed partway
    }
  }, [user?.access_token, confirmDelete, loadData]);

  // ── derived ──────────────────────────────────────────────────────────────────
  const rows = useMemo(
    () => buildArtifactRows(allArtifacts).filter(
      r => !appliedName || r.name.toLowerCase().includes(appliedName.toLowerCase())
    ),
    [allArtifacts, appliedName],
  );
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // catalog checksum lookup, per (artifact name + version), for device integrity verification
  const catalogChecksum = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of allArtifacts) {
      if (a.checksum) m.set(`${a.name}@@${a.version}`, a.checksum);
    }
    return m;
  }, [allArtifacts]);

  // active device-slot count per artifact name
  const activeCountByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deviceVersions) {
      if (d.status === 'active') m.set(d.artifact_name, (m.get(d.artifact_name) || 0) + 1);
    }
    return m;
  }, [deviceVersions]);

  // For detail view: devices that have the selected artifact (optionally filtered by version)
  const detailRow = selected ? rows.find(r => r.name === selected.name) : null;
  const latestVersionStr = detailRow?.latest.version || '';

  const detailDevices = selected
    ? deviceVersions.filter(d =>
        d.artifact_name === selected.name &&
        (!selected.version || d.version === selected.version)
      )
    : [];
  const totalDetailPages = Math.ceil(detailDevices.length / DEVICE_PAGE_SIZE);
  const pageDetailDevices = detailDevices.slice(devicePage * DEVICE_PAGE_SIZE, (devicePage + 1) * DEVICE_PAGE_SIZE);

  // Unique versions installed on devices for this artifact, for the sub-filter
  const installedVersions = selected
    ? Array.from(new Set(deviceVersions.filter(d => d.artifact_name === selected.name).map(d => d.version)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) // version-aware: 2.0.0 before 10.0.0
    : [];

  // device-slot count per version string (for the selected artifact)
  const installCountByVersion = useMemo(() => {
    const m = new Map<string, number>();
    if (!selected) return m;
    for (const d of deviceVersions) {
      if (d.artifact_name === selected.name) m.set(d.version, (m.get(d.version) || 0) + 1);
    }
    return m;
  }, [deviceVersions, selected]);

  // ── handlers ─────────────────────────────────────────────────────────────────
  const handleApply = () => { setAppliedName(nameInput.trim()); setPage(0); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleApply(); };
  const openDetail = (name: string) => { setSelected({ name, version: '' }); setDevicePage(0); };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Authenticating...</p>
      </div>
    );
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────────────────────
  if (selected) {
    const activeCount = activeCountByName.get(selected.name) || 0;
    const onLatest = latestVersionStr
      ? deviceVersions.filter(d => d.artifact_name === selected.name && d.status === 'active' && d.version === latestVersionStr).length
      : 0;
    const outdated = activeCount - onLatest;

    return (
      <div className="space-y-6 w-full pb-8">
        <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setDevicePage(0); }} className="gap-1 pl-0">
          <ArrowLeft className="h-4 w-4" /> Back to Firmware Inventory
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5"><Cpu className="h-6 w-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-headline font-semibold">{selected.name}</h1>
              {selected.version
                ? <p className="text-sm text-muted-foreground">Devices running version <span className="font-mono font-medium">{selected.version}</span></p>
                : <p className="text-sm text-muted-foreground">All versions installed across the fleet</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1 text-xs">
              <Package className="h-3 w-3" /> Latest: <span className="font-mono ml-1">{latestVersionStr || '—'}</span>
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs">
              <History className="h-3 w-3" /> {detailRow?.versions.length || 0} version(s)
            </Badge>
            <Badge variant="default" className="gap-1 text-xs">
              <MonitorDot className="h-3 w-3" /> {activeCount} active
            </Badge>
            {outdated > 0 && (
              <Badge variant="outline" className="gap-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                <AlertTriangle className="h-3 w-3" /> {outdated} outdated
              </Badge>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {truncated && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Showing a partial dataset</AlertTitle>
            <AlertDescription>
              Not all device records could be loaded, so the device list and active/outdated counts below may be incomplete.
            </AlertDescription>
          </Alert>
        )}

        {/* Versions catalog */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Versions</CardTitle>
            <CardDescription>Every uploaded version of <span className="font-medium">{selected.name}</span>, newest first. Download any version's signed binary.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Pack</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>SHA-256</TableHead>
                    <TableHead>Installs</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Binary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detailRow?.versions || []).map(v => {
                    const isLatest = v.version === latestVersionStr && (v.uploaded_at || '') === (detailRow?.latest.uploaded_at || '');
                    const installs = installCountByVersion.get(v.version) || 0;
                    const vpacks = v.packs || [];
                    const packTitle = vpacks.map(p => `${p.pack_name} v${p.pack_version}`).join(', ');
                    return (
                      <TableRow key={v.id}>
                        <TableCell>
                          <span className="font-mono text-sm font-medium">{v.version || <span className="italic text-muted-foreground">—</span>}</span>
                          {isLatest && <Badge variant="default" className="ml-2 text-[10px] px-1.5 py-0">latest</Badge>}
                          <div className="text-[11px] text-muted-foreground font-mono">{v.filename}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" title={packTitle}>
                          {vpacks.length === 0
                            ? <span className="italic text-muted-foreground">unused</span>
                            : vpacks.length === 1
                              ? `${vpacks[0].pack_name} v${vpacks[0].pack_version}`
                              : `${vpacks[0].pack_name} +${vpacks.length - 1}`}
                        </TableCell>
                        <TableCell className="text-sm">{formatBytes(v.size)}</TableCell>
                        <TableCell><HashCell hash={v.checksum} /></TableCell>
                        <TableCell>
                          {installs > 0
                            ? <Badge variant="outline" className="text-xs gap-1"><MonitorDot className="h-3 w-3" />{installs}</Badge>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.uploaded_at ? <DateDisplay date={v.uploaded_at} /> : '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" disabled={downloadingId === v.id || !v.filename} onClick={(e) => handleDownload(v, e)}>
                            {downloadingId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            <span className="ml-1.5">Download</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Version filter */}
        {installedVersions.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Filter devices by version:</Label>
            <Select value={selected.version || 'all'} onValueChange={v => { setSelected({ ...selected, version: v === 'all' ? '' : v }); setDevicePage(0); }}>
              <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All versions</SelectItem>
                {installedVersions.map(v => <SelectItem key={v} value={v}><span className="font-mono">{v}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Devices table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Devices</CardTitle>
            <CardDescription>
              {detailDevices.length === 0
                ? 'No devices have this artifact installed yet.'
                : `${detailDevices.length} device slot(s). Integrity compares the device's reported checksum against the catalog.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detailDevices.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
                <Cpu className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No devices have this firmware installed yet.</p>
              </div>
            ) : (
              <>
                <div className={cn('overflow-x-auto', isLoading && 'opacity-50')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device ID</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Up to date</TableHead>
                        <TableHead>Integrity</TableHead>
                        <TableHead>Installed At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageDetailDevices.map(d => {
                        const expected = catalogChecksum.get(`${d.artifact_name}@@${d.version}`);
                        const integrity = !expected || !d.checksum
                          ? 'unknown'
                          : (expected.toLowerCase() === d.checksum.toLowerCase() ? 'verified' : 'mismatch');
                        const upToDate = latestVersionStr ? d.version === latestVersionStr : null;
                        return (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-sm">{d.device_id}</TableCell>
                            <TableCell className="font-mono text-sm">{d.version}</TableCell>
                            <TableCell><ArtifactStatusBadge status={d.status} /></TableCell>
                            <TableCell>
                              {upToDate === null ? <span className="text-xs text-muted-foreground">—</span>
                                : upToDate
                                  ? <Badge variant="outline" className="text-xs bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700">Latest</Badge>
                                  : <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300 border-amber-300 dark:border-amber-700">Outdated</Badge>}
                            </TableCell>
                            <TableCell>
                              {integrity === 'verified' && (
                                <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300"><ShieldCheck className="h-3.5 w-3.5" /> Verified</span>
                              )}
                              {integrity === 'mismatch' && (
                                <span className="inline-flex items-center gap-1 text-xs text-destructive"><ShieldAlert className="h-3.5 w-3.5" /> Mismatch</span>
                              )}
                              {integrity === 'unknown' && <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground"><DateDisplay date={d.installed_at} /></TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => router.push(`/devices/details?deviceId=${encodeURIComponent(d.device_id)}`)}>
                                <Eye className="mr-1 h-4 w-4" /> View device
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {totalDetailPages > 1 && (
                  <div className="flex justify-end items-center gap-2 mt-4">
                    <Button onClick={() => setDevicePage(p => Math.max(0, p - 1))} disabled={devicePage === 0} variant="outline" size="sm">
                      <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">{devicePage + 1} / {totalDetailPages}</span>
                    <Button onClick={() => setDevicePage(p => Math.min(totalDetailPages - 1, p + 1))} disabled={devicePage >= totalDetailPages - 1} variant="outline" size="sm">
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 w-full pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Cpu className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-headline font-semibold">Firmware Inventory</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsUploadOpen(true)} disabled={isLoading}>
            <UploadCloud className="mr-2 h-4 w-4" /> Upload Artifact
          </Button>
          <Button onClick={loadData} variant="outline" disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Every firmware and software artifact is a first-class entity (name + version), downloadable on its own and referenced by update packs. Size, SHA-256 and per-version downloads below.
        Click a row to track which devices run each version.
      </p>

      {/* Search */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Search</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="name-filter">Artifact name</Label>
              <Input id="name-filter" placeholder="e.g. firmware, os, config…" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={handleKeyDown} disabled={isLoading} />
            </div>
            <Button onClick={handleApply} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}<Button variant="link" onClick={loadData} className="p-0 h-auto ml-2">Try again?</Button></AlertDescription>
        </Alert>
      )}

      {/* Truncation warning — counts/integrity are only as complete as the data we could fetch */}
      {truncated && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Showing a partial dataset</AlertTitle>
          <AlertDescription>
            The fleet has more artifacts or device records than could be loaded, so active/outdated counts and
            integrity checks may be incomplete. Narrow the results with search, or use per-device views for exact figures.
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Artifacts</CardTitle>
          <CardDescription>
            {isLoading ? 'Loading…' : rows.length > 0
              ? `${rows.length} artifact(s). Click a row to see versions and which devices have each installed.`
              : 'No artifacts registered yet. Upload artifacts from an update pack\'s details page.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-border rounded-lg text-center bg-muted/20">
              <Cpu className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-muted-foreground">No Artifacts</h3>
              <p className="text-sm text-muted-foreground mt-1">Upload binary artifacts from an update pack's details page to see them here.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Latest version</TableHead>
                      <TableHead><span className="inline-flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" />Size</span></TableHead>
                      <TableHead>SHA-256</TableHead>
                      <TableHead>Packs</TableHead>
                      <TableHead>Devices (active)</TableHead>
                      <TableHead>Last updated</TableHead>
                      <TableHead className="text-right">Binary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map(r => {
                      const activeCount = activeCountByName.get(r.name) || 0;
                      const onLatest = r.latest.version
                        ? deviceVersions.filter(d => d.artifact_name === r.name && d.status === 'active' && d.version === r.latest.version).length
                        : 0;
                      const outdated = activeCount - onLatest;
                      return (
                        <TableRow
                          key={r.name}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => openDetail(r.name)}
                        >
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{r.latest.version || <span className="italic text-muted-foreground">—</span>}</span>
                            {r.versions.length > 1 && (
                              <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 gap-1"><History className="h-2.5 w-2.5" />{r.versions.length}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{formatBytes(r.latest.size)}</TableCell>
                          <TableCell><HashCell hash={r.latest.checksum} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.packs.length === 0 ? '—'
                              : r.packs.length === 1 ? r.packs[0]
                              : (
                                <span title={r.packs.join(', ')}>
                                  {r.packs[0]}{' '}
                                  <span className="text-xs text-muted-foreground">+{r.packs.length - 1} more</span>
                                </span>
                              )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {activeCount > 0
                                ? <Badge variant="default" className="text-xs gap-1"><MonitorDot className="h-3 w-3" />{activeCount}</Badge>
                                : <span className="text-xs text-muted-foreground">—</span>}
                              {outdated > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-700/30 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                                  {outdated} outdated
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.latest.uploaded_at ? <DateDisplay date={r.latest.uploaded_at} /> : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="sm" disabled={downloadingId === r.latest.id || !r.latest.filename} onClick={(e) => handleDownload(r.latest, e)}>
                                {downloadingId === r.latest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()} aria-label="Artifact actions">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={(e) => handleUpgrade(r, e)}>
                                    <ArrowUpCircle className="mr-2 h-4 w-4" /> Upgrade (upload new version)
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-amber-700 dark:text-amber-400 focus:text-amber-700"
                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ mode: 'last', row: r }); }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Remove last version
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ mode: 'all', row: r }); }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Remove all versions
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} variant="outline" size="sm">
                      <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <Button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} variant="outline" size="sm">
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Upload artifact dialog */}
      <Dialog open={isUploadOpen} onOpenChange={(o) => { if (!isUploading) setIsUploadOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5 text-primary" /> Upload Artifact</DialogTitle>
            <DialogDescription>
              Add a global software component (binary + name + version). It becomes available to reference from any update pack's SWU.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="up-file">Binary</Label>
              <Input id="up-file" type="file" disabled={isUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadFile(f);
                  if (f && !uploadName) setUploadName(f.name.replace(/\.[^.]+$/, ''));
                }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="up-name">Name</Label>
                <Input id="up-name" placeholder="e.g. firmware" value={uploadName} onChange={(e) => setUploadName(e.target.value)} disabled={isUploading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="up-version">Version</Label>
                <Input
                  id="up-version"
                  placeholder="e.g. 2.1.0"
                  value={uploadVersion}
                  onChange={(e) => setUploadVersion(e.target.value)}
                  disabled={isUploading}
                  className={cn(versionError && 'border-destructive focus-visible:ring-destructive')}
                  aria-invalid={!!versionError}
                />
                {versionError
                  ? <p className="text-xs text-destructive">{versionError}</p>
                  : latestForName
                    ? <p className="text-xs text-muted-foreground">Current latest: <span className="font-mono">{latestForName}</span> — new version must be higher.</p>
                    : <p className="text-xs text-muted-foreground">Format: X.Y.Z (e.g. 1.2.3).</p>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Each upload must be a new, strictly-greater version. Versions must be in X.Y.Z format.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>Cancel</Button>
            <Button onClick={handleUploadArtifact} disabled={isUploading || !uploadFile || !uploadVersion.trim() || !!versionError}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destructive action confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o && !isDeleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirmDelete?.mode === 'all' ? 'Remove all versions?' : 'Remove the latest version?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {confirmDelete?.mode === 'all' ? (
                  <p>
                    This permanently deletes <strong>all {confirmDelete.row.versions.length} version(s)</strong> of{' '}
                    <span className="font-medium text-foreground">{confirmDelete.row.name}</span> and their binaries. This cannot be undone.
                  </p>
                ) : confirmDelete ? (
                  <p>
                    This permanently deletes the latest version{' '}
                    <span className="font-mono text-foreground">{confirmDelete.row.versions[0]?.version || '—'}</span> of{' '}
                    <span className="font-medium text-foreground">{confirmDelete.row.name}</span> and its binary.{' '}
                    {confirmDelete.row.versions.length > 1
                      ? `Version ${confirmDelete.row.versions[1]?.version || ''} then becomes the latest.`
                      : 'This is its only version, so the artifact is removed entirely.'}{' '}
                    This cannot be undone.
                  </p>
                ) : null}
                {confirmDelete && confirmDelete.row.packs.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    ⚠ Referenced by pack(s): {confirmDelete.row.packs.join(', ')}. Those packs will no longer deliver it.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); performDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {confirmDelete?.mode === 'all' ? 'Remove all' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
