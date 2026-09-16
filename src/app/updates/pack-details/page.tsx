"use client";

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Download, Package, FileText, Info,
  Copy, Shield, History, Plus, Loader2, UploadCloud, Link2,
  ChevronDown, ChevronRight, MoreVertical, Layers
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useDms } from '@/contexts/DmsContext';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import {
  fetchUpdatePacks, fetchArtifacts, fetchUpdatePackDescriptor, fetchGroupDevices, type GroupDeviceRef,
  getPerDeviceSwuDownloadUrl, fetchUpdatePackVersions, downloadSwuVersion,
  fetchArtifactCatalog, downloadArtifact, fetchVersionSignature,
  downloadVersionArtifactsArchive, fetchAllArtifacts, linkArtifactToPack,
  fetchAllDevicePackVersions, downloadCurrentBuild, deleteUpdatePackApi,
} from '@/lib/iot-api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { fetchKmsKey, type ApiKmsKey } from '@/lib/kms-data';
import { GenerateSwuDialog } from '@/components/iot/generate-swu-dialog';
import { GeneratePackageDialog } from '@/components/iot/generate-package-dialog';
import { TargetedUpdateDialog } from '@/components/iot/targeted-update-dialog';
import { SoftwareModulesCard } from '@/components/iot/SoftwareModulesCard';
import { PackPreconditionsCard } from '@/components/iot/pack-preconditions-card';
import { VersionModulesPanel } from '@/components/iot/version-modules-panel';
import { HawkbitUnsupportedFeatures } from '@/components/iot/HawkbitUnsupportedFeatures';
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
  const { isSupported: isUpdatesCapabilitySupported } = useUpdatesCapabilities();
  // GetVersionSignature / DownloadVersionArtifactsArchive are this platform's KMS-signed anti-rollback
  // manifest pipeline (pkg/updates.CapabilityArtifactSignatures) — hawkbit mode has no equivalent.
  const artifactSignaturesSupported = isUpdatesCapabilitySupported('artifact_signatures');
  // GetArtifactPath (the staged-build-dir, by-filename download route behind handleDownloadArtifact
  // below) has no hawkBit translation — hawkBit artifacts are addressed by ID within a software
  // module (pkg/updates.CapabilityArtifactDownloadByName). The catalog tab's by-ID download
  // (handleDownloadCatalogArtifact) is unaffected and needs no gating.
  const artifactDownloadByNameSupported = isUpdatesCapabilitySupported('artifact_download_by_name');
  // Whether this distribution set can be addressed as a composition of software modules — an 'os'
  // 'os' (core firmware/OS) module plus 'application' modules, each with its own deliverable
  // (pkg/updates.CapabilitySoftwareModuleComposition). Reported dynamically: in hawkbit mode it
  // depends on which module types that hawkBit server actually has configured.
  const compositionSupported = isUpdatesCapabilitySupported('software_module_composition');
  // Whether each software module carries its OWN deliverable. This decides where a build even
  // happens: with it (hawkbit) the modules ARE the SWUs, so the set-level Generate/Download SWU
  // buttons are meaningless — building and downloading are per module. Without it (native) the set
  // builds one SWU from every module's artifacts and the header buttons are the right place.
  const perModuleDeliverables = isUpdatesCapabilitySupported('software_module_deliverables');

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

  const [dmsDevicesResponse, setDmsDevicesResponse] = useState<{ list: GroupDeviceRef[] } | undefined>(undefined);
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
      // A pack that has never had a descriptor generated returns 404. That's a
      // normal state, not a failure, so surface it as "no descriptor" instead of
      // logging an error on every visit to such a pack.
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes('404') || msg.includes('not found')) {
        setDescriptorContent('');
      } else {
        console.error(err);
      }
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
  // `status` is the backend's authoritative, mode-agnostic build flag — a hawkbit-mode pack is
  // built the moment it has an artifact and never gets a `uri` (there's no separate build step to
  // produce one), so `uri` truthiness alone under-reports "built" for that backend.
  const isBuilt = updatePack?.status === 'built';
  // A build that ran and broke, as opposed to one nobody has started. The pack is still editable and
  // the build still retryable — this only drives what we tell the operator, and whether we offer the
  // way out (retry, or delete) instead of a pack that looks untouched.
  const buildError = updatePack?.status === 'build_failed'
    ? updatePack.last_build_error || 'The last build attempt failed.'
    : updatePack?.last_build_error || updatePack?.generationError;

  // ── UI state ──────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState('overview');
  const [isGenerateSwuOpen, setIsGenerateSwuOpen] = useState(false);
  const [isGeneratePackageOpen, setIsGeneratePackageOpen] = useState(false);
  const [isTargetedOpen, setIsTargetedOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [versionActionBusy, setVersionActionBusy] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkingArtifactId, setLinkingArtifactId] = useState<string | null>(null);

  // Deleting from here matters most for a pack whose build failed: the name stays taken until it is
  // gone (the backend rejects a duplicate name within a group), so without this the operator has to
  // leave the flow entirely and hunt the pack down in Package Inventory to get unstuck.
  const handleDeletePack = async () => {
    if (!groupId || !packName) return;
    setIsDeleting(true);
    try {
      await deleteUpdatePackApi({ groupId, packName });
      toast({ title: 'Distribution Set Deleted', description: `"${packName}" has been deleted.` });
      router.push('/package-inventory');
    } catch (err: Error | any) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: `Could not delete "${packName}". ${err.message}` });
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

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

  // The extension this set's deliverable actually has. A non-SWU set delivers a .tar.gz package,
  // so naming its download ".swu" produced a file that lies about its own contents.
  const deliverableExt = updatePack?.packaging === 'non-swu' ? 'tar.gz' : 'swu';

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
      triggerBlobDownload(blob, `${packName}_v${version}.${deliverableExt}`);
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
      triggerBlobDownload(blob, `${packName}-${deviceId}.${deliverableExt}`);
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
    if (!updatePack || !isBuilt || !groupId || !packName) { toast({ variant: 'destructive', title: 'Download Failed', description: 'This pack has not been built yet.' }); return; }
    setIsDownloadingCurrent(true);
    try {
      // Prefer the pack's own `uri` when the backend set one (native mode); fall back to the
      // generic current-build route otherwise — needed for hawkbit mode, which reports a pack
      // built without ever populating `uri` (see downloadCurrentBuild's comment).
      const blob = updatePack.uri
        ? await (async () => {
            const response = await fetch(updatePack.uri!);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.blob();
          })()
        : await downloadCurrentBuild({ groupId, packName, isNonSwu });
      triggerBlobDownload(blob, updatePack.binaryFileName || `${updatePack.name}-v${updatePack.version}.${deliverableExt}`);
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

  const buildStatus = isBuilt
    ? isNonSwu ? 'Package built' : 'SWU built'
    : buildError
      ? 'Build failed'
      : isNonSwu ? 'Package not built' : 'SWU not built';

  const buildDescription = isBuilt
    ? isNonSwu
      ? 'Devices download this distribution set as a .tar.gz package.'
      : 'This distribution set is ready for deployment.'
    : buildError
      ? buildError
      : isNonSwu
        ? 'Upload artifacts, then generate the package devices will download.'
        : 'Upload artifacts, then generate the SWU devices will download.';

  // What an artifact actually IS on this set, which is not the same question everywhere and was
  // previously answered as "an input to the SWU" regardless. Three genuinely different shapes:
  //
  //   - non-SWU: nothing is built at all. Whatever is added IS what each device downloads and
  //     installs — a raw binary, an archive, an already-built .swu, whatever the device expects.
  //   - SWU with per-module deliverables (hawkbit): each software module builds its own .swu, so an
  //     artifact belongs to a module and the building happens on that tab, not here.
  //   - SWU built at set level (native): the artifacts plus a sw-description are the INPUTS one SWU
  //     is built from — or an already-built .swu can be added directly and ships as-is.
  //
  // Stated per set because getting it wrong is not cosmetic: "will be built into the SWU" told an
  // operator on a non-SWU set that a build would happen to their file, and none ever would.
  const artifactRole = isNonSwu
    ? 'Nothing is built here: whatever you add is what each device downloads and installs — a binary, an archive, or an already-built image.'
    : perModuleDeliverables
      ? 'On this backend each software module builds its own SWU, so an artifact belongs to a module — add and build them on the Software Modules tab.'
      : 'The inputs one SWU is built from, together with a sw-description. An already-built .swu can be added instead, and is delivered as-is.';

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
          {/* A set-level SWU only exists where the set builds ONE deliverable from every module.
              Where each module carries its own .swu (hawkbit), these buttons are wrong in two ways:
              "Regenerate SWU" always failed with "already built — create a new version", and
              "Download SWU" silently returned a single module's .swu for a set that ships several.
              Building and downloading belong per module, on the Software Modules tab. */}
          {!isNonSwu && !perModuleDeliverables && (
            <Button onClick={() => setIsGenerateSwuOpen(true)} variant={isBuilt ? 'outline' : 'default'}>
              {isBuilt ? 'Regenerate SWU' : 'Generate SWU'}
            </Button>
          )}
          {!isPerDevice && !isNonSwu && !perModuleDeliverables && (
            <Button onClick={handleDownload} disabled={!isBuilt || isDownloadingCurrent}>
              {isDownloadingCurrent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download SWU
            </Button>
          )}
          {/* The replacement: point the operator at where the work actually happens. */}
          {!isNonSwu && perModuleDeliverables && (
            <Button variant="outline" onClick={() => setActiveTab('modules')}>
              <Layers className="mr-2 h-4 w-4" />
              Build software modules
            </Button>
          )}
          {isNonSwu && (
            <>
              <Button onClick={() => setIsGeneratePackageOpen(true)} variant={isBuilt ? 'outline' : 'default'}>
                {isBuilt ? 'Regenerate Package' : 'Generate Package'}
              </Button>
              <Button onClick={handleDownload} disabled={!isBuilt || isDownloadingCurrent}>
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
              <DropdownMenuItem onClick={() => setIsTargetedOpen(true)} disabled={!isBuilt}>
                Targeted Update
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className="text-destructive focus:text-destructive">
                Delete Distribution Set
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
              // Software Modules is capability-gated rather than always present: on a backend without
              // composition every request behind it answers 501, so an always-visible tab would be a
              // dead end. Filtered out of the trigger list here AND its TabsContent renders the
              // not-available state, so neither route reaches a failing request.
              ...(compositionSupported
                ? [{ value: 'modules', icon: Layers, label: 'Software Modules' }]
                : []),
              // Artifacts is the INVERSE of Software Modules, not a companion to it. Where
              // composition exists, a binary always belongs to some module and Software Modules
              // shows it there — a second flat list of the same files was redundant, and worse, it
              // offered a pack-level upload that cannot say which module it meant. Where
              // composition does not exist, this is the only view of a pack's binaries, so it stays.
              ...(compositionSupported
                ? []
                : [{ value: 'artifacts', icon: Package, label: 'Artifacts' }]),
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
                      <Badge variant={isBuilt ? 'secondary' : buildError ? 'destructive' : 'outline'} className="shrink-0 text-xs">
                        {isBuilt ? 'Built' : buildError ? 'Failed' : 'Pending'}
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
                  <p className="font-semibold">Launch Preconditions</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Requirements a device must already meet before a campaign may deploy this set to it.
                  </p>
                </div>
                <div className="lg:col-span-2">
                  <PackPreconditionsCard
                    groupId={groupId ?? ''}
                    packName={packName ?? ''}
                    onSaved={fetchUpdatePacksData}
                  />
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
                    {/* Signed manifest + artifacts-archive downloads are tied to the native backend's
                        KMS-signing pipeline, which hawkbit mode doesn't have (it never sets `uri`
                        either) — checking `uri` here isn't a build-status check, it's deliberately
                        scoping this section to backends that actually support it. */}
                    {updatePack.uri && (
                      <div className="py-3 last:pb-0">
                        <p className="text-xs font-medium text-muted-foreground">Downloads</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" disabled={versionActionBusy === `artifacts:${updatePack.version}`} onClick={() => handleDownloadVersionArtifacts(updatePack.version)}>
                            {versionActionBusy === `artifacts:${updatePack.version}` ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Package className="mr-2 h-3.5 w-3.5" />}
                            Artifacts
                          </Button>
                          {/* Gated on the capability like its twin in the Version History table.
                              GetVersionSignature answers 501 where signatures are unsupported, and
                              while the enclosing `updatePack.uri` check already keeps this block out
                              of hawkbit mode today, that is incidental — it scopes on a URI, not on
                              signing. Gating explicitly means a backend that populates `uri` but
                              cannot sign still never offers a button that 501s. */}
                          {artifactSignaturesSupported && (
                            <Button variant="outline" size="sm" disabled={versionActionBusy === `signature:${updatePack.version}`} onClick={() => handleDownloadSignature(updatePack.version)}>
                              {versionActionBusy === `signature:${updatePack.version}` ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Shield className="mr-2 h-3.5 w-3.5" />}
                              Signature
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Which of hawkBit's own options this platform leaves at hawkBit's defaults. Renders
                  only in hawkbit mode, and is collapsed by default so it informs without competing
                  with the pack's own details. */}
              <details className="group border-t py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold marker:content-none">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    hawkBit options not managed here
                  </span>
                </summary>
                <div className="pt-4">
                  <HawkbitUnsupportedFeatures />
                </div>
              </details>
            </div>
          </TabsContent>

          {/* ── Software Modules ─────────────────────────────────────── */}
          <TabsContent value="modules" className="mt-0">
            <div className="space-y-4">
              <div>
                <p className="font-semibold">Software Modules</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  What this distribution set is composed of: an OS/firmware module plus the applications on top of it, each
                  independently versioned and carrying its own artifacts.
                  {isNonSwu
                    ? ' Nothing is built into a SWU here: this set delivers its artifacts as they are, and the modules say which part of the set each belongs to.'
                    : perModuleDeliverables
                      ? ' Each module is delivered as its own SWU, so building happens here rather than at the set level.'
                      : ' The set builds one SWU from every module’s artifacts — use Generate SWU above.'}
                </p>
              </div>
              <SoftwareModulesCard
                groupId={groupId ?? ''}
                packName={packName ?? ''}
                packVersion={updatePack?.version}
                packIsBuilt={isBuilt}
                packaging={updatePack?.packaging}
              />
            </div>
          </TabsContent>

          {/* ── Artifacts ────────────────────────────────────────────── */}
          <TabsContent value="artifacts" className="mt-0 space-y-8">
            <div className="space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold">Artifacts</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isBuilt
                      ? `v${updatePack.version} is built and immutable. Create a new version (semver greater than ${updatePack.version}) to change artifacts — current artifacts carry forward.`
                      : artifactRole}
                  </p>
                  {/* Says how this differs from Software Modules, which lists the same binaries. The
                      two are not duplicates: this is where a binary enters the catalogue and gets
                      linked, that is where it is attributed to a part of the composition. Without
                      saying so, the flat list reads as a redundant copy. */}
                  {compositionSupported && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is the flat view — every binary across the whole set, and where you upload or
                      link one. To see which software module each belongs to
                      {perModuleDeliverables ? ', and to build them,' : ','} use the Software Modules tab.
                    </p>
                  )}
                </div>
                {isBuilt ? (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/updates/create-version?basePackId=${encodeURIComponent(updatePack.id)}&groupId=${encodeURIComponent(groupId || '')}`)}>
                    <Plus className="mr-2 h-4 w-4" /> New Version to Edit
                  </Button>
                ) : (
                  /* Full size, not `sm`: adding an artifact is the primary thing this tab is for
                     and the small pair read as incidental controls next to the paragraph above. */
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setIsLinkOpen(v => !v); setIsUploadOpen(false); }}>
                      <Link2 className="mr-2 h-4 w-4" /> Link existing
                    </Button>
                    <Button onClick={() => { setIsUploadOpen(v => !v); setIsLinkOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" /> Add artifact
                    </Button>
                  </div>
                )}
              </div>

              {isUploadOpen && !isBuilt && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">Upload new artifact</h4>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      File{isNonSwu ? ' — a binary, an archive, or an already-built image' : ' — a build input, or an already-built .swu'}
                    </Label>
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

              {isLinkOpen && !isBuilt && (
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
                /* Deliberately NOT a dashed box. Every dropzone on this page is a dashed box with a
                   centred icon (see the upload panel above, and ModuleFilesDropzone), so an empty
                   state drawn the same way reads as "drop a file here" — and this one takes no
                   drop, so the gesture silently does nothing. A solid panel with a real button says
                   what actually has to happen. */
                <div className="rounded-md border border-border bg-muted/20 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-[16rem] flex-1 space-y-1">
                      <p className="text-sm font-semibold">No artifacts on this version yet</p>
                      <p className="text-sm text-muted-foreground">{artifactRole}</p>
                    </div>
                    {!isBuilt && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button variant="outline" onClick={() => { setIsLinkOpen(true); setIsUploadOpen(false); }}>
                          <Link2 className="mr-2 h-4 w-4" /> Link existing
                        </Button>
                        <Button onClick={() => { setIsUploadOpen(true); setIsLinkOpen(false); }}>
                          <Plus className="mr-2 h-4 w-4" /> Add artifact
                        </Button>
                      </div>
                    )}
                  </div>
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
              <p className="mt-1 text-sm text-muted-foreground">{artifactRole}</p>
              {/* A sw-description is an SWU concept: it is the recipe a SWU build reads. A non-SWU
                  set builds nothing, so it has none and never will — showing it a 400px editor
                  reading "No descriptor available" stated the opposite, that one was missing. Its
                  artifacts take the full width instead. */}
              <div className={cn('grid grid-cols-1 gap-6', !isNonSwu && 'lg:grid-cols-5')}>
                <div className={cn('space-y-3', !isNonSwu && 'lg:col-span-2')}>
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
                      if (filesToDisplay.length === 0) return (
                        <div className="rounded-md border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium">No artifacts on this version yet</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {isBuilt
                              ? 'This version is built and immutable — create a new version to change what it delivers.'
                              : compositionSupported
                                ? 'An artifact belongs to a software module, which is where one is added.'
                                : 'Add one on the Artifacts tab.'}
                          </p>
                          {!isBuilt && (
                            <Button
                              className="mt-3"
                              onClick={() => setActiveTab(compositionSupported ? 'modules' : 'artifacts')}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add artifact
                            </Button>
                          )}
                        </div>
                      );
                      return (
                        <Table>
                          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="w-20 text-right">Actions</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {filesToDisplay.map((fileName, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{fileName}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={!artifactDownloadByNameSupported}
                                    title={!artifactDownloadByNameSupported ? 'Not supported by the active updates backend' : undefined}
                                    onClick={() => handleDownloadArtifact(fileName)}
                                    className="h-8 w-8"
                                  >
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
                {!isNonSwu && (
                <div className="space-y-3 lg:col-span-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-muted-foreground">sw-description</div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!(descriptorContent || updatePack.descriptorContent)}
                      onClick={() => { navigator.clipboard.writeText(descriptorContent || updatePack.descriptorContent || ''); toast({ title: 'Copied' }); }}
                    >
                      <Copy className="mr-2 h-3 w-3" /> Copy
                    </Button>
                  </div>
                  {descriptorLoading ? (
                    <div className="bg-muted/50 p-6 rounded-lg border flex items-center justify-center h-96">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : descriptorContent || updatePack.descriptorContent ? (
                    <div className="rounded-lg border overflow-hidden shadow-sm">
                      <Editor
                        height="400px"
                        defaultLanguage="lua"
                        value={descriptorContent || updatePack.descriptorContent || ''}
                        theme="vs-dark"
                        options={{ readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12, lineNumbers: 'on', wordWrap: 'on', automaticLayout: true, padding: { top: 10, bottom: 10 } }}
                      />
                    </div>
                  ) : (
                    <div className="rounded-md border border-border bg-muted/20 p-4">
                      <p className="text-sm font-medium">No sw-description yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        The recipe the SWU build reads: which files to install and where. It is supplied with the
                        build{perModuleDeliverables ? ', per software module' : ''} — a set without one falls back
                        to whatever the build is given.
                      </p>
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>
          </TabsContent>

            {/* ── Version History ──────────────────────────────────────── */}
            <TabsContent value="versions" className="mt-0">
              <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10 first:pt-0">
                <div>
                  <p className="font-semibold">Version History</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Built snapshots for this distribution set. Expand a row to compare artifact changes.
                  </p>
                </div>

                <div className="lg:col-span-2">
                  <div className="divide-y">
                    <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Previous Version Downloads</p>
                        <p className="mt-1 text-sm">{updatePack.allow_previous_version_download ? 'Enabled' : 'Disabled'}</p>
                      </div>
                      <Badge variant={updatePack.allow_previous_version_download ? 'secondary' : 'outline'} className="text-xs">
                        {updatePack.allow_previous_version_download ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>

                    <div className="py-3 last:pb-0">
                      {sortedVersions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No version snapshots recorded yet.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Version</TableHead>
                              <TableHead>Built</TableHead>
                              <TableHead>Artifacts</TableHead>
                              <TableHead>Devices</TableHead>
                              <TableHead>Changes</TableHead>
                              <TableHead className="text-right">Downloads</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedVersions.map((v, idx) => {
                              const isCurrent = v.version === updatePack.version;
                              const isExpanded = expandedVersion === v.version;
                              const prevVersion = sortedVersions[idx + 1];
                              const delta = computeDelta(v, prevVersion);
                              const deviceCount = deviceCountsByVersion.get(v.version);
                              const downloadable = isCurrent || !!updatePack.allow_previous_version_download;
                              const perDevice = (v.encryption_mode || updatePack.encryption_mode) === 'per-device';
                              const changedCount = delta ? delta.added.length + delta.changed.length + delta.removed.length : 0;
                              const changeSummary = delta
                                ? changedCount > 0
                                  ? [
                                    delta.added.length > 0 && `+${delta.added.length}`,
                                    delta.changed.length > 0 && `~${delta.changed.length}`,
                                    delta.removed.length > 0 && `-${delta.removed.length}`,
                                  ].filter(Boolean).join(' ')
                                  : 'No changes'
                                : 'Initial snapshot';

                              return (
                                <React.Fragment key={v.id || v.version}>
                                  <TableRow>
                                    <TableCell>
                                      <button
                                        type="button"
                                        className="flex items-center gap-2 text-left font-medium text-primary hover:underline"
                                        onClick={() => setExpandedVersion(isExpanded ? null : v.version)}
                                      >
                                        {isExpanded
                                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                        v{v.version}
                                      </button>
                                      {isCurrent && <p className="mt-1 text-xs text-muted-foreground">Current</p>}
                                    </TableCell>
                                    <TableCell>{v.created_at ? format(new Date(v.created_at), 'PP') : 'N/A'}</TableCell>
                                    <TableCell>{v.artifacts?.length || 0}</TableCell>
                                    <TableCell>{deviceCount ?? 0}</TableCell>
                                    <TableCell>{changeSummary}</TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={!artifactSignaturesSupported || versionActionBusy === `artifacts:${v.version}`}
                                          title={!artifactSignaturesSupported ? 'Not supported by the active updates backend' : undefined}
                                          onClick={() => handleDownloadVersionArtifacts(v.version)}
                                        >
                                          {versionActionBusy === `artifacts:${v.version}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Artifacts'}
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={!artifactSignaturesSupported || versionActionBusy === `signature:${v.version}`}
                                          title={!artifactSignaturesSupported ? 'Not supported by the active updates backend' : undefined}
                                          onClick={() => handleDownloadSignature(v.version)}
                                        >
                                          {versionActionBusy === `signature:${v.version}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Signature'}
                                        </Button>
                                        {!isNonSwu && !perDevice && (
                                          <Button variant="outline" size="sm" disabled={!downloadable} title={!downloadable ? 'Previous-version download disabled for this pack' : undefined} onClick={() => handleDownloadVersion(v.version)}>
                                            .swu
                                          </Button>
                                        )}
                                      </div>
                                      {perDevice && <p className="mt-1 text-xs text-muted-foreground">Per-device SWU</p>}
                                    </TableCell>
                                  </TableRow>

                                  {isExpanded && (
                                    <TableRow>
                                      <TableCell colSpan={6} className="bg-muted/20">
                                        <div className="space-y-4 py-2">
                                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div>
                                              <p className="text-xs font-medium text-muted-foreground">
                                                {delta ? `Changes from v${prevVersion?.version}` : 'Contents'}
                                              </p>
                                              {delta ? (
                                                changedCount > 0 ? (
                                                  <div className="mt-2 space-y-1.5 text-sm">
                                                    {delta.added.map(a => (
                                                      <p key={`added-${a.name}`}><span className="font-medium">{a.name}</span> v{a.version} added</p>
                                                    ))}
                                                    {delta.changed.map(a => (
                                                      <p key={`changed-${a.name}`}><span className="font-medium">{a.name}</span> v{a.oldVersion} to v{a.newVersion}</p>
                                                    ))}
                                                    {delta.removed.map(a => (
                                                      <p key={`removed-${a.name}`}><span className="font-medium">{a.name}</span> v{a.version} removed</p>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="mt-2 text-sm text-muted-foreground">No artifact changes from the previous version.</p>
                                                )
                                              ) : v.artifacts && v.artifacts.length > 0 ? (
                                                <div className="mt-2 space-y-1.5 text-sm">
                                                  {v.artifacts.map(a => (
                                                    <p key={a.name}><span className="font-medium">{a.name}</span> v{a.version}</p>
                                                  ))}
                                                </div>
                                              ) : (
                                                <p className="mt-2 text-sm text-muted-foreground">No artifacts recorded for this snapshot.</p>
                                              )}
                                            </div>

                                            <div>
                                              <p className="text-xs font-medium text-muted-foreground">Snapshot Metadata</p>
                                              <div className="mt-2 space-y-1.5 text-sm">
                                                <p>Version: v{v.version}</p>
                                                <p>Artifacts: {v.artifacts?.length || 0}</p>
                                                <p>Installed devices: {deviceCount ?? 0}</p>
                                                {v.encryption_mode && <p>Encryption: {v.encryption_mode}</p>}
                                                {v.checksum && <p className="break-all font-mono text-xs text-muted-foreground">SHA-256: {v.checksum}</p>}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Download each software module INSIDE this version — not
                                              only the current one, which is all the Software Modules
                                              tab and the whole-pack .swu download above ever answer
                                              for. Fetched lazily, only while this row is expanded. */}
                                          {compositionSupported && (
                                            <div>
                                              <p className="text-xs font-medium text-muted-foreground">Software Modules</p>
                                              <VersionModulesPanel
                                                groupId={groupId!}
                                                packName={packName!}
                                                version={v.version}
                                                perModuleDeliverables={perModuleDeliverables}
                                              />
                                            </div>
                                          )}

                                          {delta && delta.unchanged.length > 0 && (
                                            <div>
                                              <p className="text-xs font-medium text-muted-foreground">Unchanged Artifacts</p>
                                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                                {delta.unchanged.map(a => <span key={a.name}>{a.name} v{a.version}</span>)}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
          isBuilt={isBuilt}
          builtVersion={updatePack.version}
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
          isBuilt={isBuilt}
          builtVersion={updatePack.version}
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

      <AlertDialog open={isDeleteOpen} onOpenChange={(open) => { if (!open && !isDeleting) setIsDeleteOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Distribution Set</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &quot;{packName}&quot; and its version history, and frees its name for reuse
              within this group. Devices already running it are not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeletePack(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BreadcrumbPage>
  );
}
