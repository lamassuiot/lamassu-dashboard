"use client";

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Download, Package, FileText, Info,
  Copy, Shield, Users, History, Plus, Loader2, UploadCloud, Link2,
  ChevronDown, ChevronRight, GitCompare, MoreVertical, Rocket,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import {
  fetchUpdatePacks, fetchArtifacts, fetchUpdatePackDescriptor, fetchGroupDevices,
  getPerDeviceSwuDownloadUrl, fetchUpdatePackVersions, downloadSwuVersion,
  fetchArtifactCatalog, downloadArtifact, fetchVersionSignature,
  downloadVersionArtifactsArchive, fetchAllArtifacts, linkArtifactToPack,
  fetchAllDevicePackVersions,
} from '@/lib/iot-api';
import { fetchKmsKey, type ApiKmsKey } from '@/lib/kms-data';
import { GenerateSwuDialog } from '@/components/iot/generate-swu-dialog';
import { GeneratePackageDialog } from '@/components/iot/generate-package-dialog';
import { TargetedUpdateDialog } from '@/components/iot/targeted-update-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn, formatBytes, isValidSemver } from '@/lib/utils';
import type { DeviceListApiResponse, UpdatePackVersion, Artifact, ArtifactRef } from '@/types/iot';
import type { UpdatePacksResponse } from '@/lib/iot-api';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

// Delta between two consecutive pack versions (artifact-level diff).
type ArtifactDelta = {
  added: ArtifactRef[];
  removed: ArtifactRef[];
  changed: Array<{ name: string; oldVersion: string; newVersion: string }>;
  unchanged: ArtifactRef[];
};

function computeDelta(current: UpdatePackVersion, previous?: UpdatePackVersion): ArtifactDelta | null {
  if (!previous) return null;
  const prevMap = new Map((previous.artifacts || []).map(a => [a.name, a.version]));
  const currSet = new Set((current.artifacts || []).map(a => a.name));
  return {
    added: (current.artifacts || []).filter(a => !prevMap.has(a.name)),
    removed: (previous.artifacts || []).filter(a => !currSet.has(a.name)),
    changed: (current.artifacts || [])
      .filter(a => prevMap.has(a.name) && prevMap.get(a.name) !== a.version)
      .map(a => ({ name: a.name, oldVersion: prevMap.get(a.name)!, newVersion: a.version })),
    unchanged: (current.artifacts || []).filter(a => prevMap.has(a.name) && prevMap.get(a.name) === a.version),
  };
}

