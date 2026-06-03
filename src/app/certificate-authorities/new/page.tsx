
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight } from "lucide-react";
import { cn } from '@/lib/utils';

interface CreationOption {
  id: string;
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
}

interface OptionGroup {
  id: string;
  label: string;
  eyebrow: string;
  groupIcon: React.ReactNode;
  options: CreationOption[];
}

const optionGroups: OptionGroup[] = [
  {
    id: 'create',
    label: 'Create',
    eyebrow: 'Generate a new CA',
    groupIcon: <KeyRound className="h-3.5 w-3.5 text-primary" />,
    options: [
      {
        id: 'generate',
        href: '/certificate-authorities/new/generate',
        title: 'New Key Pair',
        description: 'Provision a new Root or Intermediate CA. A key is generated and fully managed by the KMS.',
        icon: <KeyRound />,
        badge: 'Recommended',
      },
      {
        id: 'generate-existing-key',
        href: '/certificate-authorities/new/generate-existing-key',
        title: 'Reuse Existing Key',
        description: 'Provision a new Root or Intermediate CA using a key pair already stored in the KMS.',
        icon: <KeyRound />,
        badge: 'Existing KMS Key',
      },
    ],
  },
  {
    id: 'import',
    label: 'Import',
    eyebrow: 'Bring an existing CA',
    groupIcon: <UploadCloud className="h-3.5 w-3.5 text-primary" />,
    options: [
      {
        id: 'import-full',
        href: '/certificate-authorities/new/import-full',
        title: 'With Private Key',
        description: 'Import an existing CA certificate alongside its private key. The CA will be fully managed.',
        icon: <UploadCloud />,
        badge: 'Full Control',
      },
      {
        id: 'import-public',
        href: '/certificate-authorities/new/import-public',
        title: 'Certificate Only',
        description: 'Import a public CA certificate without a private key, for trust anchor or reference use.',
        icon: <FileText />,
        badge: 'Read Only',
      },
    ],
  },
];

export default function CreateCaHubPage() {
  const router = useRouter();
  const allOptions = optionGroups.flatMap(g => g.options);
  const [selectedId, setSelectedId] = useState<string>(allOptions[0].id);

  const selectedOption = allOptions.find(o => o.id === selectedId);

  return (
    <div className="w-full flex flex-col gap-8 mb-12">
      <Button
        variant="ghost"
       
        className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
        onClick={() => router.push('/certificate-authorities')}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Certification Authorities
      </Button>

      <div className="flex flex-col items-center gap-10 py-4">
        {/* Header */}
        <div className="text-center space-y-3 max-w-md">
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Certification Authority
          </p>
          <h1 className="text-3xl font-headline font-bold tracking-tight">
            Add Certification Authority
          </h1>
          <p className="text-sm text-muted-foreground">
            Select how you want to create or import your Certification Authority.
          </p>
        </div>

        {/* Option cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-7xl">
          {allOptions.map((option, i) => {
            const isSelected = selectedId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedId(option.id)}
                className={cn(
                  "group relative flex flex-col gap-6 rounded-xl border-2 p-8 text-left",
                  "transition-all duration-200 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSelected
                    ? "border-primary bg-primary/[0.03] shadow-md shadow-primary/10"
                    : "border-border bg-card hover:border-primary/35 hover:bg-muted/20 hover:shadow-sm"
                )}
              >
                {/* Number + check indicator */}
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "font-mono text-[11px] font-bold tracking-widest transition-colors",
                    isSelected ? "text-primary" : "text-muted-foreground/50"
                  )}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200",
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/25"
                  )}>
                    {isSelected && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none" className="shrink-0">
                        <path d="M1 3L3.5 5.5L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Icon */}
                <div className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200",
                  isSelected
                    ? "border-primary/20 bg-primary/10"
                    : "border-border bg-muted/50 group-hover:border-primary/20 group-hover:bg-primary/5"
                )}>
                  {React.isValidElement(option.icon) &&
                    React.cloneElement(option.icon as React.ReactElement<{ className?: string }>, {
                      className: cn(
                        "h-6 w-6 transition-colors duration-200",
                        isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
                      ),
                    })}
                </div>

                {/* Text */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "font-semibold text-sm leading-snug transition-colors",
                      isSelected ? "text-foreground" : "text-foreground/80"
                    )}>
                      {option.title}
                    </p>
                    {i === 0 && (
                      <Badge className="text-[10px] font-medium py-0 px-1.5 h-[18px] rounded-sm">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Continue */}
        <Button
          type="button"
         
          disabled={!selectedId}
          onClick={() => selectedOption && router.push(selectedOption.href)}
          className="min-w-[140px]"
        >
          Continue
          <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
