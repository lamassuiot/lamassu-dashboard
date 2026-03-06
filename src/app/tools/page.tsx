'use client';

import Link from 'next/link';
import { Binary, FlaskConical, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const TOOLS = [
  {
    href: '/tools/certificate-viewer',
    label: 'Certificate Viewer',
    description: 'Inspect and decode X.509 certificates, CSRs, and CRLs. View subject, issuer, validity, extensions, and cryptographic details.',
    icon: Binary,
    badge: 'PKI',
    badgeVariant: 'secondary' as const,
  },
  {
    href: '/tools/playground',
    label: 'OpenSSL Playground',
    description: 'Run OpenSSL commands interactively in your browser via WebAssembly — generate keys, create CSRs, issue self-signed certs, and more without leaving the page.',
    icon: FlaskConical,
    badge: 'WASM',
    badgeVariant: 'secondary' as const,
  },
];

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tools</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browser-based utilities for working with certificates and cryptographic material.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TOOLS.map(tool => {
          const Icon = tool.icon;
          return (
            <Link key={tool.href} href={tool.href} className="group block focus:outline-none">
              <Card className="h-full border-border/60 transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-md group-hover:shadow-primary/5 group-focus-visible:ring-2 group-focus-visible:ring-primary/50">
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-sm flex-shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight group-hover:text-primary transition-colors">
                        {tool.label}
                      </CardTitle>
                      <Badge variant={tool.badgeVariant} className="mt-1 text-[10px] h-4 px-1.5">
                        {tool.badge}
                      </Badge>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 mt-1 flex-shrink-0 transition-transform group-hover:translate-x-1 group-hover:text-primary/60" />
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {tool.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
