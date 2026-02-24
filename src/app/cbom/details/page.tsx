'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCBOM, deleteCBOM, CBOMItem, runComplianceCheck, type QuantumSafeComplianceResult } from '@/lib/cbom-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Trash2, Download, ExternalLink, Shield, Loader2, AlertTriangle, ChevronDown, ChevronRight, Folder, FolderOpen, FileCode } from 'lucide-react';
import {
  GraphCanvas,
  Sphere,
  Badge as ReagraphBadge,
  type GraphNode,
  type GraphEdge,
  type NodeRendererProps,
} from 'reagraph';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { CBOMAssetDetailDialog, type CBOMAssetDetail } from '@/components/cbom/CBOMAssetDetailDialog';
import { CBOMBubbleChart } from '@/components/cbom/CBOMBubbleChart';
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

type CBOMAsset = CBOMAssetDetail;

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
type AssetViewMode = 'table' | 'graph' | 'file-tree' | 'network-graph';

interface FileTreeEntry {
  assetName: string;
  assetRef?: string;
  primitive?: string;
  line?: number;
  offset?: number;
  context?: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  entries: FileTreeEntry[];
}

interface FileTreeViewProps {
  root: FileTreeNode;
  complianceFindingsMap: Map<string, number>;
  complianceResult: QuantumSafeComplianceResult | null;
}

