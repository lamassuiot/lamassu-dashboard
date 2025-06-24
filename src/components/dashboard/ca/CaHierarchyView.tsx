
'use client';

import React, { useState } from 'react'; 
import type { CA } from '@/lib/ca-data';
import { Tree, TreeNode } from 'react-organizational-chart';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch'; 
import { Label } from '@/components/ui/label'; 
import { ZoomIn, ZoomOut, RotateCcw, Key } from 'lucide-react';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
// cn import is not strictly needed here anymore unless more complex styling is added
// import { cn } from '@/lib/utils'; 

interface CaHierarchyViewProps {
  cas: CA[];
  router: ReturnType<typeof import('next/navigation').useRouter>;
  allCAs: CA[];
  allCryptoEngines: ApiCryptoEngine[];
}

export const CaHierarchyView: React.FC<CaHierarchyViewProps> = ({ cas, router, allCAs, allCryptoEngines }) => {
  const [showKmsKeyIds, setShowKmsKeyIds] = useState(false); 

  if (cas.length === 0) {
    return (
      <p className="text-muted-foreground text-center p-4">No Certificate Authorities to display in hierarchy view.</p>
    );
  }

  const renderTreeNodes = (ca: CA, currentRouter: ReturnType<typeof import('next/navigation').useRouter>, currentAllCAs: CA[], currentAllCryptoEngines: ApiCryptoEngine[]): React.ReactNode => {
    const handleNodeClick = (selectedCa: CA) => {
      currentRouter.push(`/certificate-authorities/details?caId=${selectedCa.id}`); // Updated navigation
    };

    return (
      <TreeNode
        key={ca.id}
        label={
          <CaVisualizerCard
            ca={ca}
            onClick={handleNodeClick}
            className="mx-auto w-auto min-w-[330px] max-w-[380px]"
            allCryptoEngines={currentAllCryptoEngines} 
          />
        }
      >
        {ca.children && ca.children.map(child => renderTreeNodes(child, currentRouter, currentAllCAs, currentAllCryptoEngines))}
      </TreeNode>
    );
  };

  const handleRootNodeClick = (selectedCa: CA) => {
    router.push(`/certificate-authorities/details?caId=${selectedCa.id}`); // Updated navigation
  };

  return (
    <div className="w-full h-[calc(100vh-200px)] border rounded-md relative overflow-hidden flex flex-col">
      <div className="p-2 border-b bg-muted/30 flex items-center justify-between">
         <div className="flex items-center space-x-1">
        </div>
        <div className="flex items-center space-x-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="showKmsKeysToggle" className="text-sm font-medium text-muted-foreground">
            Show KMS Key IDs
          </Label>
          <Switch
            id="showKmsKeysToggle"
            checked={showKmsKeyIds}
            onCheckedChange={setShowKmsKeyIds}
            aria-label="Toggle KMS Key ID visibility"
          />
        </div>
      </div>
      <div className="flex-grow relative">
        <TransformWrapper
          initialScale={1}
          minScale={0.2}
          maxScale={3}
          centerOnInit
          limitToBounds={false}
        >
          {({ zoomIn, zoomOut, resetTransform, ...rest }) => (
            <>
              <div className="absolute top-2 left-2 z-10 space-x-1">
                <Button variant="outline" size="icon" onClick={() => zoomIn()} title="Zoom In">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => zoomOut()} title="Zoom Out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => resetTransform()} title="Reset View">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '60px 20px 20px 20px' }} 
              >
                <div className="flex flex-row items-start space-x-12">
                  {cas.map((rootCa) => (
                    <Tree
                      key={rootCa.id}
                      lineWidth={'2px'}
                      lineColor={'hsl(var(--border))'} 
                      lineBorderRadius={'5px'}
                      label={
                        <CaVisualizerCard
                          ca={rootCa}
                          onClick={handleRootNodeClick}
                          className="mx-auto w-auto min-w-[330px] max-w-[380px]"
                          allCryptoEngines={allCryptoEngines} 
                        />
                      }
                    >
                      {rootCa.children && rootCa.children.map(child => renderTreeNodes(child, router, allCAs, allCryptoEngines))}
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
};
