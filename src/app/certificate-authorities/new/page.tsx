

'use client';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight } from "lucide-react";
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CreationMode {
  id: string;
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
}

const creationModes: CreationMode[] = [
  {
    id: 'generate',
    href: '/certificate-authorities/new/generate',
    title: 'Create New CA',
    description: 'Provision a new Root or Intermediate Certification Authority directly. A new key is generated and managed by the KMS.',
    icon: <KeyRound className="h-8 w-8 text-primary" />,
    badge: 'New Key Pair',
  },
  {
    id: 'generate-existing-key',
    href: '/certificate-authorities/new/generate-existing-key',
    title: 'Create New CA',
    description: 'Provision a new Root or Intermediate CA using an existing KMS key. Reuse a previously generated key pair.',
    icon: <KeyRound className="h-8 w-8 text-primary" />,
    badge: 'Reuse Existing Key',
  },
  {
    id: 'import-full',
    href: '/certificate-authorities/new/import-full',
    title: 'Import CA',
    description: 'Import an existing Certification Authority certificate along with its private key. This CA will be fully managed.',
    icon: <UploadCloud className="h-8 w-8 text-primary" />,
    badge: 'With Private Key',
  },
  {
    id: 'import-public',
    href: '/certificate-authorities/new/import-public',
    title: 'Import Public CA',
    description: "Import a public CA certificate (no private key) for trust anchor or reference purposes.",
    icon: <FileText className="h-8 w-8 text-primary" />,
    badge: 'Certificate Only',
  },
];


export default function CreateCaHubPage() {
  const navigate = useNavigate();

  return (
    <div className="w-full space-y-8 mb-8">
      <Button variant="outline" onClick={() => navigate('/certificate-authorities')} className="mb-0">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Certification Authorities
      </Button>
      <div className="text-center">
        <h1 className="text-3xl font-headline font-semibold">Choose Certification Authority Creation Method</h1>
        <p className="text-muted-foreground mt-2">Select how you want to create or import your Certification Authority.</p>
      </div>
      <Card className="mx-auto max-w-4xl overflow-hidden rounded-xl shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y">
            {creationModes.map((mode) => {
              const icon = React.isValidElement(mode.icon)
                ? React.cloneElement(mode.icon as React.ReactElement<{ className?: string }>, {
                    className: "h-5 w-5 text-primary",
                  })
                : mode.icon;

              return (
                <button
                  key={mode.id}
                  type="button"
                  className="flex w-full cursor-pointer items-start gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/30"
                  onClick={() => navigate(mode.href)}
                >
                  <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/5">
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-base font-semibold text-foreground")}>
                        {mode.title}
                      </span>
                      <Badge variant="secondary">{mode.badge}</Badge>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {mode.description}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-shrink-0 items-center">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