function FileTreeView({ root, complianceFindingsMap, complianceResult }: FileTreeViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function renderNode(nodes: Map<string, FileTreeNode>, depth: number): React.ReactNode {
    return Array.from(nodes.entries()).map(([, node]) => {
      const isFile = node.children.size === 0;
      const isCollapsed = collapsed.has(node.path);
      const indent = depth * 14;

      if (isFile) {
        return (
          <div key={node.path}>
            <div
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-muted/40"
              style={{ paddingLeft: `${indent + 8}px` }}
            >
              <FileCode className="h-3.5 w-3.5 shrink-0 text-blue-400" />
              <span className="font-mono text-foreground">{node.name}</span>
              <span className="ml-1 text-muted-foreground">
                · {node.entries.length} usage{node.entries.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ paddingLeft: `${indent + 30}px` }}>
              {node.entries.map((entry, i) => {
                const levelId = entry.assetRef ? complianceFindingsMap.get(entry.assetRef) : undefined;
                const level =
                  levelId !== undefined
                    ? complianceResult?.complianceLevels.find((l) => l.id === levelId)
                    : undefined;
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border/40 py-1 text-xs last:border-0"
                  >
                    <span className="font-medium text-foreground">{entry.assetName}</span>
                    {entry.line != null && (
                      <span className="font-mono text-muted-foreground tabular-nums">
                        line {entry.line}
                        {entry.offset != null ? `:${entry.offset}` : ''}
                      </span>
                    )}
                    {entry.context && (
                      <span className="text-muted-foreground">{entry.context}</span>
                    )}
                    {level && (
                      <span
                        className="inline-flex items-center rounded-full border px-1.5 py-px text-xs font-medium"
                        style={{
                          borderColor: `${level.colorHex}88`,
                          color: level.colorHex,
                          background: `${level.colorHex}18`,
                        }}
                      >
                        {level.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      const countFiles = (n: FileTreeNode): number =>
        n.children.size === 0 ? 1 : Array.from(n.children.values()).reduce((s, c) => s + countFiles(c), 0);
      const fileCount = countFiles(node);

      return (
        <div key={node.path}>
          <button
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-muted/40"
            style={{ paddingLeft: `${indent + 8}px` }}
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              })
            }
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            {isCollapsed ? (
              <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
            )}
            <span className="text-foreground">{node.name}</span>
            <span className="ml-1 text-muted-foreground">
              · {fileCount} file{fileCount !== 1 ? 's' : ''}
            </span>
          </button>
          {!isCollapsed && renderNode(node.children, depth + 1)}
        </div>
      );
    });
  }

  if (root.children.size === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">No file locations found.</p>
    );
  }

  return <div className="py-1">{renderNode(root.children, 0)}</div>;
}

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
  const [selectedNetworkNode, setSelectedNetworkNode] = useState<GraphNode | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<CBOMAsset | null>(null);
  const [assetDetailOpen, setAssetDetailOpen] = useState(false);
  const [complianceResult, setComplianceResult] = useState<QuantumSafeComplianceResult | null>(null);
  const [compliancePolicyId, setCompliancePolicyId] = useState('quantum_safe');
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [groupByRef, setGroupByRef] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

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

  const handleCheckCompliance = async () => {
    if (!detailsData?.bom || !user?.access_token || !compliancePolicyId) return;
    setIsCheckingCompliance(true);
    try {
      const result = await runComplianceCheck(detailsData.bom, compliancePolicyId, user.access_token);
      setComplianceResult(result);
    } catch (error) {
      console.error('Failed to check compliance:', error);
      toast({
        title: 'Compliance Check Failed',
        description: error instanceof Error ? error.message : 'Failed to run compliance check',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingCompliance(false);
    }
  };

  const assets = (detailsData?.bom?.components || []).filter(
    (component) => component.type === 'cryptographic-asset',
  );

  const allComponents = detailsData?.bom?.components || [];
  const totalAssets = allComponents.length;
  const uniqueAssetTypesCount = new Set(assets.map((asset) => (asset.name || '').trim()).filter(Boolean)).size;
  const assetsWithOid = assets.filter((asset) => Boolean(asset.cryptoProperties?.oid)).length;
  const oidCoverage = assets.length > 0 ? (assetsWithOid / assets.length) * 100 : 0;
  const totalFindings = allComponents.reduce(
    (sum, component) => sum + (component.evidence?.occurrences?.length ?? 0),
    0,
  );

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

  const complianceFindingsMap = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!complianceResult) return map;
    for (const finding of complianceResult.findings) {
      if (!map.has(finding.bomRef)) {
        map.set(finding.bomRef, finding.levelId);
      }
    }
    return map;
  }, [complianceResult]);

  // Group filteredAssets by bom-ref, merging ALL occurrences across duplicates
  const groupedAssets = React.useMemo(() => {
    type GroupedAsset = CBOMAsset & { _allOccurrences: NonNullable<CBOMAsset['evidence']>['occurrences'] };
    const map = new Map<string, GroupedAsset>();
    for (const asset of filteredAssets) {
      const key = asset['bom-ref'] || asset.name || '';
      const occurrences = asset.evidence?.occurrences ?? [];
      const existing = map.get(key);
      if (existing) {
        existing._allOccurrences = [...(existing._allOccurrences ?? []), ...occurrences];
      } else {
        map.set(key, { ...asset, _allOccurrences: [...occurrences] });
      }
    }
    return Array.from(map.values());
  }, [filteredAssets]);

  // Build a file-path tree from grouped assets for the File Tree view
  const fileTree = React.useMemo((): FileTreeNode => {
    const root: FileTreeNode = { name: '', path: '', children: new Map(), entries: [] };
    for (const asset of groupedAssets) {
      const allOccurrences = (asset as any)._allOccurrences as
        | NonNullable<CBOMAsset['evidence']>['occurrences']
        | undefined;
      for (const occ of allOccurrences ?? []) {
        if (!occ?.location) continue;
        const parts = occ.location.split('/');
        let node = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const nodePath = parts.slice(0, i + 1).join('/');
          const isLast = i === parts.length - 1;
          if (!node.children.has(part)) {
            node.children.set(part, {
              name: part,
              path: nodePath,
              children: new Map(),
              entries: [],
            });
          }
          node = node.children.get(part)!;
          if (isLast) {
            node.entries.push({
              assetName: asset.name || '-',
              assetRef: asset['bom-ref'],
              primitive: asset.cryptoProperties?.algorithmProperties?.primitive,
              line: occ.line ?? undefined,
              offset: occ.offset ?? undefined,
              context: occ.additionalContext ?? undefined,
            });
          }
        }
      }
    }
    return root;
  }, [groupedAssets]);

  const isRealtimeCBOM = React.useMemo(() => {
    const raw = detailsData as any;
    const toolServices: any[] = raw?.bom?.metadata?.tools?.services ?? [];
    return toolServices.some(
      (svc: any) => svc?.name === 'LiveCapture' && svc?.provider?.name === 'Ikerlan_LKS',
    );
  }, [detailsData]);

  const networkGraphData = React.useMemo((): { nodes: GraphNode[]; edges: GraphEdge[] } => {
    if (!isRealtimeCBOM || !detailsData) return { nodes: [], edges: [] };
    const raw = detailsData as any;
    const bom = raw?.bom;

    const agentRef: string = bom?.metadata?.component?.['bom-ref'] ?? 'agent';
    const agentName: string = bom?.metadata?.component?.name ?? 'live-capture';

    const nodes: GraphNode[] = [
      { id: agentRef, label: agentName, fill: '#7c3aed', size: 4, data: { isAgent: true, tlsVersion: '' } },
    ];
    const edges: GraphEdge[] = [];

    const components: any[] = bom?.components ?? [];
    const protocols = components.filter(
      (c: any) => c.cryptoProperties?.assetType === 'protocol',
    );

    protocols.forEach((proto: any) => {
      const ref: string = proto['bom-ref'];
      const props: Array<{ name: string; value: string }> = proto.properties ?? [];

      const snisRaw = props.find((p: any) => p.name === 'live-cbom:tls.sni')?.value ?? '[]';
      let snis: string[] = [];
      try { snis = JSON.parse(snisRaw); } catch { /* ignore */ }
      const sniLabel = snis[0] ?? ref;

      const version: string = proto.cryptoProperties?.protocolProperties?.version ?? '';
      const negotiated =
        props.find((p: any) => p.name === 'live-cbom:tls.negotiatedCipherSuite')?.value ?? '';

      const supportedVersionsRaw = props.find((p: any) => p.name === 'live-cbom:tls.client.supportedVersions')?.value ?? '[]';
      let supportedVersions: string[] = [];
      try { supportedVersions = JSON.parse(supportedVersionsRaw); } catch { /* ignore */ }

      const serverSelectedVersion = props.find((p: any) => p.name === 'live-cbom:tls.server.selectedVersion')?.value ?? '';

      const keyExchangeGroupsRaw = props.find((p: any) => p.name === 'live-cbom:tls.keyExchangeGroups')?.value ?? '[]';
      let keyExchangeGroups: string[] = [];
      try { keyExchangeGroups = JSON.parse(keyExchangeGroupsRaw); } catch { /* ignore */ }

      const cipherSuites: string[] = (proto.cryptoProperties?.protocolProperties?.cipherSuites ?? []).map(
        (cs: any) => cs.name as string,
      ).filter(Boolean);

      nodes.push({
        id: ref,
        label: sniLabel,
        size: 4,
        data: {
          isAgent: false,
          tlsVersion: version,
          snis,
          negotiatedCipherSuite: negotiated,
          supportedVersions,
          serverSelectedVersion,
          keyExchangeGroups,
          cipherSuites,
        },
      });

      edges.push({
        id: `${agentRef}->${ref}`,
        source: agentRef,
        target: ref,
        label: negotiated,
        labelVisible: true,
      });
    });

    return { nodes, edges };
  }, [isRealtimeCBOM, detailsData]);

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

      const levelId = complianceFindingsMap.get(refId);
      const levelColor = levelId !== undefined
        ? complianceResult?.complianceLevels.find((l) => l.id === levelId)?.colorHex
        : undefined;

      const node: Node = {
        id: refId,
        data: {
          label: primitive ? `${label} (${primitive})` : label,
        },
        position: { x: 0, y: 0 },
        style: {
          border: levelColor ? `2px solid ${levelColor}` : '1px solid hsl(var(--border))',
          borderRadius: 8,
          padding: 8,
          background: levelColor ? `${levelColor}22` : 'hsl(var(--card))',
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
  }, [detailsData, complianceFindingsMap, complianceResult]);

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
      <div className="w-full px-6 py-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
            <CardDescription>No project identifier provided.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/cbom">
              <Button variant="outline" size="sm">
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
      <div className="w-full px-6 py-4 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-7 w-72" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!cbom) {
    return (
      <div className="w-full px-6 py-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>CBOM Not Found</CardTitle>
            <CardDescription>The requested CBOM could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/cbom">
              <Button variant="outline" size="sm">
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
    <div className="w-full px-6 py-4 space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/cbom">
            <Button variant="ghost" size="sm" className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">{detailsData?.projectIdentifier || cbom.projectIdentifier}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {detailsData?.gitUrl && (
                <Badge variant="secondary" className="font-mono text-xs max-w-[300px] truncate">
                  git: {detailsData.gitUrl}
                </Badge>
              )}
              {detailsData?.branch && (
                <Badge variant="secondary" className="text-xs">
                  branch: {detailsData.branch}
                </Badge>
              )}
              {detailsData?.commit && (
                <Badge variant="secondary" className="font-mono text-xs">
                  commit: {typeof detailsData.commit === 'string' ? detailsData.commit.slice(0, 8) : detailsData.commit}
                </Badge>
              )}
              {detailsData?.createdAt && (
                <Badge variant="outline" className="text-xs">
                  Scanned: <DateDisplay date={detailsData.createdAt} formatString="dd/MM/yyyy HH:mm" showRelative={false} className="ml-1" />
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Compact stats banner */}
      <div className="flex flex-wrap gap-0 rounded-lg border bg-card overflow-hidden">
        {/* Left: numeric stats */}
        <div className="flex flex-wrap items-center gap-6 px-5 py-4 flex-1 min-w-0">
          <div className="flex items-center justify-center border-r pr-6">
            <StatGauge
              percentage={oidCoverage}
              label="OID Coverage"
              color="hsl(var(--chart-5))"
              valueText={`${Math.round(oidCoverage)}%`}
              secondaryText={`${assetsWithOid}/${assets.length || 0}`}
              className="flex flex-col items-center gap-1 text-center"
            />
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total assets</p>
              <p className="text-3xl font-semibold">{totalAssets}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Unique types</p>
              <p className="text-3xl font-semibold">{uniqueAssetTypesCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Findings</p>
              <p className="text-3xl font-semibold">{totalFindings}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Package</p>
              <p className="text-sm font-medium break-all">{detailsData?.projectIdentifier || cbom.projectIdentifier}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Format</p>
              <p className="text-sm font-medium">CycloneDX</p>
            </div>
          </div>
        </div>
        {/* Right: bubble chart */}
        {assets.length > 0 && (
          <div className="border-l px-4 py-3 flex flex-col justify-center min-w-[260px] w-[340px] shrink-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Asset Distribution</p>
            <CBOMBubbleChart assets={assets} height={160} />
          </div>
        )}
      </div>

      {/* Compliance section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Compliance Analysis
                {complianceResult && (
                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      complianceResult.globalComplianceStatus
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}
                  >
                    {complianceResult.globalComplianceStatus ? 'Compliant' : 'Non-Compliant'}
                  </span>
                )}
              </CardTitle>
              {complianceResult ? (
                <CardDescription>
                  {complianceResult.complianceServiceName}&nbsp;&mdash;&nbsp;Policy:{' '}
                  <span className="font-medium">{complianceResult.policyName}</span>
                </CardDescription>
              ) : (
                <CardDescription>Check cryptographic assets against a compliance policy</CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-44 text-sm"
                value={compliancePolicyId}
                onChange={(e) => setCompliancePolicyId(e.target.value)}
                placeholder="Policy ID"
              />
              <Button
                size="sm"
                onClick={handleCheckCompliance}
                disabled={isCheckingCompliance || !compliancePolicyId || !detailsData?.bom}
              >
                {isCheckingCompliance ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Shield className="h-3.5 w-3.5 mr-1.5" />
                    Check
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {complianceResult && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-3">
              {complianceResult.complianceLevels.map((level) => {
                const count = Array.from(complianceFindingsMap.values()).filter((id) => id === level.id).length;
                return (
                  <div
                    key={level.id}
                    className="flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5"
                    style={{ borderColor: `${level.colorHex}88` }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: level.colorHex }}
                    />
                    <div>
                      <p className="text-sm font-medium leading-none">{level.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {count} asset{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {!complianceResult.globalComplianceStatus && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  This project contains asymmetric cryptographic algorithms that are not quantum-safe. Review the highlighted assets in the table and dependency graph below.
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Assets section */}
      <div>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-lg font-semibold">Cryptographic Assets</h2>
            <p className="text-sm text-muted-foreground">
              {Object.values(selectedFilters).some((f) => f.length > 0)
                ? `${filteredAssets.length} of ${totalAssets} assets (filtered)`
                : `${totalAssets} assets found`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {assetViewMode === 'table' && (
              <div className="flex items-center gap-2">
                <Switch
                  id="group-by-ref"
                  checked={groupByRef}
                  onCheckedChange={setGroupByRef}
                />
                <Label htmlFor="group-by-ref" className="text-xs cursor-pointer select-none">
                  Group by ref
                </Label>
              </div>
            )}
            <div className="flex items-center rounded-md border p-0.5 bg-muted/40">
              <Button
                variant={assetViewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs rounded-sm"
                onClick={() => setAssetViewMode('table')}
              >
                Table
              </Button>
              <Button
                variant={(isRealtimeCBOM ? assetViewMode === 'network-graph' : assetViewMode === 'file-tree') ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs rounded-sm"
                onClick={() => setAssetViewMode(isRealtimeCBOM ? 'network-graph' : 'file-tree')}
              >
                {isRealtimeCBOM ? (
                  'Network Graph'
                ) : (
                  'File Tree'
                )}
              </Button>
              <Button
                variant={assetViewMode === 'graph' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-3 text-xs rounded-sm"
                onClick={() => setAssetViewMode('graph')}
              >
                Dependency Graph
              </Button>
            </div>
          </div>
        </div>
        <div>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cryptographic assets found in this CBOM.</p>
          ) : assetViewMode === 'graph' ? (
            dependencyGraph.nodes.length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                No dependency relations were found for this CBOM.
              </div>
            ) : (
              <div className="space-y-2">
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
                {complianceResult && (
                  <div className="flex flex-wrap items-center gap-3 px-1 py-1.5">
                    <span className="text-xs text-muted-foreground">Compliance legend:</span>
                    {complianceResult.complianceLevels.map((level) => (
                      <span key={level.id} className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-sm border-2 inline-block"
                          style={{ borderColor: level.colorHex, background: `${level.colorHex}22` }}
                        />
                        {level.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : assetViewMode === 'network-graph' ? (
            networkGraphData.nodes.length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                No network connections found in this CBOM.
              </div>
            ) : (
              <div className="flex gap-3 items-start">
                <div className="relative h-[420px] flex-1 min-w-0 rounded-md border bg-background overflow-hidden">
                  <GraphCanvas
                    nodes={networkGraphData.nodes}
                    edges={networkGraphData.edges}
                    layoutType="radialOut2d"
                    cameraMode="rotate"
                    edgeLabelPosition="inline"
                    onNodeClick={(internalNode) => {
                      const found = networkGraphData.nodes.find((n) => n.id === internalNode.id) ?? null;
                      setSelectedNetworkNode((prev) => (prev?.id === found?.id ? null : found));
                    }}
                    renderNode={({ node, ...rest }: NodeRendererProps) => (
                      <group>
                        <Sphere {...rest} node={node} />
                        {!node.data?.isAgent && (
                          <ReagraphBadge
                            {...rest}
                            node={node}
                            label={node.data?.tlsVersion ? `TLS ${node.data.tlsVersion}` : 'TLS'}
                            backgroundColor="#7c3aed"
                            textColor="#ffffff"
                            strokeColor="#5b21b6"
                            position="top-right"
                          />
                        )}
                      </group>
                    )}
                  />
                </div>

                {selectedNetworkNode && !selectedNetworkNode.data?.isAgent && (
                  <div className="w-72 shrink-0 rounded-md border bg-card text-card-foreground text-xs overflow-y-auto max-h-[420px]">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="font-semibold text-sm truncate" title={selectedNetworkNode.label}>
                        {selectedNetworkNode.label}
                      </span>
                      <button
                        onClick={() => setSelectedNetworkNode(null)}
                        className="ml-2 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="p-3 space-y-3">
                      {(selectedNetworkNode.data?.snis as string[] | undefined)?.length ? (
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">SNI</p>
                          <div className="flex flex-wrap gap-1">
                            {(selectedNetworkNode.data.snis as string[]).map((s: string) => (
                              <span key={s} className="rounded-full bg-muted px-2 py-0.5 font-mono">{s}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedNetworkNode.data?.tlsVersion && (
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">TLS Version</p>
                          <span className="rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5">
                            TLS {selectedNetworkNode.data.tlsVersion as string}
                          </span>
                        </div>
                      )}

                      {selectedNetworkNode.data?.negotiatedCipherSuite && (
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">Negotiated Cipher Suite</p>
                          <span className="rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold px-2 py-0.5 font-mono break-all">
                            {selectedNetworkNode.data.negotiatedCipherSuite as string}
                          </span>
                        </div>
                      )}

                      {(selectedNetworkNode.data?.keyExchangeGroups as string[] | undefined)?.length ? (
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">Key Exchange Groups</p>
                          <div className="flex flex-wrap gap-1">
                            {(selectedNetworkNode.data.keyExchangeGroups as string[]).map((g: string) => (
                              <span key={g} className="rounded-full bg-muted px-2 py-0.5 font-mono">{g}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {(selectedNetworkNode.data?.cipherSuites as string[] | undefined)?.length ? (
                        <div>
                          <p className="text-muted-foreground font-medium mb-1">
                            Cipher Suites ({(selectedNetworkNode.data.cipherSuites as string[]).length})
                          </p>
                          <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1">
                            {(selectedNetworkNode.data.cipherSuites as string[]).map((cs: string) => (
                              <div
                                key={cs}
                                className={`rounded px-2 py-0.5 font-mono break-all ${
                                  cs === (selectedNetworkNode.data?.negotiatedCipherSuite as string)
                                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 font-semibold'
                                    : 'bg-muted'
                                }`}
                              >
                                {cs}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : assetViewMode === 'file-tree' ? (
            <div className="rounded-md border">
              <FileTreeView
                root={fileTree}
                complianceFindingsMap={complianceFindingsMap}
                complianceResult={complianceResult}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                {filterSelectors.map((selector) => (
                  <div key={selector.key} className="flex flex-col gap-1 min-w-[160px] flex-1">
                    <Label htmlFor={`cbom-${selector.key}-filter`} className="text-xs text-muted-foreground">
                      {selector.label}
                    </Label>
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
                {Object.values(selectedFilters).some((f) => f.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs shrink-0"
                    onClick={() =>
                      setSelectedFilters({
                        name: [],
                        type: [],
                        primitive: [],
                        location: [],
                      })
                    }
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              {filteredAssets.length === 0 && (
                <div className="p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                  No assets match the selected filters.
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    {groupByRef && <TableHead className="w-8" />}
                    <TableHead>Cryptographic asset</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Primitive</TableHead>
                    {groupByRef ? (
                      <TableHead className="text-right">Occurrences</TableHead>
                    ) : (
                      <TableHead>Location</TableHead>
                    )}
                    <TableHead>Compliance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupByRef
                    ? groupedAssets.map((asset, index) => {
                        const typeLabel = capitalizeFirstLetter(asset.cryptoProperties?.assetType || asset.type || '-');
                        const allOccurrences = (asset as any)._allOccurrences as NonNullable<CBOMAsset['evidence']>['occurrences'];
                        const occurrenceCount = allOccurrences?.length ?? 0;
                        const bomRef = asset['bom-ref'];
                        const rowKey = bomRef || asset.name || `grouped-${index}`;
                        const isExpanded = expandedRefs.has(rowKey);
                        const levelId = bomRef ? complianceFindingsMap.get(bomRef) : undefined;
                        const level = levelId !== undefined
                          ? complianceResult?.complianceLevels.find((l) => l.id === levelId)
                          : undefined;

                        return (
                          <React.Fragment key={rowKey}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() =>
                                setExpandedRefs((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(rowKey)) next.delete(rowKey);
                                  else next.add(rowKey);
                                  return next;
                                })
                              }
                            >
                              <TableCell className="w-8 pr-0">
                                {isExpanded
                                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="font-medium">{asset.name || '-'}</TableCell>
                              <TableCell>{typeLabel}</TableCell>
                              <TableCell>{asset.cryptoProperties?.algorithmProperties?.primitive || '-'}</TableCell>
                              <TableCell className="text-right">
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                                  {occurrenceCount}
                                </span>
                              </TableCell>
                              <TableCell>
                                {!complianceResult || !level ? (
                                  <span className="text-muted-foreground text-xs">—</span>
                                ) : (
                                  <span
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                                    style={{ borderColor: `${level.colorHex}88`, color: level.colorHex, background: `${level.colorHex}18` }}
                                  >
                                    {level.label}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`${rowKey}-occurrences`}>
                                <TableCell />
                                <TableCell colSpan={5} className="py-0 pb-2">
                                  <div className="rounded-md border bg-muted/30 text-xs">
                                    <table className="w-full">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Location</th>
                                          <th className="text-right px-3 py-1.5 font-medium text-muted-foreground w-16">Line</th>
                                          <th className="text-right px-3 py-1.5 font-medium text-muted-foreground w-16">Offset</th>
                                          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-32">Context</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(allOccurrences ?? []).map((occ, i) => (
                                          <tr key={i} className="border-b last:border-0">
                                            <td className="px-3 py-1.5 font-mono text-primary">
                                              <span className="inline-flex items-center gap-1">
                                                {occ?.location || '—'}
                                                <ExternalLink className="h-3 w-3 shrink-0" />
                                              </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                              {occ?.line ?? '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                              {occ?.offset ?? '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-muted-foreground">
                                              {occ?.additionalContext || '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })
                    : filteredAssets.map((asset, index) => {
                        const typeLabel = capitalizeFirstLetter(asset.cryptoProperties?.assetType || asset.type || '-');
                        const firstOccurrence = asset.evidence?.occurrences?.[0];
                        const location = firstOccurrence?.location || '-';
                        const line = firstOccurrence?.line;
                        const bomRef = asset['bom-ref'];
                        const levelId = bomRef ? complianceFindingsMap.get(bomRef) : undefined;
                        const level = levelId !== undefined
                          ? complianceResult?.complianceLevels.find((l) => l.id === levelId)
                          : undefined;

                        return (
                          <TableRow
                            key={`${asset['bom-ref'] || asset.name || 'asset'}-${index}`}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedAsset(asset);
                              setAssetDetailOpen(true);
                            }}
                          >
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
                            <TableCell>
                              {!complianceResult || !level ? (
                                <span className="text-muted-foreground text-xs">—</span>
                              ) : (
                                <span
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                                  style={{ borderColor: `${level.colorHex}88`, color: level.colorHex, background: `${level.colorHex}18` }}
                                >
                                  {level.label}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <CBOMAssetDetailDialog
        asset={selectedAsset}
        open={assetDetailOpen}
        onOpenChange={setAssetDetailOpen}
        gitUrl={detailsData?.gitUrl}
        branch={detailsData?.branch}
      />

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
      <div className="w-full px-6 py-4 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-7 w-72" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    }>
      <CBOMDetailsContent />
    </Suspense>
  );
}

