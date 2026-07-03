
'use client';

import React from 'react';
import { ShieldQuestion, FolderKey } from 'lucide-react';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import AWSKMSLogo from "./CryptoEngineIcons/AWS-KMS.png"
import AWSSMLogo from "./CryptoEngineIcons/AWS-SM.png"
import PKCS11Logo from "./CryptoEngineIcons/PKCS11.png"
import VaultLogo from "./CryptoEngineIcons/HASHICORP-VAULT.png"
import AzureKeyVaultLogo from "./CryptoEngineIcons/AZURE-KEYVAULT.png"

interface CryptoEngineViewerProps {
  engine: ApiCryptoEngine;
  className?: string;
  iconOnly?: boolean;
  plainIcon?: boolean;
}

// Per-engine icon container styling
const ENGINE_STYLES: Record<string, { border: string; bg: string }> = {
  GOLANG:              { border: 'border-gray-400/40 dark:border-gray-600/40',     bg: 'bg-gray-800' },
  PKCS11:              { border: 'border-blue-200/60 dark:border-blue-800/40',     bg: 'bg-white dark:bg-gray-950' },
  AWS_SECRETS_MANAGER: { border: 'border-orange-200/60 dark:border-orange-800/40', bg: 'bg-white dark:bg-gray-950' },
  AWS_KMS:             { border: 'border-orange-200/60 dark:border-orange-800/40', bg: 'bg-white dark:bg-gray-950' },
  HASHICORP_VAULT:     { border: 'border-amber-200/60 dark:border-amber-800/40',   bg: 'bg-white dark:bg-gray-950' },
  AZURE_KEY_VAULT:      { border: 'border-blue-200/60 dark:border-blue-800/40',     bg: 'bg-white dark:bg-gray-950' },
  AZURE_KEY_VAULT_SECRETS: { border: 'border-blue-200/60 dark:border-blue-800/40', bg: 'bg-white dark:bg-gray-950' },
};

export function getEngineIconStyle(type: string): { border: string; bg: string } {
  return ENGINE_STYLES[type?.toUpperCase()] ?? { border: 'border-border/60', bg: 'bg-muted/30' };
}

const SECURITY_LEVEL: Record<number, { label: string; cls: string }> = {
  1: { label: 'FIPS L1', cls: 'text-sky-600 dark:text-sky-400' },
  2: { label: 'FIPS L2', cls: 'text-emerald-600 dark:text-emerald-400' },
  3: { label: 'FIPS L3', cls: 'text-violet-600 dark:text-violet-400' },
  4: { label: 'FIPS L4', cls: 'text-rose-600 dark:text-rose-400' },
};

export const CryptoEngineViewer: React.FC<CryptoEngineViewerProps> = ({
  engine,
  className,
  iconOnly = false,
  plainIcon = false,
}) => {
  const typeKey = engine.type?.toUpperCase() ?? '';
  const style = ENGINE_STYLES[typeKey];
  const containerBorder = style?.border ?? 'border-border/50';
  const containerBg    = style?.bg    ?? 'bg-muted/20';

  let IconComponent: React.ElementType | null = null;
  let iconColorClass = 'text-muted-foreground';
  let imageSrc: any  = null;

  switch (typeKey) {
    case 'GOLANG':
      IconComponent  = FolderKey;
      iconColorClass = 'text-white';
      break;
    case 'PKCS11':              imageSrc = PKCS11Logo;  break;
    case 'AWS_SECRETS_MANAGER': imageSrc = AWSSMLogo;   break;
    case 'AWS_KMS':             imageSrc = AWSKMSLogo;  break;
    case 'HASHICORP_VAULT':     imageSrc = VaultLogo;   break;
    case 'AZURE_KEY_VAULT':      imageSrc = AzureKeyVaultLogo; break;
    case 'AZURE_KEY_VAULT_SECRETS': imageSrc = AzureKeyVaultLogo; break;
    default:
      IconComponent = ShieldQuestion;
      break;
  }

  const iconNode: React.ReactNode = imageSrc ? (
    <Image
      src={imageSrc}
      alt={`${engine.name} logo`}
      className="h-full w-full object-contain"
      layout="fill"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      {IconComponent
        ? <IconComponent className={cn('h-[70%] w-[70%]', iconColorClass)} />
        : <ShieldQuestion className="h-[70%] w-[70%] text-muted-foreground" />
      }
    </div>
  );

  // ── Icon-only ────────────────────────────────────────────────────────────────
  if (iconOnly) {
    return (
      <div className={cn('relative h-4 w-4 shrink-0 rounded overflow-hidden', containerBg, className)}>
        {iconNode}
      </div>
    );
  }

  const secLevel = SECURITY_LEVEL[engine.security_level];
  const provider = engine.provider || engine.type?.replace(/_/g, ' ');

  // ── Full view ────────────────────────────────────────────────────────────────
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn(
        'relative shrink-0 overflow-hidden rounded-md border',
        plainIcon ? 'h-7 w-7' : 'h-8 w-8',
        containerBorder,
        containerBg,
      )}>
        {iconNode}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        {/* Name + default */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold leading-none" title={engine.name}>
            {engine.name}
          </span>
          {engine.default && (
            <span className="shrink-0 inline-flex h-[18px] items-center rounded-sm bg-primary/10 px-1.5 text-[9px] font-bold leading-none text-primary">
              DEFAULT
            </span>
          )}
        </div>

        {/* Metadata chips */}
        {(provider || secLevel) && (
          <div className="flex flex-wrap items-center gap-1">
            {provider && (
              <span className="inline-flex h-5 items-center rounded-sm bg-muted/70 px-1.5 text-[10px] text-muted-foreground" title={provider}>
                {provider}
              </span>
            )}
            {secLevel && (
              <span className={cn('inline-flex h-5 items-center rounded-sm bg-muted/70 px-1.5 text-[10px] font-semibold', secLevel.cls)}>
                {secLevel.label}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
