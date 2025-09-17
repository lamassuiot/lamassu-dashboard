

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight, FileSignature } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CreationMode {
  id: string;
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const creationModes: CreationMode[] = [
  {
    id: 'generate',
    href: '/certificate-authorities/new/generate',
    title: 'Create New CA (New Key Pair)',
    description: 'Provision a new Root or Intermediate Certification Authority directly. A new key is generated and managed by the KMS.',
    icon: <KeyRound className="h-8 w-8 text-primary" />,
  },
  {
    id: 'generate-csr',
    href: '/certificate-authorities/new/generate-csr',
    title: 'Request New CA (CSR)',
    description: 'Request a new CA by generating a server-side key and a CSR. Requires external approval and certificate import.',
    icon: <FileSignature className="h-8 w-8 text-primary" />,
  },
  {
    id: 'import-full',
    href: '/certificate-authorities/new/import-full',
    title: 'Import CA (with Private Key)',
    description: 'Import an existing Certification Authority certificate along with its private key. This CA will be fully managed.',
    icon: <UploadCloud className="h-8 w-8 text-primary" />,
  },
  {
    id: 'import-public',
    href: '/certificate-authorities/new/import-public',
    title: 'Import Public CA (Certificate Only)',
    description: "Import a public CA certificate (no private key) for trust anchor or reference purposes.",
    icon: <FileText className="h-8 w-8 text-primary" />,
  },
];


export default function CreateCaHubPage() {
  const router = useRouter();

  return (
    <div className="w-full space-y-8 mb-8">
      <Button variant="outline" onClick={() => router.push('/certificate-authorities')} className="mb-0">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certification Authorities
      </Button>
      <div className="text-center">
        <h1 className="text-3xl font-headline font-semibold">Choose Certification Authority Creation Method</h1>
        <p className="text-muted-foreground mt-2">Select how you want to create or import your Certification Authority.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {creationModes.map(mode => (
          <Card
            key={mode.id}
            role="button"
            tabIndex={0}
            className={cn("hover:shadow-lg transition-shadow flex flex-col group h-full cursor-pointer")}
            onClick={() => router.push(mode.href)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                router.push(mode.href);
              }
            }}
          >
            <CardHeader className="flex-grow">
              <div className="flex items-start space-x-4">
                <div className="mt-1">{mode.icon}</div>
                <div>
                  <CardTitle className={cn("text-xl", "group-hover:text-primary transition-colors")}>{mode.title}</CardTitle>
                  <CardDescription className="mt-1 text-sm">{mode.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardFooter>
              <Button variant="default" className="w-full" tabIndex={-1}>
                  Select & Continue <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
