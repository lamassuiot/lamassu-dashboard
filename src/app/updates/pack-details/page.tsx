"use client";

import React, { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Package, Calendar, FileText, Info, CheckCircle, XCircle, Copy, Shield, PenTool, Lock, Users, Laptop, History, Plus, Trash2, Loader2, UploadCloud } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUpdatePacks, fetchArtifacts, fetchUpdatePackDescriptor, fetchGroupDevices, getPerDeviceSwuDownloadUrl, fetchUpdatePackVersions, downloadSwuVersion, fetchArtifactCatalog, downloadArtifact, fetchVersionSignature, downloadVersionArtifactsArchive } from '@/lib/iot-api';
import { fetchKmsKey, type ApiKmsKey } from '@/lib/kms-data';
import { GenerateSwuDialog } from '@/components/iot/generate-swu-dialog';
import { GeneratePackageDialog } from '@/components/iot/generate-package-dialog';
import { cn, formatBytes, isValidSemver } from '@/lib/utils';
import type { DeviceListApiResponse, UpdatePackVersion, Artifact } from '@/types/iot';
import type { UpdatePacksResponse } from '@/lib/iot-api';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export default function UpdatePackDetailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  const groupId = searchParams.get('groupId');
  const packName = searchParams.get('packName');

  // Fetch all update packs for this DMS
  const { data: updatePacksResponse, isLoading } = useQuery<UpdatePacksResponse, Error>({
    queryKey: ['updatePacks', groupId],
    queryFn: () => fetchUpdatePacks({ groupId: groupId!, accessToken: user!.access_token! }, { pageSize: 50 }),
    enabled: !!groupId && !!user?.access_token,
  });

  const updatePacks = updatePacksResponse?.list || [];

  // Fetch artifacts for the specific pack
  const { data: artifacts = [], isLoading: artifactsLoading } = useQuery<string[], Error>({
    queryKey: ['updatePackArtifacts', groupId, packName],
    queryFn: () => fetchArtifacts({ groupId: groupId!, packName: packName!, accessToken: user!.access_token! }),
    enabled: !!groupId && !!packName && !!user?.access_token,
    staleTime: 0, // Always refetch
    refetchOnMount: true,
  });

  // Fetch descriptor for the specific pack
  const { data: descriptorContent, isLoading: descriptorLoading } = useQuery<string, Error>({
    queryKey: ['updatePackDescriptor', groupId, packName],
    queryFn: () => fetchUpdatePackDescriptor({ groupId: groupId!, packName: packName!, accessToken: user!.access_token! }),
    enabled: !!groupId && !!packName && !!user?.access_token,
    staleTime: 0, // Always refetch
    refetchOnMount: true,
  });

  // Find the specific pack
  const updatePack = updatePacks.find(pack => pack.name === packName);

  // Fetch signing key details if available
  const { data: signingKey } = useQuery<ApiKmsKey, Error>({
    queryKey: ['kmsKey', updatePack?.signature_key_id],
    queryFn: () => fetchKmsKey(updatePack!.signature_key_id!, user!.access_token!),
    enabled: !!updatePack?.signature_key_id && !!user?.access_token,
  });

  // Fetch devices for per-device download (only when encryption_mode is 'per-device')
  const isPerDevice = updatePack?.encryption_mode === 'per-device';
  const { data: dmsDevicesResponse, isLoading: devicesLoading } = useQuery<DeviceListApiResponse, Error>({
    queryKey: ['dmsDevices', groupId],
    queryFn: () => fetchGroupDevices({ groupId: groupId!, accessToken: user!.access_token! }),
    enabled: !!groupId && !!user?.access_token && isPerDevice,
  });
  const dmsDevices = dmsDevicesResponse?.list || [];

  // Fetch recorded version snapshots for this pack
  const { data: versionsResponse } = useQuery<{ list: UpdatePackVersion[]; next: string | null }, Error>({
    queryKey: ['updatePackVersions', groupId, packName],
    queryFn: () => fetchUpdatePackVersions({ groupId: groupId!, packName: packName!, accessToken: user!.access_token! }),
    enabled: !!groupId && !!packName && !!user?.access_token,
  });
  const packVersions: UpdatePackVersion[] = versionsResponse?.list || [];

  const queryClient = useQueryClient();

  // Artifact catalog
  const { data: catalogArtifacts = [], isLoading: catalogLoading, refetch: refetchCatalog } = useQuery<Artifact[], Error>({
    queryKey: ['artifactCatalog', groupId, packName],
    queryFn: () => fetchArtifactCatalog({ groupId: groupId!, packName: packName!, accessToken: user!.access_token! }),
    enabled: !!groupId && !!packName && !!user?.access_token,
  });

  // Non-SWU packs deliver raw artifacts and never build an SWU.
  const isNonSwu = updatePack?.packaging === 'non-swu';

  // Generate-SWU dialog state
  const [isGenerateSwuOpen, setIsGenerateSwuOpen] = useState(false);
  // Non-SWU "Generate Package" dialog state
  const [isGeneratePackageOpen, setIsGeneratePackageOpen] = useState(false);
  // Per-version download progress (artifacts archive / signature)
  const [versionActionBusy, setVersionActionBusy] = useState<string | null>(null);

  // Upload artifact state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadArtifactName, setUploadArtifactName] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingArtifactId, setDownloadingArtifactId] = useState<string | null>(null);
  const [isDownloadingCurrent, setIsDownloadingCurrent] = useState(false);
  // Drag & drop for the artifact binary (selects the file; name defaults from it, version optional).
  const onArtifactDrop = useCallback((accepted: File[]) => {
    const f = accepted[0] ?? null;
    if (!f) return;
    setUploadFile(f);
    setUploadArtifactName((prev) => prev || f.name.replace(/\.[^/.]+$/, ''));
  }, []);
  const { getRootProps: getArtifactRootProps, getInputProps: getArtifactInputProps, isDragActive: isArtifactDragActive } = useDropzone({ onDrop: onArtifactDrop, multiple: false });

  const handleArtifactUpload = async () => {
    if (!uploadFile || !groupId || !packName || !user?.access_token) return;
    // Artifact version is optional; only validate the format when one is provided.
    if (uploadVersion.trim() && !isValidSemver(uploadVersion.trim())) {
      toast({ title: 'Invalid version', description: 'Version is optional, but if set it must be X.Y.Z (e.g. 1.2.3).', variant: 'destructive' });
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
        method: 'POST',
        headers: { Authorization: `Bearer ${user.access_token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.err || `Upload failed: ${res.status}`);
      }
      toast({ title: 'Artifact uploaded', description: `${name} ${uploadVersion ? `v${uploadVersion}` : ''} registered in the catalog.` });
      setUploadFile(null);
      setUploadArtifactName('');
      setUploadVersion('');
      setIsUploadOpen(false);
      refetchCatalog();
      queryClient.invalidateQueries({ queryKey: ['updatePackArtifacts', groupId, packName] });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadVersion = async (version: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    try {
      const blob = await downloadSwuVersion({ groupId, packName, version, accessToken: user.access_token });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${packName}_v${version}.swu`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message || 'Could not download this version.', variant: 'destructive' });
    }
  };

  const handleDownloadCatalogArtifact = async (a: Artifact) => {
    if (!user?.access_token) return;
    if (!a.filename) {
      toast({ title: 'No binary', description: 'This artifact has no uploaded binary on record.', variant: 'destructive' });
      return;
    }
    setDownloadingArtifactId(a.id);
    try {
      const blob = await downloadArtifact({ id: a.id, accessToken: user.access_token });
      const url = window.URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url;
      el.download = a.filename;
      document.body.appendChild(el);
      el.click();
      el.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message || 'Could not download this artifact.', variant: 'destructive' });
    } finally {
      setDownloadingArtifactId(null);
    }
  };

  const handlePerDeviceDownload = async (deviceId: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    try {
      const url = getPerDeviceSwuDownloadUrl(groupId, packName, deviceId);
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${user.access_token}` },
      });
      if (!response.ok) {
        throw new Error(`Failed to download SWU for device ${deviceId}. Status: ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${packName}-${deviceId}.swu`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast({ title: "Download Started", description: `Downloading SWU for device ${deviceId}` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Download Failed", description: error.message || `Failed to download SWU for device ${deviceId}` });
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadVersionArtifacts = async (version: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    setVersionActionBusy(`artifacts:${version}`);
    try {
      const blob = await downloadVersionArtifactsArchive({ groupId, packName, version, accessToken: user.access_token });
      triggerBlobDownload(blob, `${packName}_v${version}_artifacts.tar.gz`);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message || 'Could not download the artifacts archive.', variant: 'destructive' });
    } finally {
      setVersionActionBusy(null);
    }
  };

  const handleDownloadSignature = async (version: string) => {
    if (!groupId || !packName || !user?.access_token) return;
    setVersionActionBusy(`signature:${version}`);
    try {
      const sig = await fetchVersionSignature({ groupId, packName, version, accessToken: user.access_token });
      // Bundle the signed manifest, the PKCS7/CMS signature and the signing certificate so the file is
      // self-contained for offline verification.
      const bundle = JSON.stringify(sig, null, 2);
      triggerBlobDownload(new Blob([bundle], { type: 'application/json' }), `${packName}_v${version}_signature.json`);
    } catch (err: any) {
      toast({ title: 'No signature', description: err.message || 'This version has no recorded signature.', variant: 'destructive' });
    } finally {
      setVersionActionBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!updatePack?.uri) {
      toast({ variant: "destructive", title: "Download Failed", description: "Update pack URI is not available." });
      return;
    }
    setIsDownloadingCurrent(true);
    try {
      const response = await fetch(updatePack.uri, {
        headers: { 'Authorization': `Bearer ${user!.access_token!}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = updatePack.packaging === 'non-swu' ? 'tar.gz' : 'swu';
      const filename = updatePack.binaryFileName || `${updatePack.name}-v${updatePack.version}.${ext}`;
      triggerBlobDownload(blob, filename);
      toast({ title: "Download Started", description: `Downloading ${updatePack.name} v${updatePack.version}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download Failed", description: err.message || "Could not download the file." });
    } finally {
      setIsDownloadingCurrent(false);
    }
  };

  const handleDownloadArtifact = async (fileName: string) => {
    try {
      const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/groups/${groupId}/updatepacks/${packName}/artifacts/${fileName}`, {
        headers: { 'Authorization': `Bearer ${user!.access_token!}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to download ${fileName}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: `Downloading ${fileName}`
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: `Failed to download ${fileName}`
      });
    }
  };

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
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="pt-6">
          <p className="text-center text-muted-foreground">
            Update pack not found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="hover:bg-accent"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold tracking-tight">
                  {updatePack.name}
                </h1>
                <Badge variant="secondary" className="text-base px-3 py-1">
                  v{updatePack.version}
                </Badge>
                <Badge variant="outline" className="text-sm">
                  {updatePack.type === 'rawfile' ? 'Raw File' : 
                   updatePack.type === 'firmware' ? 'Firmware' : 
                   updatePack.type}
                </Badge>
                {/* Encryption Mode Badge */}
                {updatePack.encryption_mode && (
                  <Badge 
                    variant="outline" 
                    className={`text-sm ${
                      updatePack.encryption_mode === 'per-device' 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700' 
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700'
                    }`}
                  >
                    {updatePack.encryption_mode === 'per-device' ? (
                      <><Users className="mr-1 h-3 w-3" />Per-Device Encryption</>
                    ) : (
                      <><Lock className="mr-1 h-3 w-3" />Shared Encryption</>
                    )}
                  </Badge>
                )}
              </div>
              {updatePack.createdAt && (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Created {format(new Date(updatePack.createdAt), "PPp")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Generate SWU: only for SWU packs (non-SWU packs deliver raw artifacts) */}
            {!isNonSwu && (
              <Button
                onClick={() => setIsGenerateSwuOpen(true)}
                size="lg"
                variant={updatePack.uri ? 'outline' : 'default'}
                className={updatePack.uri ? '' : 'bg-primary hover:bg-primary/90'}
              >
                <PenTool className="mr-2 h-5 w-5" />
                {updatePack.uri ? 'Regenerate SWU' : 'Generate SWU'}
              </Button>
            )}
            {/* Download button: only show for SWU packs in non-per-device modes */}
            {!isPerDevice && !isNonSwu && (
              <Button
                onClick={handleDownload}
                disabled={!updatePack.uri || isDownloadingCurrent}
                size="lg"
                className="bg-primary hover:bg-primary/90"
              >
                {isDownloadingCurrent ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
                Download SWU
              </Button>
            )}
            {/* Non-SWU packs: build + download a .tar.gz package instead of an SWU */}
            {isNonSwu && (
              <Button
                onClick={() => setIsGeneratePackageOpen(true)}
                size="lg"
                variant={updatePack.uri ? 'outline' : 'default'}
                className={updatePack.uri ? '' : 'bg-primary hover:bg-primary/90'}
              >
                <Package className="mr-2 h-5 w-5" />
                {updatePack.uri ? 'Regenerate Package' : 'Generate Package'}
              </Button>
            )}
            {isNonSwu && (
              <Button onClick={handleDownload} disabled={!updatePack.uri || isDownloadingCurrent} size="lg" className="bg-primary hover:bg-primary/90">
                {isDownloadingCurrent ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
                Download Package
              </Button>
            )}
          </div>
        </div>
        
        {/* Status Banner */}
        {isNonSwu ? (
          <div className={`rounded-lg border p-4 ${updatePack.uri ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900' : 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900'}`}>
            <div className="flex items-center gap-3">
              {updatePack.uri ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" /> : <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
              <div>
                <p className={`font-semibold ${updatePack.uri ? 'text-green-900 dark:text-green-100' : 'text-purple-900 dark:text-purple-100'}`}>
                  {updatePack.uri ? `Package built (v${updatePack.version})` : 'Non-SWU pack — package not built yet'}
                </p>
                <p className={`text-sm mt-1 ${updatePack.uri ? 'text-green-700 dark:text-green-300' : 'text-purple-700 dark:text-purple-300'}`}>
                  {updatePack.uri
                    ? 'Devices download this pack as a .tar.gz (download-and-install). Regenerate after changing artifacts.'
                    : 'Upload artifacts, then "Generate Package" to build the .tar.gz devices will download.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          updatePack.uri ? (
            <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-semibold text-green-900 dark:text-green-100">SWU built (v{updatePack.version})</p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    This update pack is ready for deployment. Regenerate after changing its artifacts.
                  </p>
                </div>
              </div>
            </div>
          ) : updatePack.generationError ? (
            <div className="rounded-lg border p-4 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-100">SWU generation failed</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{updatePack.generationError}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="font-semibold text-blue-900 dark:text-blue-100">No SWU generated yet (v{updatePack.version})</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Upload artifacts, then “Generate SWU” to build the package devices will download.
                  </p>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Per-Device Download Section */}
      {isPerDevice && updatePack.uri && (
        <div className="rounded-lg border bg-card p-6 shadow-md">
          <h3 className="flex items-center gap-2 mb-2 text-lg font-semibold">
            <Laptop className="h-5 w-5 text-primary" />
            Per-Device SWU Downloads
          </h3>
          <p className="text-muted-foreground mb-4">
            This pack uses per-device encryption. Each device has its own SWU file encrypted with its unique key.
          </p>
          {devicesLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground italic border border-border rounded-md">
              Loading devices...
            </div>
          ) : dmsDevices.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground italic border border-border rounded-md">
              No devices found for this DMS.
            </div>
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
                {dmsDevices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-mono text-sm">{device.id}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePerDeviceDownload(device.id)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download SWU
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Artifacts Catalog */}
      <div className="rounded-lg border bg-card p-6 shadow-md">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5 text-primary" />
            Artifacts
          </h3>
          {updatePack.uri ? (
            // Built versions are immutable: changing artifacts requires a new pack version.
            <Button size="sm" variant="outline" onClick={() => router.push(`/updates/create-version?basePackId=${encodeURIComponent(updatePack.id)}&groupId=${encodeURIComponent(groupId || '')}`)}>
              <Plus className="mr-2 h-4 w-4" />
              New Version to Edit
            </Button>
          ) : (
            <Button size="sm" onClick={() => setIsUploadOpen(v => !v)}>
              <Plus className="mr-2 h-4 w-4" />
              Upload Artifact
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {updatePack.uri
            ? `Version ${updatePack.version} is built and immutable. Create a new version (you set the semver, greater than ${updatePack.version}) to add or upgrade artifacts — the current artifacts carry forward.`
            : 'Binary files for this pack version. Uploading a new version of an existing artifact replaces it; these are the components built into the SWU/package.'}
        </p>

        {/* Upload form (inline toggle) — only while the version is unbuilt */}
        {isUploadOpen && !updatePack.uri && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4 space-y-3">
            <h4 className="text-sm font-semibold">Upload new artifact</h4>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Binary file</Label>
              <div
                {...getArtifactRootProps()}
                className={cn(
                  'p-5 border-2 border-dashed rounded-md cursor-pointer transition-colors text-center',
                  isArtifactDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50',
                  uploadFile && 'border-green-500/60 bg-green-500/5'
                )}
              >
                <input {...getArtifactInputProps()} />
                <UploadCloud className={cn('w-8 h-8 mx-auto mb-1', isArtifactDragActive ? 'text-primary' : 'text-muted-foreground')} />
                {uploadFile
                  ? <p className="text-sm text-foreground">{uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                  : <p className="text-sm text-muted-foreground">{isArtifactDragActive ? 'Drop the file here…' : 'Drag & drop the binary here, or click to select'}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Software name</Label>
                <Input
                  placeholder="e.g. firmware, os, config"
                  value={uploadArtifactName}
                  onChange={e => setUploadArtifactName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Version</Label>
                <Input
                  placeholder="e.g. 2.1.0"
                  value={uploadVersion}
                  onChange={e => setUploadVersion(e.target.value)}
                  className={cn('h-8 text-sm', uploadVersion && !isValidSemver(uploadVersion) && 'border-destructive focus-visible:ring-destructive')}
                  aria-invalid={!!uploadVersion && !isValidSemver(uploadVersion)}
                />
                {uploadVersion && !isValidSemver(uploadVersion)
                  ? <p className="text-xs text-destructive">Version must be X.Y.Z (e.g. 1.2.3).</p>
                  : <p className="text-xs text-muted-foreground">Optional. If set: X.Y.Z, greater than the artifact's current latest.</p>}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setIsUploadOpen(false); setUploadFile(null); setUploadArtifactName(''); setUploadVersion(''); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleArtifactUpload} disabled={!uploadFile || isUploading || (!!uploadVersion && !isValidSemver(uploadVersion))}>
                {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload & Register'}
              </Button>
            </div>
          </div>
        )}

        {catalogLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading artifacts…</div>
        ) : catalogArtifacts.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-border p-8 text-center bg-muted/10">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No artifacts uploaded yet</p>
            <p className="text-xs text-muted-foreground mt-1">Upload binary files and give them a name and version. They'll be selectable when building the SWU.</p>
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

      {/* Version History */}
      <div className="rounded-lg border bg-card p-6 shadow-md">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-5 w-5 text-primary" />
            Version History
          </h3>
          <Badge variant={updatePack.allow_previous_version_download ? 'default' : 'secondary'} className="text-xs">
            {updatePack.allow_previous_version_download ? 'Previous-version download enabled' : 'Previous-version download disabled'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Each built version is recorded as a snapshot.{' '}
          {updatePack.allow_previous_version_download
            ? 'Previous versions can be downloaded.'
            : 'Only the current version can be downloaded for this pack.'}
        </p>
        {packVersions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No version snapshots recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Encryption</TableHead>
                <TableHead>Checksum</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packVersions.map((v) => {
                const isCurrent = v.version === updatePack.version;
                const downloadable = isCurrent || !!updatePack.allow_previous_version_download;
                const perDevice = (v.encryption_mode || updatePack.encryption_mode) === 'per-device';
                return (
                  <TableRow key={v.id} className={isCurrent ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-mono">
                      <div className="flex items-center gap-2">
                        v{v.version}
                        {isCurrent && <Badge variant="outline" className="text-xs">current</Badge>}
                      </div>
                      {v.artifacts && v.artifacts.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.artifacts.map((a) => (
                            <Badge key={a.name} variant="secondary" className="text-[10px] font-normal">
                              {a.name}@{a.version || '—'}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.created_at ? format(new Date(v.created_at), 'PP p') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{v.encryption_mode || 'none'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate" title={v.checksum}>
                      {v.checksum || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Raw component archive — uniform for SWU and non-SWU */}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={versionActionBusy === `artifacts:${v.version}`}
                          onClick={() => handleDownloadVersionArtifacts(v.version)}
                          title="Download this version's artifacts (.tar.gz)"
                        >
                          {versionActionBusy === `artifacts:${v.version}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Package className="mr-1 h-3 w-3" /> artifacts</>}
                        </Button>
                        {/* Signed manifest + PKCS7/CMS signature (certificate embedded) */}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={versionActionBusy === `signature:${v.version}`}
                          onClick={() => handleDownloadSignature(v.version)}
                          title="Download the signed manifest + signature (certificate)"
                        >
                          {versionActionBusy === `signature:${v.version}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Shield className="mr-1 h-3 w-3" /> signature</>}
                        </Button>
                        {/* SWU deliverable (SWU packs only) */}
                        {!isNonSwu && (perDevice ? (
                          <span className="text-xs text-muted-foreground italic">per-device</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!downloadable}
                            onClick={() => handleDownloadVersion(v.version)}
                            title={downloadable ? `Download v${v.version}` : 'Previous-version download is disabled for this pack'}
                          >
                            <Download className="mr-1 h-3 w-3" /> .swu
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Package Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Binary File Card */}
        {updatePack.binaryFileName && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Binary File
            </h3>
            <p className="font-mono text-sm">{updatePack.binaryFileName}</p>
          </div>
        )}

        {/* Descriptor File Card */}
        {updatePack.descriptorFileName && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Descriptor File
            </h3>
            <p className="font-mono text-sm">{updatePack.descriptorFileName}</p>
          </div>
        )}
      </div>

      {/* Security & Download URI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Security Configuration */}
        <div className="rounded-lg border bg-card p-6 shadow-md border-primary/20">
          <h3 className="flex items-center gap-2 mb-2 text-lg font-semibold">
            <Shield className="h-5 w-5 text-primary" />
            Security Configuration
          </h3>
          <p className="text-muted-foreground mb-4">
            Signature and encryption settings for this update
          </p>
          <div className="space-y-4">
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${updatePack?.signature_alg_name || updatePack?.alg_sign ? 'bg-accent/50 border-border' : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800'}`}>
              <PenTool className={`h-5 w-5 ${updatePack?.signature_alg_name || updatePack?.alg_sign ? 'text-primary' : 'text-red-600 dark:text-red-400'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium">Digital Signature</p>
                <div className={`text-xs mt-1 ${updatePack?.signature_alg_name || updatePack?.alg_sign ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400'}`}>
                  {updatePack?.signature_alg_name ? (
                     <>
                      {updatePack.signature_alg_name}
                      {signingKey && (
                        <span className="block mt-0.5 opacity-80">
                           {signingKey.algorithm} Key: {signingKey.size} bits
                        </span>
                      )}
                      {updatePack.signature_key_id && (
                        <span className="block mt-1">
                          Key ID:{' '}
                          <Link 
                            href={`/kms/keys/details?keyId=${encodeURIComponent(updatePack.signature_key_id)}`}
                            className="text-primary hover:underline font-mono"
                          >
                            {updatePack.signature_key_id.substring(0, 16)}...
                          </Link>
                        </span>
                      )}
                     </>
                  ) : updatePack?.alg_sign ? (
                    `${updatePack.alg_sign} Algorithm`
                  ) : (
                    'Not specified'
                  )}
                </div>
              </div>
              <Badge variant="secondary" className={updatePack?.signature_alg_name || updatePack?.alg_sign ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100" : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100"}>
                {updatePack?.signature_alg_name || updatePack?.alg_sign ? 'Signed' : 'Unsigned'}
              </Badge>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 border border-border">
              <Lock className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Encryption</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {updatePack?.encryption_alg_name ? (
                    <>
                      {updatePack.encryption_alg_name}
                      {updatePack.encryption_mode === 'per-device' ? (
                        <span className="ml-1">(per-device keys from inventory)</span>
                      ) : updatePack.encryption_key_name ? (
                        <>
                          {' ('}
                          <Link 
                            href={`/kms/keys/sym-keys/details?keyId=${encodeURIComponent(updatePack.encryption_key_name)}`}
                            className="text-primary hover:underline"
                          >
                            {updatePack.encryption_key_name}
                          </Link>
                          {')'}
                        </>
                      ) : (
                        <span className="ml-1">(Unknown key)</span>
                      )}
                    </>
                  ) : (
                    'Not encrypted'
                  )}
                </p>
                {/* Show IV only for shared mode */}
                {updatePack?.encryption_iv && updatePack.encryption_mode !== 'per-device' && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    IV: {updatePack.encryption_iv}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className={updatePack?.encryption_alg_name ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100" : "bg-muted text-muted-foreground"}>
                {updatePack?.encryption_mode === 'per-device' ? 'Per-Device' : 
                 updatePack?.encryption_alg_name ? 'Shared' : 'Unencrypted'}
              </Badge>
            </div>

            <Separator />

            {updatePack?.signature_certificate && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Signature Certificate</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(updatePack.signature_certificate!);
                      toast({
                        title: "Copied",
                        description: "Certificate copied to clipboard"
                      });
                    }}
                  >
                    <Copy className="mr-2 h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <div className="relative">
                  <pre className="font-mono text-xs bg-muted p-3 rounded-md border overflow-x-auto max-h-48 overflow-y-auto">
                    {updatePack.signature_certificate}
                  </pre>
                </div>
              </div>
            )}

            {!updatePack?.signature_certificate && (updatePack?.alg_sign || updatePack?.signature_alg_name) && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Certificate</span>
                </div>
                <span className="text-xs text-muted-foreground">Not available in this pack version</span>
              </div>
            )}
          </div>
        </div>

        {/* Package Information */}
        <div className="rounded-lg border bg-card p-6 shadow-md">
          <h3 className="flex items-center gap-2 mb-2 text-lg font-semibold">
            <Info className="h-5 w-5 text-primary" />
            Package Information
          </h3>
          <p className="text-muted-foreground mb-4">
            Package identifiers and access information
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Package ID</p>
              <div className="font-mono text-xs break-all bg-muted p-3 rounded-md border">
                {updatePack.id}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Package URI</p>
              <div className="relative">
                <div className="font-mono text-xs break-all bg-muted p-3 pr-10 rounded-md border">
                  {updatePack.uri || 'Not available'}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(updatePack.uri || 'Not available');
                    toast({
                      title: "Copied",
                      description: "URI copied to clipboard"
                    });
                  }}
                  className="absolute top-2 right-2 h-6 w-6"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Files and Descriptor Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Package Contents
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Artifacts and configuration included in this update package
          </p>
        </div>

        {/* Files and Descriptor */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Files in Update Pack */}
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-5 w-5 text-primary" />
              Artifacts
            </div>
            <div className="overflow-x-auto">
              {(() => {
                // If artifacts API returned data, use it
                let filesToDisplay: string[] = [];
                
                if (!artifactsLoading && artifacts.length > 0) {
                  filesToDisplay = artifacts;
                } else if (!artifactsLoading) {
                  // Try to parse descriptor for files
                  if (descriptorContent || updatePack.descriptorContent) {
                    const desc = descriptorContent || updatePack.descriptorContent || '';
                    try {
                      const softwareMatch = desc.match(/software\s*=\s*\{([\s\S]*?)\}/);
                      if (softwareMatch) {
                        const softwareContent = softwareMatch[1];
                        const ecsMatch = softwareContent.match(/ecs\s*=\s*\{([\s\S]*?)\}/);
                        if (ecsMatch) {
                          const ecsContent = ecsMatch[1];
                          const filesMatch = ecsContent.match(/files:\s*\(([\s\S]*?)\)/);
                          if (filesMatch) {
                            const filesContent = filesMatch[1];
                            const filenameMatches = filesContent.match(/filename\s*=\s*"([^"]+)"/g);
                            if (filenameMatches) {
                              filesToDisplay = filenameMatches.map(match => {
                                const filenameMatch = match.match(/filename\s*=\s*"([^"]+)"/);
                                return filenameMatch ? filenameMatch[1] : match;
                              });
                            }
                          }
                        }
                      }
                    } catch (error) {
                      console.error('Error parsing descriptor:', error);
                    }
                  }
                }

                if (artifactsLoading) {
                  return (
                    <div className="p-6 text-center text-sm text-muted-foreground italic border border-border rounded-md">
                      Loading files...
                    </div>
                  );
                }

                if (filesToDisplay.length === 0) {
                  return (
                    <div className="p-6 text-center text-sm text-muted-foreground italic border border-border rounded-md">
                      No files found in this update pack.
                    </div>
                  );
                }

                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-24 text-right">Size</TableHead>
                        <TableHead className="w-20 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filesToDisplay.map((fileName, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{fileName}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {/* Size information not available from API */}
                            -
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadArtifact(fileName)}
                              className="h-8 w-8"
                              title={`Download ${fileName}`}
                            >
                              <Download className="h-4 w-4" />
                              <span className="sr-only">Download {fileName}</span>
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

          {/* Descriptor Content */}
          <div className="space-y-3 lg:col-span-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-semibold">
                <FileText className="h-5 w-5 text-primary" />
                Descriptor Configuration
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const content = descriptorContent || updatePack.descriptorContent || '';
                  navigator.clipboard.writeText(content);
                  toast({
                    title: "Copied",
                    description: "Descriptor content copied to clipboard"
                  });
                }}
              >
                <Copy className="mr-2 h-3 w-3" />
                Copy
              </Button>
            </div>
            {descriptorLoading ? (
              <div className="bg-muted/50 p-6 rounded-lg border border-border flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                  <p className="text-sm text-muted-foreground">Loading descriptor...</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden shadow-sm">
                <Editor
                  height="400px"
                  defaultLanguage="lua"
                  value={descriptorContent || updatePack.descriptorContent || 'No descriptor available'}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                    padding: { top: 10, bottom: 10 },
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate SWU dialog (SWU packs only) */}
      {!isNonSwu && updatePack && (
        <GenerateSwuDialog
          open={isGenerateSwuOpen}
          onOpenChange={setIsGenerateSwuOpen}
          groupId={groupId!}
          packName={packName!}
          catalogArtifacts={catalogArtifacts}
          onGenerated={() => {
            queryClient.invalidateQueries({ queryKey: ['updatePacks', groupId] });
            queryClient.invalidateQueries({ queryKey: ['updatePackVersions', groupId, packName] });
            queryClient.invalidateQueries({ queryKey: ['updatePackDescriptor', groupId, packName] });
            refetchCatalog();
          }}
        />
      )}

      {/* Generate Package dialog (non-SWU packs: sign + encrypt the .tar.gz) */}
      {isNonSwu && updatePack && (
        <GeneratePackageDialog
          open={isGeneratePackageOpen}
          onOpenChange={setIsGeneratePackageOpen}
          groupId={groupId!}
          packName={packName!}
          catalogArtifacts={catalogArtifacts}
          onGenerated={() => {
            queryClient.invalidateQueries({ queryKey: ['updatePacks', groupId] });
            queryClient.invalidateQueries({ queryKey: ['updatePackVersions', groupId, packName] });
            refetchCatalog();
          }}
        />
      )}
    </div>
  );
}
