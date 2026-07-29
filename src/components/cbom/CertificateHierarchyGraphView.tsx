'use client';

import React from 'react';
import { Tree, TreeNode } from 'react-organizational-chart';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCertificateHierarchyStatusLabel,
  getCertificateHierarchyStatusBadgeStyle,
  type CertificateHierarchyAsset,
  type CertificateHierarchyRow,
} from '@/lib/cbom-certificate-hierarchy';

interface CertificateHierarchyGraphViewProps<T extends CertificateHierarchyAsset> {
  rows: CertificateHierarchyRow<T>[];
  childrenByParent: Map<string, string[]>;
  onSelectAsset: (asset: T) => void;
}

function CertificateHierarchyCard<T extends CertificateHierarchyAsset>({
  row,
  onSelect,
}: {
  row: CertificateHierarchyRow<T>;
  onSelect: (asset: T) => void;
}) {
  const asset = row.node.representative;
  const displayName = asset.name || row.node.subjectName || 'Unnamed certificate';
  const badgeStyle = getCertificateHierarchyStatusBadgeStyle(row.status);

  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      className="w-[260px] rounded-md border-2 border-primary bg-background px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/40"
    >
      <p className="truncate text-xs font-medium text-foreground" title={displayName}>
        {displayName}
      </p>
      {row.node.issuerName && row.node.issuerName !== displayName && (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={row.node.issuerName}>
          Issuer: {row.node.issuerName}
        </p>
      )}
      <Badge
        variant={badgeStyle.variant}
        className={cn('mt-1.5 rounded-md text-[10px] font-normal', badgeStyle.className)}
      >
        {getCertificateHierarchyStatusLabel(row.status, row.node.parentIds.length)}
      </Badge>
    </button>
  );
}

export function CertificateHierarchyGraphView<T extends CertificateHierarchyAsset>({
  rows,
  childrenByParent,
  onSelectAsset,
}: CertificateHierarchyGraphViewProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        No certificate hierarchy entries match the selected filters.
      </p>
    );
  }

  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const rootRows = rows.filter((row) => !row.parentRowKey);

  const renderChildren = (parentKey: string): React.ReactNode[] =>
    (childrenByParent.get(parentKey) ?? [])
      .map((childKey) => rowsByKey.get(childKey))
      .filter((childRow): childRow is CertificateHierarchyRow<T> => Boolean(childRow))
      .map((childRow) => (
        <TreeNode key={childRow.key} label={<CertificateHierarchyCard row={childRow} onSelect={onSelectAsset} />}>
          {renderChildren(childRow.key)}
        </TreeNode>
      ));

  return (
    <div className="relative flex h-[calc(100vh-260px)] w-full flex-col overflow-hidden rounded-md border">
      {/* Fix for react-organizational-chart pseudo-element lines with Tailwind v4 reset */}
      <style>{`
        .cbom-cert-hierarchy-tree ul::before,
        .cbom-cert-hierarchy-tree li::before,
        .cbom-cert-hierarchy-tree li::after {
          content: '' !important;
          position: absolute !important;
        }
      `}</style>
      <div className="relative flex-grow">
        <TransformWrapper initialScale={1} minScale={0.2} maxScale={3} centerOnInit limitToBounds={false}>
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <div className="absolute left-2 top-2 z-10 space-x-1">
                <Button variant="secondary" size="icon" onClick={() => zoomIn()} title="Zoom In">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="secondary" size="icon" onClick={() => zoomOut()} title="Zoom Out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="secondary" size="icon" onClick={() => resetTransform()} title="Reset View">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '60px 20px 20px 20px',
                }}
              >
                <div className="cbom-cert-hierarchy-tree flex flex-row items-start gap-20 px-10">
                  {rootRows.map((rootRow) => (
                    <Tree
                      key={rootRow.key}
                      lineWidth="3px"
                      lineColor="var(--color-primary)"
                      lineBorderRadius="5px"
                      label={<CertificateHierarchyCard row={rootRow} onSelect={onSelectAsset} />}
                    >
                      {renderChildren(rootRow.key)}
                    </Tree>
                  ))}
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}
