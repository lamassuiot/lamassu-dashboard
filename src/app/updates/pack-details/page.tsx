"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Package, Calendar, FileText, Info, CheckCircle, XCircle, Copy, Shield, PenTool, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUpdatePacks, fetchUpdatePackArtifacts, fetchUpdatePackDescriptor } from '@/lib/iot-api';
import { fetchKmsKey, type ApiKmsKey } from '@/lib/kms-data';
import type { UpdatePack } from '@/types/iot';
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
  
  const dmsId = searchParams.get('dmsId');
  const packName = searchParams.get('packName');

  // Fetch all update packs for this DMS
  const { data: updatePacksResponse, isLoading } = useQuery<UpdatePacksResponse, Error>({
    queryKey: ['updatePacks', dmsId],
    queryFn: () => fetchUpdatePacks({ dmsId: dmsId!, accessToken: user!.access_token! }, { pageSize: 50 }),
    enabled: !!dmsId && !!user?.access_token,
  });

  const updatePacks = updatePacksResponse?.list || [];

  // Fetch artifacts for the specific pack
  const { data: artifacts = [], isLoading: artifactsLoading } = useQuery<string[], Error>({
    queryKey: ['updatePackArtifacts', dmsId, packName],
    queryFn: () => fetchUpdatePackArtifacts({ dmsId: dmsId!, packName: packName!, accessToken: user!.access_token! }),
    enabled: !!dmsId && !!packName && !!user?.access_token,
    staleTime: 0, // Always refetch
    refetchOnMount: true,
  });

  // Fetch descriptor for the specific pack
  const { data: descriptorContent, isLoading: descriptorLoading } = useQuery<string, Error>({
    queryKey: ['updatePackDescriptor', dmsId, packName],
    queryFn: () => fetchUpdatePackDescriptor({ dmsId: dmsId!, packName: packName!, accessToken: user!.access_token! }),
    enabled: !!dmsId && !!packName && !!user?.access_token,
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

  const handleDownload = () => {
    if (!updatePack?.uri) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Update pack URI is not available."
      });
      return;
    }

    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = updatePack.uri;
    link.download = updatePack.binaryFileName || `${updatePack.name}-v${updatePack.version}.swu`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Download Started",
      description: `Downloading ${updatePack.name} v${updatePack.version}`
    });
  };

  const handleDownloadArtifact = async (fileName: string) => {
    try {
      const response = await fetch(`${get_CLIENT_UPDATES_API_BASE_URL()}/dms/${dmsId}/updatepacks/${packName}/artifacts/${fileName}`, {
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
    } catch (error) {
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
              </div>
              {updatePack.createdAt && (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Created {format(new Date(updatePack.createdAt), "PPp")}
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={handleDownload}
            disabled={!updatePack.uri}
            size="lg"
            className="bg-primary hover:bg-primary/90"
          >
            <Download className="mr-2 h-5 w-5" />
            Download SWU
          </Button>
        </div>
        
        {/* Status Banner */}
        <div className={`rounded-lg border p-4 ${updatePack.uri ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'}`}>
          <div className="flex items-center gap-3">
            {updatePack.uri ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-semibold text-green-900 dark:text-green-100">SWU File Generated Successfully</p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    This update package is ready for deployment
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-100">
                    {updatePack.generationError || `SWU not generated for Version ${updatePack.version}`}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    There was a problem creating the update package
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
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
                      {updatePack.encryption_alg_name} (
                      {updatePack.encryption_key_name ? (
                        <Link 
                          href={`/kms/keys/sym-keys/details?keyId=${encodeURIComponent(updatePack.encryption_key_name)}`}
                          className="text-primary hover:underline"
                        >
                          {updatePack.encryption_key_name}
                        </Link>
                      ) : (
                        'Unknown key'
                      )}
                      )
                    </>
                  ) : (
                    'Not encrypted'
                  )}
                </p>
              </div>
              <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100">
                {updatePack?.sw_desc_encrypted ? 'Encrypted' : 'Unencrypted'}
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
                    const desc = descriptorContent || updatePack.descriptorContent;
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
    </div>
  );
}
