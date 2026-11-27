'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CodeSnippet, ShellCommand } from '@/components/shared/CodeSnippet';
import { cacertsCommand } from '@/lib/est-commands';
import { fetchEstCaCerts } from '@/lib/est-api';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, FileArchive, FileText, Loader2 } from 'lucide-react';
import { arrayBufferToBase64 } from '@/lib-crypto';
import { Badge } from '@/components/ui/badge';
import { BottomDockPanel } from '@/components/shared/BottomDockPanel';
import { InlineNote } from '@/components/shared/InlineNote';
import { RaIconFor, type RaIconSource } from '@/components/shared/RaIcon';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRunInTerminal } from '@/components/terminal/TerminalContext';
import { BlockSkeleton } from '@/components/shared/PageSkeletons';

interface ApiRaItem extends RaIconSource {
  id: string;
  name: string;
}

interface EstCaCertsPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  ra: ApiRaItem | null;
  /** `docked` opens a resizable panel at the bottom of the page (sheet on mobile). */
  presentation?: 'sheet' | 'docked';
  className?: string;
}

export const EstCaCertsPanel: React.FC<EstCaCertsPanelProps> = ({
  isOpen,
  onOpenChange,
  ra,
  presentation = 'sheet',
  className,
}) => {
  const isMobile = useIsMobile();
  const runInTerminal = useRunInTerminal();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkcs7Certs, setPkcs7Certs] = useState('');
  const [pemCerts, setPemCerts] = useState('');

  useEffect(() => {
    if (!isOpen || !ra?.id) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [pkcs7Result, pemResult] = await Promise.all([
          fetchEstCaCerts(ra.id, 'pkcs7-mime'),
          fetchEstCaCerts(ra.id, 'x-pem-file'),
        ]);

        const pkcs7Buffer = pkcs7Result.data as ArrayBuffer;
        const pkcs7Base64 = arrayBufferToBase64(pkcs7Buffer);
        setPkcs7Certs(pkcs7Base64);
        setPemCerts((pemResult.data as string) || '');
      } catch (e: any) {
        setError(e.message || 'Failed to load CA certs.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen, ra?.id]);

  const curlPem = useMemo(() => {
    if (!ra?.id) return '';
    return cacertsCommand(get_EST_API_BASE_URL(), ra.id, 'application/x-pem-file');
  }, [ra?.id]);

  const curlPkcs7 = useMemo(() => {
    if (!ra?.id) return '';
    return cacertsCommand(get_EST_API_BASE_URL(), ra.id, 'application/pkcs7-mime');
  }, [ra?.id]);

  if (presentation === 'docked' && (!isMobile || runInTerminal)) {
    return (
      <BottomDockPanel
        open={isOpen}
        onOpenChange={onOpenChange}
        storageKey="est-ca-certs"
        icon={<RaIconFor ra={ra} />}
        title="EST CA Certs"
        meta={ra && <Badge variant="secondary" className="font-normal">RA · {ra.name}</Badge>}
        description="Trusted CA certificates served by the RA's /cacerts endpoint"
        className={className}
      >
        {error ? (
          <div className="px-4 py-5 md:px-6"><InlineNote tone="error">{error}</InlineNote></div>
        ) : isLoading ? (
          <div className="px-4 py-5 md:px-6">
            <BlockSkeleton label="Loading CA certs…" className="h-48" />
          </div>
        ) : (
          <Tabs defaultValue="pem" className="flex h-full min-h-0 flex-col gap-0">
            <div className="shrink-0 border-b px-2 md:px-4">
              <TabsList className={pageTabsListClass}>
                <TabsTrigger value="pem" className={pageTabsTriggerClass}>
                  <FileText className="h-4 w-4" />PEM
                </TabsTrigger>
                <TabsTrigger value="pkcs7" className={pageTabsTriggerClass}>
                  <FileArchive className="h-4 w-4" />PKCS#7
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">base64</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="pem" className="min-h-0 overflow-y-auto px-4 py-5 md:px-6">
              <div className="space-y-3">
                <ShellCommand title="Fetch CA certificates" command={curlPem} />
                <CodeSnippet language="pem" title="CA certificates" content={pemCerts} downloadFilename="cacerts.pem" />
              </div>
            </TabsContent>
            <TabsContent value="pkcs7" className="min-h-0 overflow-y-auto px-4 py-5 md:px-6">
              <div className="space-y-3">
                <ShellCommand title="Fetch CA certificates" command={curlPkcs7} />
                <CodeSnippet language="base64" title="CA certificates" languageLabel="pkcs#7 · base64" content={pkcs7Certs} downloadFilename="cacerts.p7b.b64" />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </BottomDockPanel>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <ResizableSheetContent storageKey="est-ca-certs" side="right" className={cn('p-0 flex flex-col', className)} style={{ width: '50vw', maxWidth: '50vw' }}>
        <SheetHeader className="border-b px-6 py-5 text-left">
          <SheetTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5 text-primary" />
            EST CA Certs
          </SheetTitle>
          <SheetDescription>
            Retrieve trusted CA certificates for RA: {ra?.name} ({ra?.id})
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden px-6 py-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to Load CA Certs</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading CA certs...
            </div>
          ) : (
            <Tabs defaultValue="pem" className="h-full w-full">
              <TabsList>
                <TabsTrigger value="pem">PEM Format</TabsTrigger>
                <TabsTrigger value="pkcs7">RAW PKCS7</TabsTrigger>
              </TabsList>

              <TabsContent value="pem" className="mt-4 h-[calc(100%-3rem)]">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-3">
                    <ShellCommand title="Fetch CA certificates" command={curlPem} />
                    <CodeSnippet language="pem" title="CA certificates" content={pemCerts} downloadFilename="cacerts.pem" />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="pkcs7" className="mt-4 h-[calc(100%-3rem)]">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-3">
                    <ShellCommand title="Fetch CA certificates" command={curlPkcs7} />
                    <CodeSnippet language="base64" title="CA certificates" languageLabel="pkcs#7 · base64" content={pkcs7Certs} downloadFilename="cacerts.p7b.b64" />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </ResizableSheetContent>
    </Sheet>
  );
};