export default function UpdatePackDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { availableDms } = useDms();

  const groupId = searchParams.get('groupId');
  const packName = searchParams.get('packName');

  const groupName = availableDms.find(d => d.id === groupId)?.name ?? groupId ?? '—';

  // ── Data state ────────────────────────────────────────────────────────────

  const [updatePacksResponse, setUpdatePacksResponse] = useState<UpdatePacksResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);

  const [descriptorContent, setDescriptorContent] = useState<string | undefined>(undefined);
  const [descriptorLoading, setDescriptorLoading] = useState(false);

  const [signingKey, setSigningKey] = useState<ApiKmsKey | undefined>(undefined);

  const [dmsDevicesResponse, setDmsDevicesResponse] = useState<DeviceListApiResponse | undefined>(undefined);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const [versionsResponse, setVersionsResponse] = useState<{ list: UpdatePackVersion[] } | undefined>(undefined);

  const [devicePackData, setDevicePackData] = useState<{ list: { version: string }[] } | undefined>(undefined);

  const [catalogArtifacts, setCatalogArtifacts] = useState<Artifact[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [globalArtifactsPage, setGlobalArtifactsPage] = useState<{ list: Artifact[] } | undefined>(undefined);
  const [globalArtifactsLoading, setGlobalArtifactsLoading] = useState(false);

  // ── Data queries ──────────────────────────────────────────────────────────

  const fetchUpdatePacksData = useCallback(async () => {
    if (!groupId || !user?.access_token) return;
    setIsLoading(true);
    try {
      const result = await fetchUpdatePacks({ groupId }, { pageSize: 50 });
      setUpdatePacksResponse(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, user?.access_token]);

  useEffect(() => { fetchUpdatePacksData(); }, [fetchUpdatePacksData]);

  const updatePacks = updatePacksResponse?.list || [];
  const updatePack = updatePacks.find(p => p.name === packName);

  const fetchArtifactsData = useCallback(async () => {
    if (!groupId || !packName || !user?.access_token) return;
    setArtifactsLoading(true);
    try {
      const result = await fetchArtifacts({ groupId, packName });
      setArtifacts(result);
    } catch (err) {
      console.error(err);
    } finally {
      setArtifactsLoading(false);
    }
  }, [groupId, packName, user?.access_token]);

  useEffect(() => { fetchArtifactsData(); }, [fetchArtifactsData]);

  const fetchDescriptorData = useCallback(async () => {
    if (!groupId || !packName || !user?.access_token) return;
    setDescriptorLoading(true);
    try {
      const result = await fetchUpdatePackDescriptor({ groupId, packName });
      setDescriptorContent(result);
    } catch (err) {
      console.error(err);
    } finally {
      setDescriptorLoading(false);
    }
  }, [groupId, packName, user?.access_token]);

  useEffect(() => { fetchDescriptorData(); }, [fetchDescriptorData]);

  const fetchSigningKey = useCallback(async () => {
    if (!updatePack?.signature_key_id || !user?.access_token) return;
    try {
      const result = await fetchKmsKey(updatePack.signature_key_id);
      setSigningKey(result);
    } catch (err) {
      console.error(err);
    }
  }, [updatePack?.signature_key_id, user?.access_token]);

  useEffect(() => { fetchSigningKey(); }, [fetchSigningKey]);

  const isPerDevice = updatePack?.encryption_mode === 'per-device';

  const fetchDmsDevices = useCallback(async () => {
    if (!groupId || !user?.access_token || !isPerDevice) return;
    setDevicesLoading(true);
    try {
      const result = await fetchGroupDevices({ groupId });
      setDmsDevicesResponse(result);
    } catch (err) {
      console.error(err);
    } finally {
      setDevicesLoading(false);
    }
  }, [groupId, user?.access_token, isPerDevice]);

  useEffect(() => { fetchDmsDevices(); }, [fetchDmsDevices]);

  const dmsDevices = dmsDevicesResponse?.list || [];

  const fetchVersionsData = useCallback(async () => {
    if (!groupId || !packName || !user?.access_token) return;
    try {
      const result = await fetchUpdatePackVersions({ groupId, packName });
      setVersionsResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [groupId, packName, user?.access_token]);

  useEffect(() => { fetchVersionsData(); }, [fetchVersionsData]);

  const packVersions: UpdatePackVersion[] = versionsResponse?.list || [];

  const fetchDevicePackData = useCallback(async () => {
    if (!packName || !user?.access_token) return;
    try {
      const result = await fetchAllDevicePackVersions({ packName, pageSize: 500 });
      setDevicePackData(result);
    } catch (err) {
      console.error(err);
    }
  }, [packName, user?.access_token]);

  useEffect(() => { fetchDevicePackData(); }, [fetchDevicePackData]);

  const deviceCountsByVersion = useMemo(() => {
    const counts = new Map<string, number>();
    (devicePackData?.list || []).forEach(dpv => {
      counts.set(dpv.version, (counts.get(dpv.version) || 0) + 1);
    });
    return counts;
  }, [devicePackData]);

  const fetchCatalogData = useCallback(async () => {
    if (!groupId || !packName || !user?.access_token) return;
    setCatalogLoading(true);
    try {
      const result = await fetchArtifactCatalog({ groupId, packName });
      setCatalogArtifacts(result);
    } catch (err) {
      console.error(err);
    } finally {
      setCatalogLoading(false);
    }
  }, [groupId, packName, user?.access_token]);

  useEffect(() => { fetchCatalogData(); }, [fetchCatalogData]);

  const isNonSwu = updatePack?.packaging === 'non-swu';

  // ── UI state ──────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState('overview');
  const [isGenerateSwuOpen, setIsGenerateSwuOpen] = useState(false);
  const [isGeneratePackageOpen, setIsGeneratePackageOpen] = useState(false);
  const [isTargetedOpen, setIsTargetedOpen] = useState(false);
  const [versionActionBusy, setVersionActionBusy] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkingArtifactId, setLinkingArtifactId] = useState<string | null>(null);

  const fetchGlobalArtifacts = useCallback(async () => {
    if (!isLinkOpen || !user?.access_token) return;
    setGlobalArtifactsLoading(true);
    try {
      const result = await fetchAllArtifacts({ pageSize: 50, ...(linkSearch ? { name: linkSearch } : {}) });
      setGlobalArtifactsPage(result);
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalArtifactsLoading(false);
    }
  }, [linkSearch, user?.access_token, isLinkOpen]);

  useEffect(() => { fetchGlobalArtifacts(); }, [fetchGlobalArtifacts]);

  const globalArtifacts: Artifact[] = globalArtifactsPage?.list ?? [];
  const catalogIds = new Set(catalogArtifacts.map(a => a.id));

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadArtifactName, setUploadArtifactName] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingArtifactId, setDownloadingArtifactId] = useState<string | null>(null);
  const [isDownloadingCurrent, setIsDownloadingCurrent] = useState(false);

  const onArtifactDrop = useCallback((accepted: File[]) => {
    const f = accepted[0] ?? null;
    if (!f) return;
    setUploadFile(f);
    setUploadArtifactName(prev => prev || f.name.replace(/\.[^/.]+$/, ''));
  }, []);
  const { getRootProps: getArtifactRootProps, getInputProps: getArtifactInputProps, isDragActive: isArtifactDragActive } = useDropzone({ onDrop: onArtifactDrop, multiple: false });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleArtifactUpload = async () => {
    if (!uploadFile || !groupId || !packName || !user?.access_token) return;
    if (uploadVersion.trim() && !isValidSemver(uploadVersion.trim())) {
      toast({ title: 'Invalid version', description: 'Version is optional, but if set it must be X.Y.Z.', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const name = uploadArtifactName.trim() || uploadFile.name.replace(/\.[^/.]+$/, '');
      formData.append('artifact_name', name);
      formData.append('version', uploadVersion.trim());
      const res = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifact/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${user.access_token}` }, body: formData,
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.err || `Upload failed: ${res.status}`); }
      toast({ title: 'Artifact uploaded', description: `${name} registered.` });
      setUploadFile(null); setUploadArtifactName(''); setUploadVersion(''); setIsUploadOpen(false);
      fetchCatalogData();
      fetchCatalogData();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally { setIsUploading(false); }
  };

  const handleLinkArtifact = async (artifactId: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    setLinkingArtifactId(artifactId);
    try {
      await linkArtifactToPack({ groupId, packName, artifactId });
      toast({ title: 'Artifact linked' });
      fetchCatalogData();
    } catch (err: any) {
      toast({ title: 'Link failed', description: err.message, variant: 'destructive' });
    } finally { setLinkingArtifactId(null); }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadVersion = async (version: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    try {
      const blob = await downloadSwuVersion({ groupId, packName, version });
      triggerBlobDownload(blob, `${packName}_v${version}.swu`);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDownloadCatalogArtifact = async (a: Artifact) => {
    if (!user?.access_token || !a.filename) {
      toast({ title: 'No binary', variant: 'destructive' }); return;
    }
    setDownloadingArtifactId(a.id);
    try {
      const blob = await downloadArtifact({ id: a.id });
      triggerBlobDownload(blob, a.filename);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    } finally { setDownloadingArtifactId(null); }
  };

  const handlePerDeviceDownload = async (deviceId: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    try {
      const url = getPerDeviceSwuDownloadUrl(groupId, packName, deviceId);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const blob = await response.blob();
      triggerBlobDownload(blob, `${packName}-${deviceId}.swu`);
      toast({ title: 'Download Started' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Download Failed', description: error.message });
    }
  };

  const handleDownloadVersionArtifacts = async (version: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    setVersionActionBusy(`artifacts:${version}`);
    try {
      const blob = await downloadVersionArtifactsArchive({ groupId, packName, version });
      triggerBlobDownload(blob, `${packName}_v${version}_artifacts.tar.gz`);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    } finally { setVersionActionBusy(null); }
  };

  const handleDownloadSignature = async (version: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    setVersionActionBusy(`signature:${version}`);
    try {
      const sig = await fetchVersionSignature({ groupId, packName, version });
      triggerBlobDownload(new Blob([JSON.stringify(sig, null, 2)], { type: 'application/json' }), `${packName}_v${version}_signature.json`);
    } catch (err: any) {
      toast({ title: 'No signature', description: err.message, variant: 'destructive' });
    } finally { setVersionActionBusy(null); }
  };

  const handleDownload = async () => {
    if (!updatePack?.uri) { toast({ variant: 'destructive', title: 'Download Failed', description: 'URI not available.' }); return; }
    setIsDownloadingCurrent(true);
    try {
      const response = await fetch(updatePack.uri);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = updatePack.packaging === 'non-swu' ? 'tar.gz' : 'swu';
      triggerBlobDownload(blob, updatePack.binaryFileName || `${updatePack.name}-v${updatePack.version}.${ext}`);
      toast({ title: 'Download Started' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Download Failed', description: err.message });
    } finally { setIsDownloadingCurrent(false); }
  };

  const handleDownloadArtifact = async (fileName: string) => {
    try {
      const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifacts/${fileName}`);
      if (!response.ok) throw new Error(`Failed to download ${fileName}`);
      const blob = await response.blob();
      triggerBlobDownload(blob, fileName);
      toast({ title: 'Download Started' });
    } catch {
      toast({ variant: 'destructive', title: 'Download Failed', description: `Failed to download ${fileName}` });
    }
  };

  // ── Early returns ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!updatePack) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <p className="text-center text-muted-foreground pt-6">Distribution set not found.</p>
      </div>
    );
  }

  // ── Build status ─────────────────────────────────────────────────────────

  const buildStatus = updatePack.uri
    ? isNonSwu ? 'Package built' : 'SWU built'
    : updatePack.generationError
      ? 'Build failed'
      : isNonSwu ? 'Package not built' : 'SWU not built';

  const buildDescription = updatePack.uri
    ? isNonSwu
      ? 'Devices download this distribution set as a .tar.gz package.'
      : 'This distribution set is ready for deployment.'
    : updatePack.generationError
      ? updatePack.generationError
      : isNonSwu
        ? 'Upload artifacts, then generate the package devices will download.'
        : 'Upload artifacts, then generate the SWU devices will download.';

  // ── Version history — sorted newest-first ─────────────────────────────────

  const sortedVersions = [...packVersions].sort((a, b) => {
    if (a.version === updatePack.version) return -1;
    if (b.version === updatePack.version) return 1;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });

  const summaryCards = [
    {
      label: 'Version',
      value: `v${updatePack.version}`,
      hint: 'Current build',
    },
    {
      label: 'Artifacts',
      value: catalogArtifacts.length.toString(),
      hint: catalogArtifacts.length === 1 ? 'Linked artifact' : 'Linked artifacts',
    },
    {
      label: 'Installed',
      value: (devicePackData?.list.length ?? 0).toString(),
      hint: 'Device records',
    },
    {
      label: 'Versions',
      value: sortedVersions.length.toString(),
      hint: sortedVersions.length === 1 ? 'Snapshot' : 'Snapshots',
    },
  ];

  return (
    <BreadcrumbPage
      items={[{ label: 'Home', href: '/' }, { label: 'Distribution Set', href: '/package-inventory' }, { label: packName || 'Pack Details' }]}
      className="space-y-5"
      actions={
        <>
          {!isNonSwu && (
            <Button onClick={() => setIsGenerateSwuOpen(true)} variant={updatePack.uri ? 'outline' : 'default'}>
              {updatePack.uri ? 'Regenerate SWU' : 'Generate SWU'}
            </Button>
          )}
          {!isPerDevice && !isNonSwu && (
            <Button onClick={handleDownload} disabled={!updatePack.uri || isDownloadingCurrent}>
              {isDownloadingCurrent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download SWU
            </Button>
          )}
          {isNonSwu && (
            <>
              <Button onClick={() => setIsGeneratePackageOpen(true)} variant={updatePack.uri ? 'outline' : 'default'}>
                <Package className="mr-2 h-4 w-4" />
                {updatePack.uri ? 'Regenerate Package' : 'Generate Package'}
              </Button>
              <Button onClick={handleDownload} disabled={!updatePack.uri || isDownloadingCurrent}>
                {isDownloadingCurrent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download Package
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="secondary" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsTargetedOpen(true)} disabled={!updatePack.uri}>
                Targeted Update
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div className="border-b pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-6 w-6 text-primary" />
            </div>

            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="truncate text-2xl font-semibold tracking-tight" title={updatePack.name}>{updatePack.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">ID</span>
                  <code className="max-w-[360px] truncate rounded border bg-muted px-2 py-0.5 font-mono text-xs">{updatePack.id}</code>
                  <Button
                    variant="ghost"
                    className="h-6 w-6 shrink-0 p-0"
                    onClick={() => { navigator.clipboard.writeText(updatePack.id); toast({ title: 'Copied' }); }}
                  >
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-xs">v{updatePack.version}</Badge>
                <Badge variant="outline" className="text-xs">
                  {updatePack.type === 'rawfile' ? 'Raw File' : updatePack.type === 'firmware' ? 'Firmware' : updatePack.type}
                </Badge>
                <Badge variant="outline" className="text-xs">{isNonSwu ? 'Non-SWU' : 'SWU'}</Badge>
                {updatePack.encryption_mode && <Badge variant="outline" className="text-xs">{updatePack.encryption_mode}</Badge>}
              </div>
            </div>
          </div>

          <div className="xl:flex-1 xl:border-l xl:pl-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {summaryCards.map((item, index) => (
                <div key={item.label} className={cn('min-w-0', index > 0 && 'sm:border-l sm:pl-6')}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{item.value}</p>
                  <p className="text-xs text-muted-foreground/60">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b overflow-x-auto overflow-y-hidden">
            <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
              {([
                { value: 'overview', icon: Info, label: 'Overview' },
                { value: 'artifacts', icon: Package, label: 'Artifacts' },
                { value: 'contents', icon: FileText, label: 'Contents' },
                { value: 'versions', icon: History, label: 'Version History' },
              ] as { value: string; icon: React.ElementType; label: string }[]).map(({ value, icon: Icon, label }) => (
                <TabsTrigger key={value} value={value} className={pageTabsTriggerClass}>
                  <Icon className="h-4 w-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-6 pb-6">

            {/* ── Overview ─────────────────────────────────────────────── */}
            <TabsContent value="overview" className="mt-0">
              <div>
                <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                  <div>
                    <p className="font-semibold">Distribution Set Identity</p>
                    <p className="mt-1 text-sm text-muted-foreground">Core naming, group, and package classification data.</p>
                  </div>
                  <div className="lg:col-span-2">
                    <div className="divide-y">
                      <div className="py-3 first:pt-0">
                        <p className="text-xs font-medium text-muted-foreground">Name</p>
                        <p className="mt-1 text-sm font-medium">{updatePack.name}</p>
                      </div>
                      <div className="py-3">
                        <p className="text-xs font-medium text-muted-foreground">Identifier</p>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{updatePack.id}</p>
                      </div>
                      <div className="py-3">
                        <p className="text-xs font-medium text-muted-foreground">Device Group</p>
                        {groupId ? (
                          <Link href={`/device-groups/details?groupId=${groupId}`} className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                            {groupName}
                          </Link>
                        ) : (
                          <p className="mt-1 text-sm">{groupName}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-4 py-3 last:pb-0 sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Type</p>
                          <p className="mt-1 text-sm">{updatePack.type === 'rawfile' ? 'Raw File' : updatePack.type === 'firmware' ? 'Firmware' : updatePack.type}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Packaging</p>
                          <p className="mt-1 text-sm">{isNonSwu ? 'Non-SWU' : 'SWU'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Created</p>
                          <p className="mt-1 text-sm">{updatePack.createdAt ? format(new Date(updatePack.createdAt), 'PP') : 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                  <div>
                    <p className="font-semibold">Build Status</p>
                    <p className="mt-1 text-sm text-muted-foreground">Current generated artifact state for device deployment.</p>
                  </div>
                  <div className="lg:col-span-2">
                    <div className="divide-y">
                      <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Status</p>
                          <p className="mt-1 text-sm font-medium">{buildStatus}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{buildDescription}</p>
                        </div>
                        <Badge variant={updatePack.uri ? 'secondary' : updatePack.generationError ? 'destructive' : 'outline'} className="shrink-0 text-xs">
                          {updatePack.uri ? 'Built' : updatePack.generationError ? 'Failed' : 'Pending'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-4 py-3 last:pb-0 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Current Version</p>
                          <p className="mt-1 text-sm">v{updatePack.version}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Previous Version Downloads</p>
                          <p className="mt-1 text-sm">{updatePack.allow_previous_version_download ? 'Enabled' : 'Disabled'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                  <div>
                    <p className="font-semibold">Security Configuration</p>
                    <p className="mt-1 text-sm text-muted-foreground">Signing, encryption, and certificate data used for package integrity.</p>
                  </div>
                  <div className="lg:col-span-2">
                    <div className="divide-y">
                      <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">Digital Signature</p>
                          <p className="mt-1 text-sm">{updatePack.signature_alg_name || updatePack.alg_sign || 'Not specified'}</p>
                          {signingKey && <p className="mt-1 text-xs text-muted-foreground">{signingKey.algorithm} key, {signingKey.size} bits</p>}
                          {updatePack.signature_key_id && (
                            <Link href={`/kms/keys/details?keyId=${encodeURIComponent(updatePack.signature_key_id)}`} className="mt-1 block truncate text-xs text-primary hover:underline">
                              {updatePack.signature_key_id}
                            </Link>
                          )}
                        </div>
                        <Badge variant={updatePack.signature_alg_name || updatePack.alg_sign ? 'secondary' : 'outline'} className="shrink-0 text-xs">
                          {updatePack.signature_alg_name || updatePack.alg_sign ? 'Signed' : 'Unsigned'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">Encryption</p>
                          <p className="mt-1 text-sm">{updatePack.encryption_alg_name || 'Not encrypted'}</p>
                          {updatePack.encryption_mode === 'per-device' ? (
                            <p className="mt-1 text-xs text-muted-foreground">Per-device keys from inventory</p>
                          ) : updatePack.encryption_key_name ? (
                            <Link href={`/kms/keys/sym-keys/details?keyId=${encodeURIComponent(updatePack.encryption_key_name)}`} className="mt-1 block truncate text-xs text-primary hover:underline">
                              {updatePack.encryption_key_name}
                            </Link>
                          ) : null}
                          {updatePack.encryption_iv && updatePack.encryption_mode !== 'per-device' && (
                            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">IV: {updatePack.encryption_iv}</p>
                          )}
                        </div>
                        <Badge variant={updatePack.encryption_alg_name ? 'secondary' : 'outline'} className="shrink-0 text-xs">
                          {updatePack.encryption_mode === 'per-device' ? 'Per-device' : updatePack.encryption_alg_name ? 'Shared' : 'Unencrypted'}
                        </Badge>
                      </div>
                      {updatePack.signature_certificate && (
                        <div className="py-3 last:pb-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-muted-foreground">Signature Certificate</p>
                            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(updatePack.signature_certificate!); toast({ title: 'Copied' }); }}>
                              <Copy className="mr-2 h-3 w-3" /> Copy
                            </Button>
                          </div>
                          <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs">
                            {updatePack.signature_certificate}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
                  <div>
                    <p className="font-semibold">Package Files</p>
                    <p className="mt-1 text-sm text-muted-foreground">Generated binary, descriptor, and downloadable companion files.</p>
                  </div>
                  <div className="lg:col-span-2">
                    <div className="divide-y">
                      <div className="py-3 first:pt-0">
                        <p className="text-xs font-medium text-muted-foreground">Package URI</p>
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{updatePack.uri || 'Not available'}</p>
                          {updatePack.uri && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { navigator.clipboard.writeText(updatePack.uri || ''); toast({ title: 'Copied' }); }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {(updatePack.binaryFileName || updatePack.descriptorFileName) && (
                        <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                          {updatePack.binaryFileName && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Binary File</p>
                              <p className="mt-1 break-all text-sm">{updatePack.binaryFileName}</p>
                            </div>
                          )}
                          {updatePack.descriptorFileName && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Descriptor File</p>
                              <p className="mt-1 break-all text-sm">{updatePack.descriptorFileName}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {updatePack.uri && (
                        <div className="py-3 last:pb-0">
                          <p className="text-xs font-medium text-muted-foreground">Downloads</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" disabled={versionActionBusy === `artifacts:${updatePack.version}`} onClick={() => handleDownloadVersionArtifacts(updatePack.version)}>
                              {versionActionBusy === `artifacts:${updatePack.version}` ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Package className="mr-2 h-3.5 w-3.5" />}
                              Artifacts
                            </Button>
                            <Button variant="outline" size="sm" disabled={versionActionBusy === `signature:${updatePack.version}`} onClick={() => handleDownloadSignature(updatePack.version)}>
                              {versionActionBusy === `signature:${updatePack.version}` ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Shield className="mr-2 h-3.5 w-3.5" />}
                              Signature
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Artifacts ────────────────────────────────────────────── */}
            <TabsContent value="artifacts" className="mt-0 space-y-8">
              <div className="space-y-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold">Artifacts</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {updatePack.uri
                        ? `v${updatePack.version} is built and immutable. Create a new version (semver greater than ${updatePack.version}) to change artifacts — current artifacts carry forward.`
                        : 'Binary files for this pack version. Upload or link artifacts that will be built into the SWU/package.'}
                    </p>
                  </div>
                  {updatePack.uri ? (
                    <Button size="sm" variant="outline" onClick={() => router.push(`/updates/create-version?basePackId=${encodeURIComponent(updatePack.id)}&groupId=${encodeURIComponent(groupId || '')}`)}>
                      <Plus className="mr-2 h-4 w-4" /> New Version to Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setIsLinkOpen(v => !v); setIsUploadOpen(false); }}>
                        <Link2 className="mr-2 h-4 w-4" /> Link Existing
                      </Button>
                      <Button size="sm" onClick={() => { setIsUploadOpen(v => !v); setIsLinkOpen(false); }}>
                        <Plus className="mr-2 h-4 w-4" /> Upload Artifact
                      </Button>
                    </div>
                  )}
                </div>

                {isUploadOpen && !updatePack.uri && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <h4 className="text-sm font-semibold">Upload new artifact</h4>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Binary file</Label>
                      <div {...getArtifactRootProps()} className={cn('p-5 border-2 border-dashed rounded-md cursor-pointer transition-colors text-center', isArtifactDragActive || uploadFile ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50')}>
                        <input {...getArtifactInputProps()} />
                        <UploadCloud className={cn('w-8 h-8 mx-auto mb-1', isArtifactDragActive ? 'text-primary' : 'text-muted-foreground')} />
                        {uploadFile
                          ? <p className="text-sm text-foreground">{uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                          : <p className="text-sm text-muted-foreground">{isArtifactDragActive ? 'Drop here…' : 'Drag & drop or click to select'}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Software name</Label>
                        <Input placeholder="e.g. firmware" value={uploadArtifactName} onChange={e => setUploadArtifactName(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Version</Label>
                        <Input placeholder="e.g. 2.1.0" value={uploadVersion} onChange={e => setUploadVersion(e.target.value)} className={cn('h-8 text-sm', uploadVersion && !isValidSemver(uploadVersion) && 'border-destructive')} />
                        {uploadVersion && !isValidSemver(uploadVersion)
                          ? <p className="text-xs text-destructive">Must be X.Y.Z.</p>
                          : <p className="text-xs text-muted-foreground">Optional. If set: X.Y.Z.</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setIsUploadOpen(false); setUploadFile(null); setUploadArtifactName(''); setUploadVersion(''); }}>Cancel</Button>
                      <Button size="sm" onClick={handleArtifactUpload} disabled={!uploadFile || isUploading || (!!uploadVersion && !isValidSemver(uploadVersion))}>
                        {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload & Register'}
                      </Button>
                    </div>
                  </div>
                )}

                {isLinkOpen && !updatePack.uri && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Link existing artifact</h4>
                      <Button variant="ghost" size="sm" onClick={() => { setIsLinkOpen(false); setLinkSearch(''); }}>Cancel</Button>
                    </div>
                    <Input placeholder="Filter by name…" value={linkSearch} onChange={e => setLinkSearch(e.target.value)} className="h-8 text-sm" />
                    {globalArtifactsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                    ) : globalArtifacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No artifacts found.</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                        {globalArtifacts.map(a => {
                          const alreadyLinked = catalogIds.has(a.id);
                          return (
                            <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <span className="font-medium">{a.name}</span>
                                {a.version && <span className="ml-2 font-mono text-xs text-muted-foreground">v{a.version}</span>}
                                <span className="ml-2 text-xs text-muted-foreground truncate">{a.filename}</span>
                              </div>
                              {alreadyLinked ? (
                                <span className="text-xs text-muted-foreground ml-3 shrink-0">already in catalog</span>
                              ) : (
                                <Button size="sm" variant="outline" className="ml-3 shrink-0" disabled={linkingArtifactId === a.id} onClick={() => handleLinkArtifact(a.id)}>
                                  {linkingArtifactId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Link'}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {catalogLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading artifacts…</div>
                ) : catalogArtifacts.length === 0 ? (
                  <div className="rounded-md border-2 border-dashed border-border p-8 text-center bg-muted/10">
                    <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No artifacts uploaded yet</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setIsUploadOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Upload first artifact
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Software name</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead>SHA-256</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Binary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalogArtifacts.map(a => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell><span className="font-mono text-sm">{a.version || <span className="italic text-muted-foreground">—</span>}</span></TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{a.filename}</TableCell>
                          <TableCell className="text-right text-sm">{formatBytes(a.size)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate" title={a.checksum}>{a.checksum || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{a.uploaded_at ? format(new Date(a.uploaded_at), 'PP') : '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" disabled={downloadingArtifactId === a.id || !a.filename} onClick={() => handleDownloadCatalogArtifact(a)}>
                              {downloadingArtifactId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {isPerDevice && updatePack.uri && (
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold">Per-Device SWU Downloads</p>
                    <p className="mt-1 text-sm text-muted-foreground">This pack uses per-device encryption. Each device has its own SWU encrypted with its unique key.</p>
                  </div>
                  {devicesLoading ? (
                    <p className="text-sm text-muted-foreground italic">Loading devices…</p>
                  ) : dmsDevices.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No devices found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Device ID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Download</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dmsDevices.map(device => (
                          <TableRow key={device.id}>
                            <TableCell className="font-mono text-sm">{device.id}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{device.status}</Badge></TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => handlePerDeviceDownload(device.id)}>
                                <Download className="mr-2 h-4 w-4" /> Download SWU
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── Contents ─────────────────────────────────────────────── */}
            <TabsContent value="contents" className="mt-0">
              <div className="space-y-4">
                <p className="font-semibold">Package Contents</p>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  <div className="space-y-3 lg:col-span-2">
                    <div className="text-sm font-semibold text-muted-foreground">Artifacts</div>
                    <div className="overflow-x-auto">
                      {(() => {
                        let filesToDisplay: string[] = [];
                        if (!artifactsLoading && artifacts.length > 0) {
                          filesToDisplay = artifacts;
                        } else if (!artifactsLoading) {
                          const desc = descriptorContent || updatePack.descriptorContent || '';
                          try {
                            const softwareMatch = desc.match(/software\s*=\s*\{([\s\S]*?)\}/);
                            if (softwareMatch) {
                              const ecsMatch = softwareMatch[1].match(/ecs\s*=\s*\{([\s\S]*?)\}/);
                              if (ecsMatch) {
                                const filesMatch = ecsMatch[1].match(/files:\s*\(([\s\S]*?)\)/);
                                if (filesMatch) {
                                  const filenameMatches = filesMatch[1].match(/filename\s*=\s*"([^"]+)"/g);
                                  if (filenameMatches) {
                                    filesToDisplay = filenameMatches.map(m => { const fm = m.match(/filename\s*=\s*"([^"]+)"/); return fm ? fm[1] : m; });
                                  }
                                }
                              }
                            }
                          } catch { /* ignore */ }
                        }
                        if (artifactsLoading) return <p className="text-sm text-muted-foreground italic p-4">Loading files…</p>;
                        if (filesToDisplay.length === 0) return <p className="text-sm text-muted-foreground italic p-4">No files found.</p>;
                        return (
                          <Table>
                            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="w-20 text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {filesToDisplay.map((fileName, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{fileName}</TableCell>
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => handleDownloadArtifact(fileName)} className="h-8 w-8">
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="space-y-3 lg:col-span-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-muted-foreground">Descriptor Configuration</div>
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(descriptorContent || updatePack.descriptorContent || ''); toast({ title: 'Copied' }); }}>
                        <Copy className="mr-2 h-3 w-3" /> Copy
                      </Button>
                    </div>
                    {descriptorLoading ? (
                      <div className="bg-muted/50 p-6 rounded-lg border flex items-center justify-center h-96">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-hidden shadow-sm">
                        <Editor
                          height="400px"
                          defaultLanguage="lua"
                          value={descriptorContent || updatePack.descriptorContent || 'No descriptor available'}
                          theme="vs-dark"
                          options={{ readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12, lineNumbers: 'on', wordWrap: 'on', automaticLayout: true, padding: { top: 10, bottom: 10 } }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Version History — accordion ───────────────────────────── */}
            <TabsContent value="versions" className="mt-0 space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold">Version History</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Each built version is a snapshot. Expand a version to see what changed from the previous one.{' '}
                    {updatePack.allow_previous_version_download
                      ? 'Previous versions can be downloaded.'
                      : 'Only the current version can be downloaded.'}
                  </p>
                </div>
                <Badge variant={updatePack.allow_previous_version_download ? 'default' : 'secondary'} className="text-xs">
                  {updatePack.allow_previous_version_download ? 'Previous-version download on' : 'Previous-version download off'}
                </Badge>
              </div>

              {sortedVersions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No version snapshots recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {sortedVersions.map((v, idx) => {
                    const isCurrent = v.version === updatePack.version;
                    const isExpanded = expandedVersion === v.version;
                    const prevVersion = sortedVersions[idx + 1]; // next in sorted-desc = previous build
                    const delta = computeDelta(v, prevVersion);
                    const deviceCount = deviceCountsByVersion.get(v.version);
                    const downloadable = isCurrent || !!updatePack.allow_previous_version_download;
                    const perDevice = (v.encryption_mode || updatePack.encryption_mode) === 'per-device';

                    return (
                      <div key={v.id} className={cn('rounded-lg border transition-colors', isCurrent ? 'border-primary/30 bg-primary/5' : 'border-border bg-card')}>
                        {/* Row header */}
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
                          onClick={() => setExpandedVersion(isExpanded ? null : v.version)}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

                          <span className="font-mono font-semibold text-sm">v{v.version}</span>
                          {isCurrent && <Badge variant="outline" className="text-xs py-0 h-5">current</Badge>}

                          <span className="text-xs text-muted-foreground ml-1">
                            {v.created_at ? format(new Date(v.created_at), 'PP') : '—'}
                          </span>

                          {/* artifact count pill */}
                          {v.artifacts && v.artifacts.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <Package className="h-3 w-3" />
                              {v.artifacts.length} artifact{v.artifacts.length !== 1 ? 's' : ''}
                            </span>
                          )}

                          {/* device count pill */}
                          {deviceCount != null && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {deviceCount} device{deviceCount !== 1 ? 's' : ''}
                            </span>
                          )}

                          {/* delta summary when collapsed */}
                          {!isExpanded && delta && (delta.added.length > 0 || delta.removed.length > 0 || delta.changed.length > 0) && (
                            <span className="ml-auto mr-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <GitCompare className="h-3 w-3" />
                              {[
                                delta.added.length > 0 && `+${delta.added.length}`,
                                delta.changed.length > 0 && `~${delta.changed.length}`,
                                delta.removed.length > 0 && `-${delta.removed.length}`,
                              ].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </button>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">

                            {/* Artifact delta */}
                            {delta ? (
                              <div className="space-y-3">
                                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                  <GitCompare className="h-3.5 w-3.5" />
                                  Changes from v{prevVersion?.version}
                                </p>

                                <div className="space-y-1.5">
                                  {delta.added.map(a => (
                                    <div key={a.name} className="flex items-center gap-2 text-sm">
                                      <span className="h-2 w-2 shrink-0 rounded-sm bg-muted-foreground" />
                                      <span className="font-medium">{a.name}</span>
                                      <span className="font-mono text-xs text-muted-foreground">v{a.version}</span>
                                      <Badge variant="secondary" className="h-4 py-0 text-xs">added</Badge>
                                    </div>
                                  ))}
                                  {delta.changed.map(a => (
                                    <div key={a.name} className="flex items-center gap-2 text-sm">
                                      <span className="h-2 w-2 shrink-0 rounded-sm bg-muted-foreground" />
                                      <span className="font-medium">{a.name}</span>
                                      <span className="font-mono text-xs text-muted-foreground line-through">v{a.oldVersion}</span>
                                      <span className="text-muted-foreground">→</span>
                                      <span className="font-mono text-xs">v{a.newVersion}</span>
                                      <Badge variant="outline" className="h-4 py-0 text-xs">updated</Badge>
                                    </div>
                                  ))}
                                  {delta.removed.map(a => (
                                    <div key={a.name} className="flex items-center gap-2 text-sm">
                                      <span className="h-2 w-2 shrink-0 rounded-sm bg-muted-foreground" />
                                      <span className="font-medium line-through text-muted-foreground">{a.name}</span>
                                      <span className="font-mono text-xs text-muted-foreground">v{a.version}</span>
                                      <Badge variant="destructive" className="h-4 py-0 text-xs">removed</Badge>
                                    </div>
                                  ))}
                                  {delta.unchanged.map(a => (
                                    <div key={a.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <span className="h-2 w-2 shrink-0 rounded-sm bg-muted-foreground/30" />
                                      <span>{a.name}</span>
                                      <span className="font-mono text-xs">v{a.version}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : v.artifacts && v.artifacts.length > 0 ? (
                              <div className="space-y-3">
                                <p className="text-xs font-medium text-muted-foreground">Contents</p>
                                <div className="space-y-1.5">
                                  {v.artifacts.map(a => (
                                    <div key={a.name} className="flex items-center gap-2 text-sm">
                                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="font-medium">{a.name}</span>
                                      <span className="font-mono text-xs text-muted-foreground">v{a.version}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {/* Metadata row */}
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                              {v.checksum && <span>SHA-256: <span className="font-mono">{v.checksum.slice(0, 16)}…</span></span>}
                              {v.encryption_mode && <span>Encryption: {v.encryption_mode}</span>}
                            </div>

                            {/* Download actions */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button variant="outline" size="sm" disabled={versionActionBusy === `artifacts:${v.version}`} onClick={() => handleDownloadVersionArtifacts(v.version)}>
                                {versionActionBusy === `artifacts:${v.version}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                                Artifacts
                              </Button>
                              <Button variant="outline" size="sm" disabled={versionActionBusy === `signature:${v.version}`} onClick={() => handleDownloadSignature(v.version)}>
                                {versionActionBusy === `signature:${v.version}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
                                Signature
                              </Button>
                              {!isNonSwu && !perDevice && (
                                <Button variant="outline" size="sm" disabled={!downloadable} title={!downloadable ? 'Previous-version download disabled for this pack' : undefined} onClick={() => handleDownloadVersion(v.version)}>
                                  <Download className="h-3 w-3 mr-1" /> .swu
                                </Button>
                              )}
                              {perDevice && <span className="text-xs text-muted-foreground self-center italic">per-device SWU</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

          </div>
        </Tabs>

      {!isNonSwu && updatePack && (
        <GenerateSwuDialog
          open={isGenerateSwuOpen}
          onOpenChange={setIsGenerateSwuOpen}
          groupId={groupId!}
          packName={packName!}
          catalogArtifacts={catalogArtifacts}
          onGenerated={() => {
            fetchUpdatePacksData();
            fetchVersionsData();
            fetchDescriptorData();
            fetchCatalogData();
          }}
        />
      )}

      {isNonSwu && updatePack && (
        <GeneratePackageDialog
          open={isGeneratePackageOpen}
          onOpenChange={setIsGeneratePackageOpen}
          groupId={groupId!}
          packName={packName!}
          catalogArtifacts={catalogArtifacts}
          onGenerated={() => {
            fetchUpdatePacksData();
            fetchVersionsData();
            fetchCatalogData();
          }}
        />
      )}

      {updatePack && (
        <TargetedUpdateDialog
          open={isTargetedOpen}
          groupId={groupId!}
          pack={{ id: updatePack.id, name: updatePack.name, version: updatePack.version }}
          onClose={() => setIsTargetedOpen(false)}
        />
      )}
    </BreadcrumbPage>
  );
}
