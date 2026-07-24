'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Editor from '@monaco-editor/react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCBOM, deleteCBOM, CBOMItem, runComplianceCheck, type QuantumSafeComplianceResult } from '@/lib/cbom-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Trash2, Download, ExternalLink, Shield, Loader2, AlertTriangle, ChevronDown, ChevronRight, Folder, FolderOpen, FileCode, Info } from 'lucide-react';
import {
  GraphCanvas,
  Sphere,
  Badge as ReagraphBadge,
  type GraphNode,
  type GraphEdge,
  type NodeRendererProps,
} from 'reagraph';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { Separator } from '@/components/ui/separator';
import chiperInfo from '../../../../chiper_info.json';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { getCBOMType } from '@/lib/cbom-type';

type CipherStrength = 'recommended' | 'secure' | 'weak' | 'insecure' | 'unknown';

function getCipherStrength(cs: string): CipherStrength {
  if ((chiperInfo.recommended as string[]).includes(cs)) return 'recommended';
  if ((chiperInfo.secure as string[]).includes(cs)) return 'secure';
  if ((chiperInfo.weak as string[]).includes(cs)) return 'weak';
  if ((chiperInfo.insecure as string[]).includes(cs)) return 'insecure';
  return 'unknown';
}

const cipherStrengthBadge: Record<CipherStrength, { label: string; className: string; short: string; compactClass: string }> = {
  recommended: { label: 'Recommended', className: 'bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30',   short: 'R', compactClass: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  secure:      { label: 'Secure',      className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30',      short: 'S', compactClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  weak:        { label: 'Weak',        className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30', short: 'W', compactClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  insecure:    { label: 'Insecure',    className: 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30',        short: 'I', compactClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300' },
  unknown:     { label: 'Unknown',     className: 'bg-muted text-muted-foreground border border-border',                           short: '?', compactClass: 'bg-muted text-muted-foreground' },
};

const chip = 'inline-flex items-center rounded border px-2 py-0.5 text-xs';
const networkDetailChipClass = `${chip} border-border/70 bg-muted/40 font-mono text-foreground`;

function NetworkDetailSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 border-b border-border/30 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          {title}
        </p>
        {meta ? (
          <span className="text-xs text-muted-foreground/60">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function PanelGroupHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <div className="flex-1 border-t border-border/30" />
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
        {label}
      </span>
      <div className="flex-1 border-t border-border/30" />
    </div>
  );
}

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
type AssetViewMode = 'table' | 'file-tree' | 'network-graph' | 'network-table';

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

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }

      if (!entry || typeof entry !== 'object') {
        return '';
      }

      const record = entry as Record<string, unknown>;
      const candidate =
        record.name ??
        record.value ??
        record.id ??
        record.algorithm ??
        record.scheme;

      return typeof candidate === 'string' ? candidate.trim() : '';
    })
    .filter(Boolean);

  return Array.from(new Set(values));
};

const parseStringList = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }

  try {
    return normalizeStringList(JSON.parse(raw));
  } catch {
    return raw.trim() ? [raw.trim()] : [];
  }
};

const getPropertyStringList = (
  properties: Array<{ name?: string; value?: string }> | undefined,
  names: string[],
): string[] =>
  Array.from(
    new Set(
      names.flatMap((name) => parseStringList(extractProperty(properties, name))),
    ),
  );

const getProtocolStringList = (
  protocolProperties: Record<string, unknown> | undefined,
  names: string[],
): string[] =>
  Array.from(
    new Set(
      names.flatMap((name) => normalizeStringList(protocolProperties?.[name])),
    ),
  );

interface AlgorithmProperties {
  primitive?: string;
  nistQuantumSecurityLevel?: number;
  classicalSecurityLevel?: number;
  mode?: string;
  curve?: string;
  oid?: string;
}

interface NegotiatedAlg {
  name: string;
  primitive: string;
  oid?: string;
  nistQuantumSecurityLevel?: number;
  classicalSecurityLevel?: number;
  mode?: string;
  curve?: string;
}

interface OfferedCipherSuiteObj {
  name: string;
  identifiers?: string[];
  algorithms: NegotiatedAlg[];
}

interface CertificateInfo {
  subjectName: string;
  issuerName: string;
  notValidBefore?: string;
  notValidAfter?: string;
  subjectPublicKeyAlg?: string;
  signatureAlg?: string;
}

interface PqcResult {
  pqc: boolean;
  level: number;
  assets: string[];
}

const ROLE_ORDER = [
  'Key agreement / KEM',
  'Authentication / Signature',
  'Bulk encryption',
  'Hash / HKDF',
  'MAC',
  'Other',
] as const;

type AlgRole = typeof ROLE_ORDER[number];

function primitiveToRole(primitive: string): AlgRole {
  if (['key-agree', 'kem', 'combiner'].includes(primitive)) return 'Key agreement / KEM';
  if (['signature', 'pke'].includes(primitive)) return 'Authentication / Signature';
  if (['ae', 'block-cipher', 'stream-cipher'].includes(primitive)) return 'Bulk encryption';
  if (primitive === 'hash') return 'Hash / HKDF';
  if (primitive === 'mac') return 'MAC';
  return 'Other';
}

function resolveAlg(c: any): NegotiatedAlg {
  const algProps = c.cryptoProperties?.algorithmProperties as AlgorithmProperties | undefined;
  return {
    name: (c.name as string | undefined) ?? (c['bom-ref'] as string),
    primitive: algProps?.primitive ?? 'unknown',
    oid: algProps?.oid,
    nistQuantumSecurityLevel: algProps?.nistQuantumSecurityLevel,
    classicalSecurityLevel: algProps?.classicalSecurityLevel,
    mode: algProps?.mode,
    curve: algProps?.curve,
  };
}

