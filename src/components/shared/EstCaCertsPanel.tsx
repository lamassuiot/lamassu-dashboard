'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { fetchEstCaCerts } from '@/lib/est-api';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';

interface ApiRaItem {
  id: string;
  name: string;
}

interface EstCaCertsPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  ra: ApiRaItem | null;
  className?: string;
}

export const EstCaCertsPanel: React.FC<EstCaCertsPanelProps> = ({
  isOpen,
  onOpenChange,
  ra,
  className,
}) => {
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
        const pkcs7Base64 = btoa(new Uint8Array(pkcs7Buffer).reduce((data, byte) => data + String.fromCodePoint(byte), ''));
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
    return `curl ${get_EST_API_BASE_URL()}/${ra.id}/cacerts \\\n  -H "Accept: application/x-pem-file"`;
  }, [ra?.id]);

  const curlPkcs7 = useMemo(() => {
    if (!ra?.id) return '';
    return `curl ${get_EST_API_BASE_URL()}/${ra.id}/cacerts \\\n  -H "Accept: application/pkcs7-mime"`;
  }, [ra?.id]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn('p-0 flex flex-col', className)} style={{ width: '50vw', maxWidth: '50vw' }}>
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
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Obtain CA certs using cURL</p>
                      <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">{curlPem}</pre>
                    </div>
                    <CodeBlock content={pemCerts} />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="pkcs7" className="mt-4 h-[calc(100%-3rem)]">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Obtain CA certs using cURL</p>
                      <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">{curlPkcs7}</pre>
                    </div>
                    <CodeBlock content={pkcs7Certs} />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
