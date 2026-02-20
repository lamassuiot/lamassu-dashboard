'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCBOM, deleteCBOM, CBOMItem } from '@/lib/cbom-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2, Download, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { StatGauge } from '@/components/shared/StatGauge';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

interface CBOMAsset {
  ['bom-ref']?: string;
  name?: string;
  type?: string;
  evidence?: {
    occurrences?: Array<{
      location?: string;
      line?: number;
    }>;
  };
  cryptoProperties?: {
    oid?: string;
    assetType?: string;
    algorithmProperties?: {
      primitive?: string;
    };
  };
}

interface CBOMDetailsData {
  projectIdentifier?: string;
  gitUrl?: string;
  branch?: string;
  commit?: string;
  createdAt?: string | number;
  bom?: {
    serialNumber?: string;
    metadata?: {
      properties?: Array<{ name?: string; value?: string }>;
    };
    components?: CBOMAsset[];
    dependencies?: Array<{
      ref?: string;
      dependsOn?: string[];
    }>;
  };
}

type FilterColumn = 'name' | 'type' | 'primitive' | 'location';
type AssetFilters = Record<FilterColumn, string[]>;
type AssetViewMode = 'table' | 'graph';

const extractProperty = (
  properties: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string | undefined => properties?.find((property) => property.name === name)?.value;

const buildDetailsModel = (projectId: string, data: any): CBOMDetailsData => {
  const details = (data || {}) as CBOMDetailsData;
  const properties = details?.bom?.metadata?.properties;

  return {
    ...details,
    projectIdentifier: details.projectIdentifier || details?.bom?.serialNumber || projectId,
    gitUrl: details.gitUrl || extractProperty(properties, 'gitUrl'),
    branch: details.branch || extractProperty(properties, 'revision'),
    commit: details.commit || extractProperty(properties, 'commit'),
    createdAt: details.createdAt,
  };
};

const capitalizeFirstLetter = (value: string): string => {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getAssetFilterValue = (asset: CBOMAsset, column: FilterColumn): string => {
  if (column === 'name') {
    return asset.name || '-';
  }

  if (column === 'type') {
    return asset.cryptoProperties?.assetType || asset.type || '-';
  }

  if (column === 'primitive') {
    return asset.cryptoProperties?.algorithmProperties?.primitive || '-';
  }

  const firstOccurrence = asset.evidence?.occurrences?.[0];
  const location = firstOccurrence?.location || '-';
  return location;
};

function CBOMDetailsContent() {
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [cbom, setCbom] = useState<CBOMItem | null>(null);
  const [detailsData, setDetailsData] = useState<CBOMDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<AssetFilters>({
    name: [],
    type: [],
    primitive: [],
    location: [],
  });
  const [assetViewMode, setAssetViewMode] = useState<AssetViewMode>('table');

  const projectId = searchParams.get('projectId');

  useEffect(() => {
    if (!projectId || !user?.access_token) {
      setIsLoading(false);
      return;
    }

    const loadCBOM = async () => {
      setIsLoading(true);
      try {
        const data = await fetchCBOM(projectId, user.access_token);
        const model = buildDetailsModel(projectId, data);
        setDetailsData(model);
        setCbom({
          projectIdentifier: model.projectIdentifier || projectId,
          data: data,
        });
      } catch (error) {
        console.error('Failed to fetch CBOM:', error);
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to load CBOM',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadCBOM();
  }, [projectId, user, toast]);

  const handleDelete = async () => {
    if (!projectId || !user?.access_token) return;

    try {
      await deleteCBOM(projectId, user.access_token);
      toast({
        title: 'Success',
        description: 'CBOM deleted successfully',
      });
      router.push('/cbom');
    } catch (error) {
      console.error('Failed to delete CBOM:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete CBOM',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const handleDownload = () => {
    if (!cbom) return;

    const dataStr = JSON.stringify(cbom.data || cbom, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cbom-${cbom.projectIdentifier}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const assets = (detailsData?.bom?.components || []).filter(
    (component) => component.type === 'cryptographic-asset',
  );

  const totalAssets = assets.length;
  const uniqueAssetTypesCount = new Set(assets.map((asset) => (asset.name || '').trim()).filter(Boolean)).size;
  const assetsWithOid = assets.filter((asset) => Boolean(asset.cryptoProperties?.oid)).length;
  const oidCoverage = totalAssets > 0 ? (assetsWithOid / totalAssets) * 100 : 0;

  const filterOptionsByColumn: Record<FilterColumn, string[]> = {
    name: Array.from(new Set(assets.map((asset) => getAssetFilterValue(asset, 'name')))).sort((left, right) =>
      left.localeCompare(right),
    ),
    type: Array.from(new Set(assets.map((asset) => getAssetFilterValue(asset, 'type')))).sort((left, right) =>
      left.localeCompare(right),
    ),
    primitive: Array.from(new Set(assets.map((asset) => getAssetFilterValue(asset, 'primitive')))).sort(
      (left, right) => left.localeCompare(right),
    ),
    location: Array.from(new Set(assets.map((asset) => getAssetFilterValue(asset, 'location')))).sort(
      (left, right) => left.localeCompare(right),
    ),
  };

  const filteredAssets = assets.filter((asset) =>
    (Object.keys(selectedFilters) as FilterColumn[]).every((column) => {
      const selectedValues = selectedFilters[column];
      if (selectedValues.length === 0) {
        return true;
      }

      return selectedValues.includes(getAssetFilterValue(asset, column));
    }),
  );

  const filterSelectors: Array<{ key: FilterColumn; label: string; placeholder: string }> = [
    { key: 'name', label: 'Filter by Asset', placeholder: 'Filter by asset...' },
    { key: 'type', label: 'Filter by Type', placeholder: 'Filter by type...' },
    { key: 'primitive', label: 'Filter by Primitive', placeholder: 'Filter by primitive...' },
    { key: 'location', label: 'Filter by Location', placeholder: 'Filter by location...' },
  ];

  const dependencyGraph = React.useMemo(() => {
    const allComponents = detailsData?.bom?.components || [];
    const dependencies = detailsData?.bom?.dependencies || [];

    const graphNodes = new Map<string, Node>();
    const graphEdges = new Map<string, Edge>();

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', ranksep: 140, nodesep: 50 });

    const ensureNode = (refId: string, fallbackLabel?: string) => {
      if (graphNodes.has(refId)) {
        return;
      }

      const component = allComponents.find((item) => item['bom-ref'] === refId);
      const primitive = component?.cryptoProperties?.algorithmProperties?.primitive;
      const label = component?.name || fallbackLabel || refId;

      const node: Node = {
        id: refId,
        data: {
          label: primitive ? `${label} (${primitive})` : label,
        },
        position: { x: 0, y: 0 },
        style: {
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
          padding: 8,
          background: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          fontSize: 12,
          width: 220,
        },
      };

      graphNodes.set(refId, node);
      dagreGraph.setNode(refId, { width: 220, height: 54 });
    };

    allComponents
      .filter((item) => item.type === 'cryptographic-asset')
      .forEach((component, index) => {
        const refId = component['bom-ref'] || `${component.name || 'asset'}-${index}`;
        ensureNode(refId, component.name || `Asset ${index + 1}`);
      });

    dependencies.forEach((dependency) => {
      const sourceRef = dependency.ref;
      if (!sourceRef) {
        return;
      }

      ensureNode(sourceRef, sourceRef);
      (dependency.dependsOn || []).forEach((targetRef) => {
        ensureNode(targetRef, targetRef);

        const edgeId = `${sourceRef}->${targetRef}`;
        if (!graphEdges.has(edgeId)) {
          graphEdges.set(edgeId, {
            id: edgeId,
            source: sourceRef,
            target: targetRef,
            animated: false,
          });
          dagreGraph.setEdge(sourceRef, targetRef);
        }
      });
    });

    dagre.layout(dagreGraph);

    const laidOutNodes = Array.from(graphNodes.values()).map((node) => {
      const position = dagreGraph.node(node.id);
      if (!position) {
        return node;
      }

      return {
        ...node,
        position: {
          x: position.x - 110,
          y: position.y - 27,
        },
      };
    });

    return {
      nodes: laidOutNodes,
      edges: Array.from(graphEdges.values()),
    };
  }, [detailsData]);

  if (!isAuthenticated()) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to view CBOM details.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
            <CardDescription>No project identifier provided.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/cbom">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to CBOM List
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!cbom) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>CBOM Not Found</CardTitle>
            <CardDescription>
              The requested CBOM could not be found.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/cbom">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to CBOM List
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/cbom">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{detailsData?.projectIdentifier || cbom.projectIdentifier}</h1>
            <p className="text-sm text-muted-foreground">{totalAssets} cryptographic assets found.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <Card className="bg-muted/20">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {detailsData?.gitUrl && <Badge variant="secondary">gitUrl: {detailsData.gitUrl}</Badge>}
            {detailsData?.branch && <Badge variant="secondary">revision: {detailsData.branch}</Badge>}
            {detailsData?.commit && <Badge variant="secondary">commit: {detailsData.commit}</Badge>}
            {detailsData?.createdAt && (
              <Badge variant="outline">
                scanned: <DateDisplay date={detailsData.createdAt} formatString="dd/MM/yyyy HH:mm" showRelative={false} className="ml-1" />
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <div className="flex items-center justify-center">
            <StatGauge
              percentage={oidCoverage}
              label="OID Coverage"
              color="hsl(var(--chart-5))"
              valueText={`${Math.round(oidCoverage)}%`}
              secondaryText={`${assetsWithOid}/${totalAssets || 0}`}
              className="flex flex-col items-center gap-1 text-center"
            />
          </div>
          <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Total crypto assets</p>
              <p className="text-3xl font-semibold">{totalAssets}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Types of crypto assets</p>
              <p className="text-3xl font-semibold">{uniqueAssetTypesCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Package</p>
              <p className="text-sm font-medium break-all">{detailsData?.projectIdentifier || cbom.projectIdentifier}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CBOM format</p>
              <p className="text-sm font-medium">CycloneDX</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>List of all assets</CardTitle>
              <CardDescription>Cryptographic assets found in this scan</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={assetViewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAssetViewMode('table')}
              >
                Table
              </Button>
              <Button
                variant={assetViewMode === 'graph' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAssetViewMode('graph')}
              >
                Dependency Graph
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cryptographic assets found in this CBOM.</p>
          ) : assetViewMode === 'graph' ? (
            dependencyGraph.nodes.length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                No dependency relations were found for this CBOM.
              </div>
            ) : (
              <div className="h-[640px] w-full rounded-md border bg-background">
                <ReactFlow
                  nodes={dependencyGraph.nodes}
                  edges={dependencyGraph.edges}
                  fitView
                  proOptions={{ hideAttribution: true }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={true}
                >
                  <Background />
                  <MiniMap pannable zoomable />
                  <Controls />
                </ReactFlow>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                {filterSelectors.map((selector) => (
                  <div key={selector.key} className="space-y-1.5">
                    <Label htmlFor={`cbom-${selector.key}-filter`}>{selector.label}</Label>
                    <MultiSelectDropdown
                      id={`cbom-${selector.key}-filter`}
                      options={filterOptionsByColumn[selector.key].map((value) => ({
                        value,
                        label: selector.key === 'type' ? capitalizeFirstLetter(value) : value,
                      }))}
                      allOptionValues={filterOptionsByColumn[selector.key]}
                      selectedValues={selectedFilters[selector.key]}
                      onChange={(selected) =>
                        setSelectedFilters((previous) => ({
                          ...previous,
                          [selector.key]: selected,
                        }))
                      }
                      buttonText={selector.placeholder}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelectedFilters({
                      name: [],
                      type: [],
                      primitive: [],
                      location: [],
                    })
                  }
                >
                  Clear all filters
                </Button>
              </div>

              {filteredAssets.length === 0 && (
                <div className="p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                  No assets match the selected filters.
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cryptographic asset</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Primitive</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset, index) => {
                    const firstOccurrence = asset.evidence?.occurrences?.[0];
                    const location = firstOccurrence?.location || '-';
                    const line = firstOccurrence?.line;
                    const typeLabel = capitalizeFirstLetter(asset.cryptoProperties?.assetType || asset.type || '-');

                    return (
                      <TableRow key={`${asset.name || 'asset'}-${asset.type || 'type'}-${index}`}>
                        <TableCell className="font-medium">{asset.name || '-'}</TableCell>
                        <TableCell>{typeLabel}</TableCell>
                        <TableCell>{asset.cryptoProperties?.algorithmProperties?.primitive || '-'}</TableCell>
                        <TableCell>
                          {location !== '-' ? (
                            <span className="inline-flex items-center gap-1 text-primary">
                              {line ? `${location}:${line}` : location}
                              <ExternalLink className="h-3 w-3" />
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the CBOM for project &quot;{cbom.projectIdentifier}&quot;. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CBOMDetailsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    }>
      <CBOMDetailsContent />
    </Suspense>
  );
}
