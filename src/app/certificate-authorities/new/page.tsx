'use client';

import React from 'react';
import { useRouter } from '@/lib/router';
import { FileBadge, FileKey, KeyRound, KeySquare } from "lucide-react";
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { MethodChooser, type MethodOption, type MethodOptionGroup } from '@/components/shared/MethodChooser';

type CreationOptionGroup = MethodOptionGroup & { options: (MethodOption & { href: string })[] };

const optionGroups: CreationOptionGroup[] = [
  {
    id: 'create',
    label: 'Create',
    description: 'Provision a new Root or Intermediate CA whose key is managed by the KMS.',
    options: [
      {
        id: 'generate',
        href: '/certificate-authorities/new/generate',
        title: 'New Key Pair',
        description: 'A new key pair is generated and fully managed by the KMS.',
        icon: KeyRound,
        badge: { label: 'Recommended', variant: 'default' },
      },
      {
        id: 'generate-existing-key',
        href: '/certificate-authorities/new/generate-existing-key',
        title: 'Reuse Existing Key',
        description: 'Use a key pair that is already stored in the KMS.',
        icon: KeySquare,
        badge: { label: 'Existing KMS Key', variant: 'secondary' },
      },
    ],
  },
  {
    id: 'import',
    label: 'Import',
    description: 'Bring a CA that was issued outside of Lamassu.',
    options: [
      {
        id: 'import-full',
        href: '/certificate-authorities/new/import-full',
        title: 'With Private Key',
        description: 'Import the CA certificate alongside its private key. The CA will be fully managed.',
        icon: FileKey,
        badge: { label: 'Full Control', variant: 'secondary' },
      },
      {
        id: 'import-public',
        href: '/certificate-authorities/new/import-public',
        title: 'Certificate Only',
        description: 'Import a public CA certificate without its private key, for trust anchor or reference use.',
        icon: FileBadge,
        badge: { label: 'Read Only', variant: 'secondary' },
      },
    ],
  },
];

const allOptions = optionGroups.flatMap(g => g.options);

export default function CreateCaHubPage() {
  const router = useRouter();

  return (
    <BreadcrumbPage className="space-y-5 pb-8" items={[ {label:'Home',href:'/'}, {label:'Certificate Authorities',href:'/certificate-authorities'}, {label:'New'} ]}>
      <MethodChooser
        title="Add Certification Authority"
        description="Choose how you want to create or import your Certification Authority."
        groups={optionGroups}
        onSelect={(id) => {
          const option = allOptions.find(o => o.id === id);
          if (option) router.push(option.href);
        }}
        back={{ label: 'Back to Certification Authorities', onClick: () => router.push('/certificate-authorities') }}
      />
    </BreadcrumbPage>
  );
}
