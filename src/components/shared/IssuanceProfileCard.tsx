
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Fingerprint, BookText, KeyRound, ShieldCheck, Scale, Edit, Trash2, Eye, Users } from "lucide-react";
import type { ApiSigningProfile } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { MetadataViewerModal } from './MetadataViewerModal';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { SectionHeader } from '@/components/shared/FormComponents';

const SummaryItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <p className="text-sm font-medium text-foreground/60">{label}</p>
    <p className="text-sm text-foreground">{value}</p>
  </div>
);

function getValidityLabel(profile: ApiSigningProfile) {
  if (!profile.validity) return "Not specified";

  switch (profile.validity.type) {
    case 'Duration':
      return profile.validity.duration || "Not specified";
    case 'Date':
      if (profile.validity.time?.startsWith('9999-12-31')) {
        return "Never expires";
      }
      return profile.validity.time ? new Date(profile.validity.time).toLocaleDateString() : "Not specified";
    case 'Indefinite':
      return "Never expires";
    default:
      return "Not specified";
  }
}

function getSubjectPolicy(profile: ApiSigningProfile) {
  if (profile.honor_subject) {
    return "Uses the subject DN requested in the CSR.";
  }

  const overrides = Object.entries(profile.subject || {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key.substring(0, 2).toUpperCase()}=${value}`)
    .join(', ');

  return overrides
    ? `Overrides the CSR subject with ${overrides}.`
    : "Overrides the CSR subject, but no fixed attributes are defined.";
}

function getExtensionPolicy(profile: ApiSigningProfile) {
  const keyUsagePolicy = profile.honor_key_usage
    ? "Key usage follows the CSR."
    : `Key usage enforced: ${profile.key_usage?.join(', ') || 'None'}.`;

  const extendedKeyUsagePolicy = profile.honor_extended_key_usages
    ? "Extended key usage follows the CSR."
    : `Extended key usage enforced: ${profile.extended_key_usages?.join(', ') || 'None'}.`;

  return `${keyUsagePolicy} ${extendedKeyUsagePolicy}`;
}

function getCryptoEnforcementSummary(profile: ApiSigningProfile) {
  if (!profile.crypto_enforcement?.enabled) {
    return "Crypto enforcement is disabled for this profile.";
  }

  const rules: string[] = [];

  if (profile.crypto_enforcement.allow_rsa_keys) {
    const rsaSizes = profile.crypto_enforcement.allowed_rsa_key_sizes?.length
      ? ` (${profile.crypto_enforcement.allowed_rsa_key_sizes.join(', ')} bits)`
      : '';
    rules.push(`RSA${rsaSizes}`);
  }

  if (profile.crypto_enforcement.allow_ecdsa_keys) {
    const ecdsaSizes = profile.crypto_enforcement.allowed_ecdsa_key_sizes?.length
      ? ` (${profile.crypto_enforcement.allowed_ecdsa_key_sizes.join(', ')})`
      : '';
    rules.push(`ECDSA${ecdsaSizes}`);
  }

  return rules.length > 0
    ? `Allowed algorithms: ${rules.join(' and ')}.`
    : "Crypto enforcement is enabled, but no key algorithms are currently allowed.";
}

interface IssuanceProfileCardProps {
  profile: ApiSigningProfile;
  className?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewUsage?: () => void;
}

export const IssuanceProfileCard: React.FC<IssuanceProfileCardProps> = ({ profile, className, onEdit, onDelete, onViewUsage }) => {
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const allowedKeyTypes: string[] = [];
  if (profile.crypto_enforcement?.allow_rsa_keys) allowedKeyTypes.push('RSA');
  if (profile.crypto_enforcement?.allow_ecdsa_keys) allowedKeyTypes.push('ECDSA');
  const validityLabel = getValidityLabel(profile);
  const subjectPolicy = getSubjectPolicy(profile);
  const extensionsPolicy = getExtensionPolicy(profile);
  const cryptoSummary = getCryptoEnforcementSummary(profile);
  const certificateScope = profile.sign_as_ca ? 'CA certificates' : 'End-entity certificates';
  const subjectMode = profile.honor_subject ? 'CSR subject' : 'Profile subject override';
  const keyTypeValue = allowedKeyTypes.length > 0 ? allowedKeyTypes.join(', ') : 'None';

  return (
    <>
      <Card
        className={cn(
          "flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors",
          className
        )}
      >
        <SectionHeader
          icon={Scale}
          title={profile.name}
          description={profile.description || "No description provided for this profile."}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {profile.sign_as_ca && (
                <Badge variant="outline" className="rounded-md text-foreground/75">
                  CA
                </Badge>
              )}
              {profile.crypto_enforcement?.enabled && (
                <Badge variant="outline" className="rounded-md text-foreground/75">
                  Crypto enforcement
                </Badge>
              )}
            </div>
          }
        />

        <CardContent className="flex flex-1 flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SummaryItem label="Validity" value={validityLabel} />
            <SummaryItem label="Signs" value={certificateScope} />
            <SummaryItem label="Subject source" value={subjectMode} />
            <SummaryItem label="Allowed key types" value={keyTypeValue} />
          </div>

          <DetailInfoRows>
            <DetailInfoRow
              icon={Fingerprint}
              label="Subject policy"
              value={subjectPolicy}
              valueClassName="font-normal leading-6 text-foreground/70"
              className="first:pt-0"
            />
            <DetailInfoRow
              icon={BookText}
              label="Extensions policy"
              value={extensionsPolicy}
              valueClassName="font-normal leading-6 text-foreground/70"
            />
            <DetailInfoRow
              icon={KeyRound}
              label="Crypto rules"
              className="last:pb-0"
              valueClassName="font-normal"
              value={
                <div className="space-y-2">
                  <p className="text-sm leading-6 text-foreground/70">{cryptoSummary}</p>
                  <div className="flex flex-wrap gap-2">
                    {allowedKeyTypes.length > 0 ? (
                      allowedKeyTypes.map((keyType) => (
                        <Badge key={keyType} variant="outline" className="rounded-md text-foreground/75">
                          {keyType}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="rounded-md text-foreground/75">
                        No key types allowed
                      </Badge>
                    )}
                    <Badge variant="outline" className="rounded-md text-foreground/75">
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                      {profile.sign_as_ca ? 'Can issue CA certificates' : 'Leaf certificates only'}
                    </Badge>
                    <Badge variant="outline" className="rounded-md text-foreground/75">
                      <Clock className="mr-1.5 h-3.5 w-3.5" />
                      {validityLabel}
                    </Badge>
                  </div>
                </div>
              }
            />
          </DetailInfoRows>
        </CardContent>

        {onEdit && onDelete && (
          <CardFooter className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/10 px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsDetailsModalOpen(true)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> View Raw
              </Button>
              {onViewUsage && (
                <Button variant="outline" size="sm" onClick={onViewUsage}>
                  <Users className="mr-1.5 h-3.5 w-3.5" /> View Usage
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
              >
                <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
      <MetadataViewerModal
        isOpen={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        title={`Raw Profile Data: ${profile.name}`}
        data={profile}
        isEditable={false}
      />
    </>
  );
};