function resolveGroupPqc(
  negotiatedGroupName: string,
  componentMap: Map<string, any>,
  cryptoRefArray: string[],
): PqcResult {
  if (!negotiatedGroupName) return { pqc: false, level: 0, assets: [] };

  const pqcAssets: string[] = [];
  let maxLevel = 0;

  // Walk the cryptoRefArray of the protocol asset — these are direct refs to algorithm components
  for (const ref of cryptoRefArray) {
    const comp = componentMap.get(ref);
    if (!comp) continue;
    const algProps = comp.cryptoProperties?.algorithmProperties as AlgorithmProperties | undefined;
    const primitive = algProps?.primitive;
    const level = algProps?.nistQuantumSecurityLevel ?? 0;
    if (primitive === 'kem' || primitive === 'combiner') {
      pqcAssets.push(comp.name ?? ref);
      if (level > maxLevel) maxLevel = level;
    }
  }

  // Also check by name: look for a component whose name matches the negotiated group
  if (pqcAssets.length === 0) {
    for (const [, comp] of componentMap) {
      if ((comp.name as string | undefined)?.toLowerCase() === negotiatedGroupName.toLowerCase()) {
        const algProps = comp.cryptoProperties?.algorithmProperties as AlgorithmProperties | undefined;
        const level = algProps?.nistQuantumSecurityLevel ?? 0;
        if (level > 0) {
          pqcAssets.push(comp.name);
          if (level > maxLevel) maxLevel = level;
        }
      }
    }
  }

  return { pqc: maxLevel >= 1, level: maxLevel, assets: pqcAssets };
}

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
  const { user, isLoggedIn } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const monacoTheme = useMonacoTheme();
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
  const [activeTab, setActiveTab] = useState<'overview' | 'assets' | 'raw'>('overview');
  const [assetViewMode, setAssetViewMode] = useState<AssetViewMode>('table');
  const [selectedNetworkNode, setSelectedNetworkNode] = useState<GraphNode | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<CBOMAsset | null>(null);
  const [assetDetailOpen, setAssetDetailOpen] = useState(false);
  const [complianceResult, setComplianceResult] = useState<QuantumSafeComplianceResult | null>(null);
  const [compliancePolicyId, setCompliancePolicyId] = useState('quantum_safe');
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [groupByRef, setGroupByRef] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());

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

  const cbomType = React.useMemo(() => getCBOMType(detailsData), [detailsData]);
  const isRealtimeCBOM = cbomType === 'realtime';

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
    const componentMap = new Map<string, any>(
      components.map((c: any) => [c['bom-ref'] as string, c]),
    );

    // Map protocol bom-ref → service endpoint name ("ip:port") from top-level services[]
    const bomServices: any[] = bom?.services ?? [];
    const bomDeps: any[] = bom?.dependencies ?? [];
    const serviceMap = new Map<string, string>();
    // Map bom-ref → dependsOn[] — used to resolve in-use algorithms when cryptoRefArray is empty (old CBOMs)
    const dependsOnMap = new Map<string, string[]>();
    for (const dep of bomDeps) {
      if (Array.isArray(dep.dependsOn)) dependsOnMap.set(dep.ref as string, dep.dependsOn as string[]);
    }
    for (const svc of bomServices) {
      const svcRef = svc['bom-ref'] as string;
      const svcName = (svc.name as string) ?? '';
      const dep = bomDeps.find((d: any) => d.ref === svcRef);
      for (const pRef of (dep?.dependsOn ?? []) as string[]) {
        if (!serviceMap.has(pRef)) serviceMap.set(pRef, svcName);
      }
    }

    const protocols = components.filter(
      (c: any) => c.cryptoProperties?.assetType === 'protocol',
    );

    protocols.forEach((proto: any) => {
      const ref: string = proto['bom-ref'];
      const props: Array<{ name: string; value: string }> = proto.properties ?? [];
      const protocolProperties = proto.cryptoProperties?.protocolProperties as Record<string, unknown> | undefined;

      const snis = getPropertyStringList(props, ['live-cbom:tls.sni']);
      const sniLabel = snis[0] ?? ref;

      const version: string = typeof protocolProperties?.version === 'string' ? protocolProperties.version : '';
      // Support both the new decomposed names and the old flat names for backward compatibility
      const negotiatedCipherSuite =
        props.find((p: any) => p.name === 'live-cbom:tls.negotiated.cipherSuite')?.value ??
        props.find((p: any) => p.name === 'live-cbom:tls.negotiatedCipherSuite')?.value ??
        '';

      const supportedVersions = getPropertyStringList(props, ['live-cbom:tls.client.supportedVersions']);
      const serverSelectedVersion = props.find((p: any) => p.name === 'live-cbom:tls.server.selectedVersion')?.value ?? '';

      // negotiated.group is new; old CBOMs use keyExchangeGroups or supportedGroups (take first as negotiated)
      const allKeyExchangeGroups = getPropertyStringList(props, [
        'live-cbom:tls.keyExchangeGroups',
        'live-cbom:tls.supportedGroups',
      ]);
      const negotiatedGroup =
        props.find((p: any) => p.name === 'live-cbom:tls.negotiated.group')?.value ??
        allKeyExchangeGroups[0] ??
        '';
      const offeredGroups = getPropertyStringList(props, ['live-cbom:tls.offered.groups']).length
        ? getPropertyStringList(props, ['live-cbom:tls.offered.groups'])
        : allKeyExchangeGroups;
      const offeredSignatureAlgorithms = getPropertyStringList(props, [
        'live-cbom:tls.offered.signatureAlgorithms',
        'live-cbom:tls.signatureAlgorithms',
        'live-cbom:tls.client.signatureAlgorithms',
        'live-cbom:tls.server.signatureAlgorithms',
      ]);
      const authVisibility =
        props.find((p: any) => p.name === 'live-cbom:tls.auth.visibility')?.value ?? '';

      const cipherSuites = getProtocolStringList(protocolProperties, ['cipherSuites']);

      // cryptoRefArray is the authoritative in-use asset list (new CBOMs only).
      // Old CBOMs leave it empty; fall back to bom.dependencies[proto.ref].dependsOn which
      // contains the same information in older live-cbom schema versions.
      const rawCryptoRefs: string[] = Array.isArray(protocolProperties?.cryptoRefArray)
        ? (protocolProperties!.cryptoRefArray as string[])
        : [];
      const cryptoRefArray: string[] = rawCryptoRefs.length > 0
        ? rawCryptoRefs
        : (dependsOnMap.get(ref) ?? []);

      const pqcResult = resolveGroupPqc(negotiatedGroup, componentMap, cryptoRefArray);

      // Decomposed algorithms for the negotiated session
      const negotiatedAlgorithms: NegotiatedAlg[] = cryptoRefArray
        .map((r) => componentMap.get(r))
        .filter((c) => c && c.cryptoProperties?.assetType === 'algorithm')
        .map(resolveAlg);

      // Offered cipher suites with their decomposed algorithm refs
      const rawCipherSuites: Array<{ name?: string; identifiers?: string[]; algorithms?: string[] }> =
        Array.isArray(protocolProperties?.cipherSuites)
          ? (protocolProperties!.cipherSuites as any[])
          : [];

      const offeredCipherSuites: OfferedCipherSuiteObj[] = rawCipherSuites.map((suite) => ({
        name: suite.name ?? '',
        identifiers: suite.identifiers,
        algorithms: (suite.algorithms ?? [])
          .map((r: string) => componentMap.get(r))
          .filter((c: any) => c && c.cryptoProperties?.assetType === 'algorithm')
          .map(resolveAlg),
      }));

      const warning = props.find((p: any) => p.name === 'live-cbom:warning')?.value ?? '';
      const endpoint = serviceMap.get(ref) ?? '';

      // Certificate details — only present for TLS ≤ 1.2. Use rawCryptoRefs (not the fallback
      // dependsOn list) because old CBOMs never include cert refs in their dependency entries.
      const certificates: CertificateInfo[] = rawCryptoRefs
        .map((r) => componentMap.get(r))
        .filter((c) => c && c.cryptoProperties?.assetType === 'certificate')
        .map((c) => {
          const cp = c.cryptoProperties?.certificateProperties as Record<string, any> | undefined;
          const pubKeyComp = cp?.subjectPublicKeyRef ? componentMap.get(cp.subjectPublicKeyRef) : null;
          const sigAlgComp = cp?.signatureAlgorithmRef ? componentMap.get(cp.signatureAlgorithmRef) : null;
          return {
            subjectName: cp?.subjectName ?? '',
            issuerName: cp?.issuerName ?? '',
            notValidBefore: cp?.notValidBefore,
            notValidAfter: cp?.notValidAfter,
            subjectPublicKeyAlg: pubKeyComp?.name ?? cp?.subjectPublicKeyRef ?? '',
            signatureAlg: sigAlgComp?.name ?? cp?.signatureAlgorithmRef ?? '',
          } satisfies CertificateInfo;
        });

      nodes.push({
        id: ref,
        label: sniLabel,
        size: 4,
        data: {
          isAgent: false,
          tlsVersion: version,
          snis,
          negotiatedCipherSuite,
          supportedVersions,
          serverSelectedVersion,
          negotiatedGroup,
          offeredGroups,
          offeredSignatureAlgorithms,
          authVisibility,
          cipherSuites,
          negotiatedAlgorithms,
          offeredCipherSuites,
          pqcProtected: pqcResult.pqc,
          pqcLevel: pqcResult.level,
          pqcAssets: pqcResult.assets,
          warning,
          endpoint,
          certificates,
        },
      });

      edges.push({
        id: `${agentRef}->${ref}`,
        source: agentRef,
        target: ref,
        label: negotiatedCipherSuite,
        labelVisible: true,
      });
    });

    return { nodes, edges };
  }, [isRealtimeCBOM, detailsData]);

  const cbomTypeLabel = cbomType === 'realtime'
    ? 'Realtime capture'
    : cbomType === 'filesystem'
      ? 'Filesystem scan'
      : 'Repository scan';
  const cbomTypePillClass = cbomType === 'realtime'
    ? 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300'
    : cbomType === 'filesystem'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  const pqcSessionStat = React.useMemo(() => {
    if (!isRealtimeCBOM) return null;
    const protocolNodes = networkGraphData.nodes.filter((n) => !n.data?.isAgent);
    const total = protocolNodes.length;
    const protected_ = protocolNodes.filter((n) => n.data?.pqcProtected).length;
    return { protected: protected_, total };
  }, [isRealtimeCBOM, networkGraphData]);
  const rawCbomJson = React.useMemo(
    () => JSON.stringify(cbom?.data ?? cbom ?? {}, null, 2),
    [cbom],
  );

  const heroSummaryCards = [
    {
      label: 'Total assets',
      value: totalAssets.toString(),
      hint: totalAssets === 1 ? 'Cryptographic component' : 'Cryptographic components',
    },
    {
      label: 'Unique names',
      value: uniqueAssetTypesCount.toString(),
      hint: 'Distinct tracked assets',
    },
    {
      label: 'Findings',
      value: totalFindings.toString(),
      hint: totalFindings === 1 ? 'Detected occurrence' : 'Detected occurrences',
    },
    {
      label: 'OID coverage',
      value: `${Math.round(oidCoverage)}%`,
      hint: `${assetsWithOid}/${assets.length || 0} assets with OID`,
    },
    ...(pqcSessionStat !== null
      ? [{
          label: 'PQC sessions',
          value: `${pqcSessionStat.protected}/${pqcSessionStat.total}`,
          hint: 'PQC-protected TLS sessions',
        }]
      : []),
  ];

  if (!isLoggedIn) {
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
    <BreadcrumbPage
      className="space-y-5"
      items={[
        { label: 'Home', href: '/' },
        { label: 'CBOM', href: '/cbom' },
        {
          label: (
            <Badge variant="default" className="text-xs">
              {detailsData?.projectIdentifier || cbom.projectIdentifier}
            </Badge>
          ),
        },
      ]}
    >

      {/* ── Hero + Tabs (flush, no space-y gap between them) ── */}
      <div className="flex flex-col">

      {/* ── Hero ── */}
      <div className="pb-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

          {/* Identity */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <h1 className="truncate text-2xl font-semibold tracking-tight" title={detailsData?.projectIdentifier || cbom.projectIdentifier}>
                  {detailsData?.projectIdentifier || cbom.projectIdentifier}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inspect cryptographic assets, dependencies, network exposure, and compliance results for this CBOM.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium', cbomTypePillClass)}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                  {cbomTypeLabel.toUpperCase()}
                </span>
                <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">CycloneDX</span>
                {detailsData?.gitUrl && (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 font-mono text-xs text-muted-foreground max-w-[320px] truncate">
                    {detailsData.gitUrl}
                  </span>
                )}
                {detailsData?.branch && (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    branch: {detailsData.branch}
                  </span>
                )}
                {detailsData?.commit && (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 font-mono text-xs text-muted-foreground">
                    commit: {typeof detailsData.commit === 'string' ? detailsData.commit.slice(0, 8) : detailsData.commit}
                  </span>
                )}
                {detailsData?.createdAt && (
                  <span className="inline-flex h-6 items-center rounded-md bg-muted/80 px-2 text-xs text-muted-foreground">
                    scanned
                    <DateDisplay date={detailsData.createdAt} formatString="dd/MM/yyyy HH:mm" showRelative={false} className="ml-1" />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions + Stats */}
          <div className="flex flex-col gap-4 xl:flex-1 xl:pl-6 xl:border-l">

            {/* Actions */}
            <div className="flex items-center gap-2 xl:justify-end">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>

            {/* Stats */}
            <div>
              <div className={cn('grid gap-4', pqcSessionStat !== null ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
                {heroSummaryCards.map((item, index) => (
                  <div key={item.label} className={cn('px-1 sm:px-4', index > 0 && 'sm:border-l')}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'overview' | 'assets' | 'raw')}
        className="w-full"
      >
        <div className="border-b overflow-x-auto overflow-y-hidden">
          <TabsList className={cn(pageTabsListClass, "min-w-max")}>
            {[
              { value: 'overview', label: 'Overview' },
              { value: 'assets', label: 'Assets' },
              { value: 'raw', label: 'Raw' },
            ].map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={pageTabsTriggerClass}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="pb-6">
          <TabsContent value="overview" className="mt-0">

            {/* Source */}
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
              <div>
                <p className="font-semibold">Source</p>
                <p className="text-sm text-muted-foreground mt-1">Repository and scan identity for this CBOM.</p>
              </div>
              <div className="lg:col-span-2">
                <DetailInfoRows>
                  <DetailInfoRow
                    label="Package"
                    value={detailsData?.projectIdentifier || cbom.projectIdentifier}
                    className="first:pt-0"
                  />
                  <DetailInfoRow
                    label="Repository"
                    value={<span className="break-all">{detailsData?.gitUrl || '-'}</span>}
                  />
                  <DetailInfoRow
                    label="Branch"
                    value={detailsData?.branch || '-'}
                  />
                  <DetailInfoRow
                    label="Commit"
                    value={<span className="font-mono text-xs">{typeof detailsData?.commit === 'string' ? detailsData.commit : '-'}</span>}
                  />
                  <DetailInfoRow
                    label="Captured"
                    value={detailsData?.createdAt
                      ? <DateDisplay date={detailsData.createdAt} formatString="dd/MM/yyyy HH:mm" />
                      : '-'
                    }
                    className="last:pb-0"
                  />
                </DetailInfoRows>
              </div>
            </div>

            <Separator />

            {/* Coverage */}
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
              <div>
                <p className="font-semibold">Coverage</p>
                <p className="text-sm text-muted-foreground mt-1">OID identifier completeness and asset type spread.</p>
              </div>
              <div className="lg:col-span-2 space-y-6">
                {assets.length > 0 ? (
                  <CBOMBubbleChart assets={assets} height={220} />
                ) : (
                  <p className="text-sm text-muted-foreground">No cryptographic assets found.</p>
                )}
                <DetailInfoRows>
                  <DetailInfoRow
                    label="OID Coverage"
                    value={
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{Math.round(oidCoverage)}%</span>
                        <span className="text-xs text-muted-foreground">({assetsWithOid} of {assets.length || 0} assets have an OID)</span>
                      </div>
                    }
                    className="first:pt-0"
                  />
                  <DetailInfoRow
                    label="Total Assets"
                    value={assets.length}
                    className="last:pb-0"
                  />
                </DetailInfoRows>
              </div>
            </div>

          </TabsContent>

          <TabsContent value="assets" className="mt-0">
            <div className="space-y-4">

              {/* Assets + Compliance merged header */}
              <div>
              <div className="border-b pb-3 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold">
                      Cryptographic Assets
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {Object.values(selectedFilters).some((f) => f.length > 0)
                        ? `${filteredAssets.length} of ${totalAssets} assets currently visible`
                        : `${totalAssets} assets available in this CBOM`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Compliance controls */}
                    <Select value={compliancePolicyId} onValueChange={setCompliancePolicyId}>
                      <SelectTrigger className="h-9 w-44 text-sm">
                        <SelectValue placeholder="Policy ID" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quantum_safe">quantum_safe</SelectItem>
                        <SelectItem value="pqc">pqc</SelectItem>
                        <SelectItem value="eccg_v2">eccg_v2</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={handleCheckCompliance}
                      disabled={isCheckingCompliance || !compliancePolicyId || !detailsData?.bom}
                    >
                      {isCheckingCompliance ? (
                        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Checking...</>
                      ) : (
                        <>Check compliance</>
                      )}
                    </Button>

                    {assetViewMode === 'table' && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id="group-by-ref"
                          checked={groupByRef}
                          onCheckedChange={setGroupByRef}
                        />
                        <Label htmlFor="group-by-ref" className="cursor-pointer select-none text-xs">
                          Group by ref
                        </Label>
                      </div>
                    )}
                    <div className="flex items-center rounded-md border p-0.5 bg-muted/40">
                      <Button
                        variant={assetViewMode === 'table' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 rounded-sm px-3 text-xs"
                        onClick={() => setAssetViewMode('table')}
                      >
                        Table
                      </Button>
                      <Button
                        variant={(isRealtimeCBOM ? assetViewMode === 'network-graph' : assetViewMode === 'file-tree') ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 rounded-sm px-3 text-xs"
                        onClick={() => setAssetViewMode(isRealtimeCBOM ? 'network-graph' : 'file-tree')}
                      >
                        {isRealtimeCBOM ? 'Network Graph' : 'File Tree'}
                      </Button>
                      {isRealtimeCBOM && (
                        <Button
                          variant={assetViewMode === 'network-table' ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 rounded-sm px-3 text-xs"
                          onClick={() => setAssetViewMode('network-table')}
                        >
                          Network Table
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compliance results */}
              {complianceResult ? (
                <div className="space-y-3 mb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      complianceResult.globalComplianceStatus
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {complianceResult.globalComplianceStatus ? 'Compliant' : 'Non-Compliant'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {complianceResult.complianceServiceName} · Policy <span className="font-medium text-foreground">{complianceResult.policyName}</span>
                    </span>
                    <div className="flex flex-wrap gap-2 ml-2">
                      {complianceResult.complianceLevels.map((level) => {
                        const count = Array.from(complianceFindingsMap.values()).filter((id) => id === level.id).length;
                        return (
                          <span key={level.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs" style={{ borderColor: `${level.colorHex}88`, color: level.colorHex }}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {level.label} · {count}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {!complianceResult.globalComplianceStatus && (
                    <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2.5 dark:border-yellow-800 dark:bg-yellow-900/20">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                      <p className="text-xs text-yellow-800 dark:text-yellow-300">
                        This project contains asymmetric cryptographic algorithms that are not quantum-safe. Review the highlighted assets below.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
              <div className="space-y-4">
                <div>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cryptographic assets found in this CBOM.</p>
          ) : assetViewMode === 'network-graph' ? (
            networkGraphData.nodes.length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                No network connections found in this CBOM.
              </div>
            ) : (
              <div className="flex gap-3 items-start">
                <div className="relative h-[420px] flex-1 min-w-0 rounded-md bg-background overflow-hidden">
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
                    renderNode={({ node, ...rest }: NodeRendererProps) => {
                      const negotiated = node.data?.negotiatedCipherSuite as string | undefined;
                      const suites = node.data?.cipherSuites as string[] | undefined;
                      const strengthKey: CipherStrength = negotiated
                        ? getCipherStrength(negotiated)
                        : suites?.length
                          ? (['recommended', 'secure', 'weak', 'insecure', 'unknown'] as CipherStrength[]).find(
                              (s) => suites.some((cs) => getCipherStrength(cs) === s),
                            ) ?? 'unknown'
                          : 'unknown';
                      const strengthColors: Record<CipherStrength, { bg: string; stroke: string }> = {
                        recommended: { bg: '#16a34a', stroke: '#15803d' },
                        secure:      { bg: '#2563eb', stroke: '#1d4ed8' },
                        weak:        { bg: '#d97706', stroke: '#b45309' },
                        insecure:    { bg: '#dc2626', stroke: '#b91c1c' },
                        unknown:     { bg: '#6b7280', stroke: '#4b5563' },
                      };
                      const sc = strengthColors[strengthKey];
                      const pqcProtected = node.data?.pqcProtected as boolean | undefined;
                      return (
                        <group>
                          <Sphere {...rest} node={node} />
                          {!node.data?.isAgent && (
                            <>
                              <ReagraphBadge
                                {...rest}
                                node={node}
                                label={node.data?.tlsVersion ? `TLS ${node.data.tlsVersion}` : 'TLS'}
                                backgroundColor="#7c3aed"
                                textColor="#ffffff"
                                strokeColor="#5b21b6"
                                position="top-right"
                              />
                              {suites?.length ? (
                                <ReagraphBadge
                                  {...rest}
                                  node={node}
                                  label={cipherStrengthBadge[strengthKey].label}
                                  backgroundColor={sc.bg}
                                  textColor="#ffffff"
                                  strokeColor={sc.stroke}
                                  position="bottom-right"
                                />
                              ) : null}
                              <ReagraphBadge
                                {...rest}
                                node={node}
                                label={pqcProtected ? 'PQC' : 'Classical'}
                                backgroundColor={pqcProtected ? '#0891b2' : '#78716c'}
                                textColor="#ffffff"
                                strokeColor={pqcProtected ? '#0e7490' : '#57534e'}
                                position="bottom-left"
                              />
                            </>
                          )}
                        </group>
                      );
                    }}
                  />
                </div>

                {selectedNetworkNode && !selectedNetworkNode.data?.isAgent && (
                  <div className="w-1/3 shrink-0 overflow-y-auto max-h-[420px] pl-4 border-l">

                    {/* Header */}
                    <div className="flex items-center justify-between pb-3">
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

                    {/* Warning */}
                    {(selectedNetworkNode.data?.warning as string | undefined) && (
                      <div className="mb-3 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                        <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400">⚠</span>
                        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                          {selectedNetworkNode.data.warning as string}
                        </p>
                      </div>
                    )}

                    <div className="divide-y text-sm">

                      {/* Endpoint */}
                      {(selectedNetworkNode.data?.endpoint as string | undefined) && (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Endpoint</p>
                          <p className="mt-1 font-mono text-sm">{selectedNetworkNode.data.endpoint as string}</p>
                        </div>
                      )}

                      {/* Host (SNI) */}
                      {(selectedNetworkNode.data?.snis as string[] | undefined)?.length ? (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Host (SNI)</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(selectedNetworkNode.data.snis as string[]).map((s: string) => (
                              <span key={s} className={networkDetailChipClass}>{s}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* TLS Version */}
                      {selectedNetworkNode.data?.tlsVersion && (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">TLS Version</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`${chip} border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-medium`}>
                              TLS {selectedNetworkNode.data.tlsVersion as string}
                            </span>
                            {(selectedNetworkNode.data?.supportedVersions as string[] | undefined)?.length ? (
                              <span className="text-xs text-muted-foreground">
                                ({(selectedNetworkNode.data.supportedVersions as string[]).join(', ')} offered)
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {/* Cipher Suite */}
                      {selectedNetworkNode.data?.negotiatedCipherSuite && (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Cipher Suite</p>
                          {(() => {
                            const cs = selectedNetworkNode.data.negotiatedCipherSuite as string;
                            const badge = cipherStrengthBadge[getCipherStrength(cs)];
                            return (
                              <div className="mt-1 flex items-start gap-1.5 flex-wrap">
                                <span className={`${chip} font-medium ${badge.className}`}>{badge.label}</span>
                                <span className="font-mono text-sm font-medium break-all">{cs}</span>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* In-use Algorithms */}
                      {(selectedNetworkNode.data?.negotiatedAlgorithms as NegotiatedAlg[] | undefined)?.length ? (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Algorithms</p>
                          {(() => {
                            const algs = selectedNetworkNode.data!.negotiatedAlgorithms as NegotiatedAlg[];
                            const byRole = new Map<AlgRole, NegotiatedAlg[]>();
                            for (const alg of algs) {
                              const role = primitiveToRole(alg.primitive);
                              if (!byRole.has(role)) byRole.set(role, []);
                              byRole.get(role)!.push(alg);
                            }
                            return (
                              <div className="mt-1 space-y-2">
                                {ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => (
                                  <div key={role}>
                                    <p className="text-xs text-muted-foreground/60 mb-1">{role}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {byRole.get(role)!.map((alg) => {
                                        const isPqc = (alg.nistQuantumSecurityLevel ?? 0) >= 1;
                                        const secLevel = alg.nistQuantumSecurityLevel ?? 0;
                                        const classicLevel = alg.classicalSecurityLevel ?? 0;
                                        const tip = [alg.oid ? `OID ${alg.oid}` : '', secLevel > 0 ? `NIST PQC level ${secLevel}` : '', classicLevel > 0 ? `${classicLevel}-bit classical` : ''].filter(Boolean).join(' · ');
                                        return (
                                          <span key={alg.name} title={tip || undefined} className={`${networkDetailChipClass} ${isPqc ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400' : ''}`}>
                                            {alg.name}
                                            {(secLevel > 0 || classicLevel > 0) && (
                                              <span className={`ml-1 text-[10px] font-sans ${isPqc ? 'text-cyan-500/70' : 'text-muted-foreground/50'}`}>
                                                {secLevel > 0 ? `L${secLevel}` : `${classicLevel}b`}
                                              </span>
                                            )}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}

                      {/* Key Exchange Group */}
                      {(selectedNetworkNode.data?.negotiatedGroup as string | undefined) && (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Key Exchange Group</p>
                          <p className="mt-1 font-mono text-sm">{selectedNetworkNode.data.negotiatedGroup as string}</p>
                        </div>
                      )}

                      {/* PQC Readiness */}
                      {(() => {
                        const pqcProtected = selectedNetworkNode.data?.pqcProtected as boolean | undefined;
                        const pqcLevel = selectedNetworkNode.data?.pqcLevel as number | undefined;
                        const pqcAssets = selectedNetworkNode.data?.pqcAssets as string[] | undefined;
                        return (
                          <div className="py-3 first:pt-0">
                            <p className="text-xs font-medium text-muted-foreground">PQC Readiness</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {pqcProtected ? (
                                <span className={`${chip} border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 font-medium`}>
                                  PQC-protected{pqcLevel ? ` · NIST L${pqcLevel}` : ''}
                                </span>
                              ) : (
                                <span className={`${chip} border-border/70 bg-muted/40 text-muted-foreground font-medium`}>
                                  Classical / quantum-vulnerable
                                </span>
                              )}
                            </div>
                            {pqcAssets?.length ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {pqcAssets.map((a) => <span key={a} className={networkDetailChipClass}>{a}</span>)}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* Certificate */}
                      {(selectedNetworkNode.data?.certificates as CertificateInfo[] | undefined)?.length ? (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Certificate</p>
                          <div className="mt-1 space-y-3">
                            {(selectedNetworkNode.data.certificates as CertificateInfo[]).map((cert, idx) => (
                              <div key={idx} className={`space-y-2 ${idx > 0 ? 'pt-3 border-t border-border/30' : ''}`}>
                                {cert.subjectName && (
                                  <div>
                                    <p className="text-xs text-muted-foreground/60">Subject</p>
                                    <p className="mt-0.5 font-mono text-xs break-all">{cert.subjectName}</p>
                                  </div>
                                )}
                                {cert.issuerName && (
                                  <div>
                                    <p className="text-xs text-muted-foreground/60">Issuer</p>
                                    <p className="mt-0.5 font-mono text-xs break-all">{cert.issuerName}</p>
                                  </div>
                                )}
                                {(cert.notValidBefore || cert.notValidAfter) && (
                                  <div className="flex gap-4">
                                    {cert.notValidBefore && (
                                      <div>
                                        <p className="text-xs text-muted-foreground/60">Valid from</p>
                                        <p className="mt-0.5 font-mono text-xs">{cert.notValidBefore}</p>
                                      </div>
                                    )}
                                    {cert.notValidAfter && (
                                      <div>
                                        <p className="text-xs text-muted-foreground/60">Valid to</p>
                                        <p className="mt-0.5 font-mono text-xs">{cert.notValidAfter}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {cert.subjectPublicKeyAlg && (
                                  <div>
                                    <p className="text-xs text-muted-foreground/60">Public key algorithm</p>
                                    <p className="mt-0.5 font-mono text-xs">{cert.subjectPublicKeyAlg}</p>
                                  </div>
                                )}
                                {cert.signatureAlg && (
                                  <div>
                                    <p className="text-xs text-muted-foreground/60">Signature algorithm</p>
                                    <p className="mt-0.5 font-mono text-xs">{cert.signatureAlg}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* TLS 1.3 passive capture */}
                      {(selectedNetworkNode.data?.authVisibility as string | undefined) === 'not-observed-passive' && (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Certificate</p>
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            Certificate &amp; CertificateVerify signature were encrypted (TLS 1.3 EncryptedExtensions) — not observable from a passive capture.
                          </p>
                        </div>
                      )}

                      {/* Offered Cipher Suites */}
                      {(selectedNetworkNode.data?.offeredCipherSuites as OfferedCipherSuiteObj[] | undefined)?.length ? (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Offered Cipher Suites</p>
                          {(() => {
                            const suiteObjs = selectedNetworkNode.data!.offeredCipherSuites as OfferedCipherSuiteObj[];
                            const counts = suiteObjs.reduce<Record<CipherStrength, number>>(
                              (acc, s) => { acc[getCipherStrength(s.name)]++; return acc; },
                              { recommended: 0, secure: 0, weak: 0, insecure: 0, unknown: 0 },
                            );
                            const order: CipherStrength[] = ['recommended', 'secure', 'weak', 'insecure', 'unknown'];
                            return (
                              <>
                                <div className="mt-1 flex items-center gap-2 mb-1.5">
                                  {order.filter((s) => counts[s] > 0).map((s) => (
                                    <span key={s} className="flex items-center gap-0.5">
                                      <span className="text-xs text-muted-foreground leading-none">{counts[s]}</span>
                                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold leading-none ${cipherStrengthBadge[s].compactClass}`}>{cipherStrengthBadge[s].short}</span>
                                    </span>
                                  ))}
                                </div>
                                <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
                                  {suiteObjs.map((suite) => {
                                    const isNegotiated = suite.name === (selectedNetworkNode.data?.negotiatedCipherSuite as string);
                                    const badge = cipherStrengthBadge[getCipherStrength(suite.name)];
                                    const isExpanded = expandedSuites.has(suite.name);
                                    const toggleExpanded = () => setExpandedSuites((prev) => { const next = new Set(prev); if (next.has(suite.name)) next.delete(suite.name); else next.add(suite.name); return next; });
                                    const byRole = new Map<AlgRole, NegotiatedAlg[]>();
                                    for (const alg of suite.algorithms) { const role = primitiveToRole(alg.primitive); if (!byRole.has(role)) byRole.set(role, []); byRole.get(role)!.push(alg); }
                                    return (
                                      <div key={suite.name} className={`rounded ${isNegotiated ? 'border-l-2 border-purple-500 bg-purple-500/20 dark:bg-purple-500/25' : 'bg-muted'}`}>
                                        <button onClick={suite.algorithms.length ? toggleExpanded : undefined} className={`flex w-full items-start gap-1.5 px-2 py-1 text-left${suite.algorithms.length ? ' cursor-pointer' : ''}`}>
                                          <span className={`${chip} font-medium ${badge.className}`}>{badge.label}</span>
                                          {isNegotiated && <span className={`${chip} border-purple-600 bg-purple-600 text-white font-medium`}>Negotiated</span>}
                                          <span className={`font-mono text-xs break-all flex-1 text-left${isNegotiated ? ' font-semibold text-purple-700 dark:text-purple-300' : ''}`}>
                                            {suite.name}
                                            {suite.identifiers?.length ? <span className="ml-1.5 text-[10px] text-muted-foreground/50 font-sans">{suite.identifiers.join(', ')}</span> : null}
                                          </span>
                                          {suite.algorithms.length > 0 && <span className="shrink-0 mt-px text-muted-foreground/50">{isExpanded ? '▴' : '▾'}</span>}
                                        </button>
                                        {isExpanded && suite.algorithms.length > 0 && (
                                          <div className="px-2 pb-1.5 space-y-1">
                                            {ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => (
                                              <div key={role}>
                                                <p className="text-xs text-muted-foreground/50 mb-1">{role}</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                  {byRole.get(role)!.map((alg) => (
                                                    <span key={alg.name} className={networkDetailChipClass}>{alg.name}</span>
                                                  ))}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : null}

                      {/* Supported Groups */}
                      {(selectedNetworkNode.data?.offeredGroups as string[] | undefined)?.length ? (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Supported Groups</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(selectedNetworkNode.data.offeredGroups as string[]).map((g: string) => {
                              const isUsed = g === (selectedNetworkNode.data?.negotiatedGroup as string);
                              return (
                                <span key={g} className={`${networkDetailChipClass}${isUsed ? ' border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400' : ''}`}>
                                  {g}{isUsed && <span className="ml-1 text-[9px] font-sans text-cyan-500/70">✓</span>}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Signature Algorithms */}
                      {(selectedNetworkNode.data?.offeredSignatureAlgorithms as string[] | undefined)?.length ? (
                        <div className="py-3 first:pt-0">
                          <p className="text-xs font-medium text-muted-foreground">Signature Algorithms</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(selectedNetworkNode.data.offeredSignatureAlgorithms as string[]).map((alg: string) => (
                              <span key={alg} className={networkDetailChipClass}>{alg}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                    </div>
                  </div>
                )}
              </div>
            )
          ) : assetViewMode === 'network-table' ? (
            networkGraphData.nodes.filter((n) => !n.data?.isAgent).length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                No network connections found in this CBOM.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {([
                        { label: 'Endpoint',             tip: 'IP address and port (ip:port) of the TLS server as observed in the traffic capture.' },
                        { label: 'Host (SNI)',            tip: 'Server Name Indication sent by the client in the ClientHello, identifying the intended hostname.' },
                        { label: 'TLS',                  tip: 'TLS protocol version negotiated for this connection.' },
                        { label: 'PQC',                  tip: 'Post-Quantum Cryptography status. "PQC Ln" means a NIST-level-n quantum-safe KEM was used; "Classical" means no PQC.' },
                        { label: 'Cipher Suite',         tip: 'Server-selected cipher suite (badge color = strength). Below: offered suite strength breakdown — count per category (R=Recommended, S=Secure, W=Weak, I=Insecure).' },
                        { label: 'In-use Algorithms',    tip: 'Cryptographic primitives decomposed from the negotiated cipher suite (e.g. AES-256-GCM, ECDHE, SHA-384).' },
                        { label: 'Supported Groups',     tip: 'Named groups advertised by the client in the supported_groups extension. The actually-used group is highlighted.' },
                        { label: 'Signature Algorithms', tip: 'Signature schemes listed by the client in the signature_algorithms extension.' },
                        { label: 'Auth / Certificate',   tip: 'Server certificate and authentication details observed during the handshake.' },
                      ] as { label: string; tip: string }[]).map(({ label, tip }) => (
                        <TableHead key={label} className="whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 cursor-default">
                                {label}
                                <Info className="size-3 shrink-0 text-muted-foreground/40" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[260px] text-center">
                              {tip}
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {networkGraphData.nodes
                      .filter((n) => !n.data?.isAgent)
                      .map((n) => {
                        const hostNames = n.data?.snis as string[] | undefined;
                        const tlsVersion = n.data?.tlsVersion as string | undefined;
                        const negotiatedCipherSuite = n.data?.negotiatedCipherSuite as string | undefined;
                        const negotiatedGroup = n.data?.negotiatedGroup as string | undefined;
                        const offeredGroups = n.data?.offeredGroups as string[] | undefined;
                        const offeredSignatureAlgorithms = n.data?.offeredSignatureAlgorithms as string[] | undefined;
                        const offeredCipherSuites = n.data?.offeredCipherSuites as OfferedCipherSuiteObj[] | undefined;
                        const pqcProtected = n.data?.pqcProtected as boolean | undefined;
                        const pqcLevel = n.data?.pqcLevel as number | undefined;
                        const negotiatedAlgorithms = n.data?.negotiatedAlgorithms as NegotiatedAlg[] | undefined;
                        const warning = n.data?.warning as string | undefined;
                        const endpoint = n.data?.endpoint as string | undefined;
                        const certificates = n.data?.certificates as CertificateInfo[] | undefined;
                        const cipherStrength = negotiatedCipherSuite ? getCipherStrength(negotiatedCipherSuite) : 'unknown';
                        const csBadge = cipherStrengthBadge[cipherStrength];

                        // Cipher suite strength distribution for offered suites
                        const offeredSuiteCounts = (offeredCipherSuites ?? []).reduce<Record<CipherStrength, number>>(
                          (acc, s) => { acc[getCipherStrength(s.name)]++; return acc; },
                          { recommended: 0, secure: 0, weak: 0, insecure: 0, unknown: 0 },
                        );

                        return (
                          <TableRow key={n.id}>
                            {/* Endpoint — ip:port from services[] */}
                            <TableCell className="font-mono text-xs whitespace-nowrap">
                              {endpoint || <span className="text-muted-foreground">—</span>}
                            </TableCell>

                            {/* Host (SNI) */}
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-0.5">
                                {((hostNames?.length ? hostNames : [n.label ?? n.id])).map((s) => (
                                  <span key={s} className="font-mono text-xs whitespace-nowrap">{s}</span>
                                ))}
                              </div>
                            </TableCell>

                            {/* TLS version — server selected */}
                            <TableCell>
                              {tlsVersion ? (
                                <span className={`${chip} border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-medium whitespace-nowrap`}>
                                  TLS {tlsVersion}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>

                            {/* PQC status */}
                            <TableCell>
                              {pqcProtected ? (
                                <span className={`${chip} border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 font-medium whitespace-nowrap`}>
                                  PQC{pqcLevel ? ` L${pqcLevel}` : ''}
                                </span>
                              ) : (
                                <span className={`${chip} border-border/70 bg-muted/40 text-muted-foreground`}>
                                  Classical
                                </span>
                              )}
                            </TableCell>

                            {/* Negotiated cipher suite + offered suites distribution */}
                            <TableCell className="min-w-[200px]">
                              {negotiatedCipherSuite ? (
                                <div className="flex flex-col items-start gap-1.5">
                                  <span className={`${chip} font-mono font-medium ${csBadge.className}`}>
                                    {negotiatedCipherSuite}
                                  </span>
                                  {offeredCipherSuites?.length ? (
                                    <div className="flex items-center gap-1.5">
                                      {(['recommended', 'secure', 'weak', 'insecure', 'unknown'] as CipherStrength[])
                                        .filter((s) => offeredSuiteCounts[s] > 0)
                                        .map((s) => (
                                          <span key={s} className="flex items-center gap-0.5">
                                            <span className="text-[10px] text-muted-foreground leading-none">{offeredSuiteCounts[s]}</span>
                                            <span className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${cipherStrengthBadge[s].compactClass}`}>{cipherStrengthBadge[s].short}</span>
                                          </span>
                                        ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>

                            {/* Decomposed in-use algorithms from cryptoRefArray */}
                            <TableCell className="min-w-[140px]">
                              <div className="flex flex-wrap gap-1">
                                {(negotiatedAlgorithms ?? []).map((alg) => (
                                  <span
                                    key={alg.name}
                                    title={alg.primitive}
                                    className={`${networkDetailChipClass} whitespace-nowrap`}
                                  >
                                    {alg.name}
                                  </span>
                                ))}
                              </div>
                            </TableCell>

                            {/* Supported groups — supported_groups extension, negotiated one highlighted */}
                            <TableCell className="min-w-[160px]">
                              <div className="flex flex-wrap gap-1">
                                {(offeredGroups ?? []).map((g) => {
                                  const isUsed = g === negotiatedGroup;
                                  return (
                                    <span
                                      key={g}
                                      className={`${chip} font-mono whitespace-nowrap ${isUsed ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400' : 'border-border/70 bg-muted/40 text-foreground'}`}
                                    >
                                      {g}{isUsed ? ' ✓' : ''}
                                    </span>
                                  );
                                })}
                                {!offeredGroups?.length && <span className="text-muted-foreground">—</span>}
                              </div>
                            </TableCell>

                            {/* Signature algorithms — signature_algorithms extension from ClientHello */}
                            <TableCell className="min-w-[160px]">
                              {offeredSignatureAlgorithms?.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {offeredSignatureAlgorithms.map((alg) => (
                                    <span key={alg} className={`${networkDetailChipClass} whitespace-nowrap`}>
                                      {alg}
                                    </span>
                                  ))}
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>

                            {/* Auth / Certificate — subject for TLS 1.2, note for TLS 1.3 */}
                            <TableCell className="max-w-[180px]">
                              {certificates?.length ? (
                                <div className="space-y-0.5">
                                  {certificates.map((cert, i) => (
                                    <p key={i} className="font-mono text-xs truncate" title={cert.subjectName}>
                                      {cert.subjectName || '—'}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {tlsVersion === '1.3' ? 'Encrypted (TLS 1.3)' : '—'}
                                </span>
                              )}
                            </TableCell>

                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
                </TooltipProvider>
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

              <div className="overflow-x-auto">
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
                                    <span className="text-muted-foreground text-xs">-</span>
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
                                                  {occ?.location || '-'}
                                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                                </span>
                                              </td>
                                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                                {occ?.line ?? '-'}
                                              </td>
                                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                                {occ?.offset ?? '-'}
                                              </td>
                                              <td className="px-3 py-1.5 text-muted-foreground">
                                                {occ?.additionalContext || '-'}
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
                                  <span className="text-muted-foreground text-xs">-</span>
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
            </div>
          )}
                </div>
              </div>
            </div>{/* end Assets */}
            </div>{/* end space-y-6 */}
          </TabsContent>

          <TabsContent value="raw" className="mt-0 py-6">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-md border">
                <Editor
                  height="65vh"
                  language="json"
                  value={rawCbomJson}
                  theme={monacoTheme}
                  options={{
                    readOnly: true,
                    domReadOnly: true,
                    automaticLayout: true,
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    folding: true,
                    fontSize: 13,
                    tabSize: 2,
                    renderValidationDecorations: 'off',
                    ariaLabel: 'Raw CBOM JSON',
                  }}
                />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      </div>{/* end Hero + Tabs wrapper */}

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
    </BreadcrumbPage>
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
