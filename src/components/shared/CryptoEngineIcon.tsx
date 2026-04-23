'use client';

import React from 'react';
import Image from 'next/image';
import { ShieldQuestion, Vault } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import AWSKMSLogo from './CryptoEngineIcons/AWS-KMS.png';
import AWSSMLogo from './CryptoEngineIcons/AWS-SM.png';
import PKCS11Logo from './CryptoEngineIcons/PKCS11.png';
import VaultLogo from './CryptoEngineIcons/HASHICORP-VAULT.png';

interface CryptoEngineIconProps {
  engine: Pick<ApiCryptoEngine, 'name' | 'type'>;
  className?: string;
}

function FileSystemEngineIcon({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center rounded-md border border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-900/80 dark:bg-sky-950/60 dark:text-sky-300', className)}>
      <Vault className="h-[58%] w-[58%]" />
    </div>
  );
}

function isFileSystemEngine(type: string | undefined) {
  const normalized = type?.toUpperCase() ?? '';
  return normalized === 'GOLANG' || normalized === 'GOLANG_CRYPTO' || normalized.includes('FILESYSTEM') || normalized.includes('FILE_SYSTEM');
}

function getLogoForEngine(type: string | undefined) {
  const normalized = type?.toUpperCase() ?? '';

  if (normalized === 'PKCS11') {
    return PKCS11Logo;
  }

  if (normalized === 'AWS_SECRETS_MANAGER') {
    return AWSSMLogo;
  }

  if (normalized === 'AWS_KMS') {
    return AWSKMSLogo;
  }

  if (normalized === 'HASHICORP_VAULT') {
    return VaultLogo;
  }

  return null;
}

export function CryptoEngineIcon({ engine, className }: CryptoEngineIconProps) {
  const imageSrc = getLogoForEngine(engine.type);

  if (imageSrc) {
    return (
      <div className={cn('relative h-full w-full overflow-hidden rounded-md', className)}>
        <Image alt={`${engine.name} icon`} className="object-contain p-1.5" fill src={imageSrc} />
      </div>
    );
  }

  if (isFileSystemEngine(engine.type)) {
    return <FileSystemEngineIcon className={className} />;
  }

  return (
    <div className={cn('flex h-full w-full items-center justify-center rounded-md border border-border bg-background', className)}>
      <ShieldQuestion className="h-[60%] w-[60%] text-muted-foreground" />
    </div>
  );
}
