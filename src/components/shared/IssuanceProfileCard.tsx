
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Edit, Trash2, Eye, Users } from "lucide-react";
import type { ApiSigningProfile } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getValidityLabel(profile: ApiSigningProfile) {
  if (!profile.validity) return "—";
  switch (profile.validity.type) {
    case 'Duration': return profile.validity.duration || "—";
    case 'Date':
      if (profile.validity.time?.startsWith('9999-12-31')) return "No expiry";
      return profile.validity.time ? new Date(profile.validity.time).toLocaleDateString() : "—";
    case 'Indefinite': return "No expiry";
    default: return "—";
  }
}

function getExtensionRows(profile: ApiSigningProfile) {
  return {
    ku: {
      honors: profile.honor_key_usage,
      value: profile.honor_key_usage ? "Follows CSR" : profile.key_usage?.join(', ') || 'None',
    },
    eku: {
      honors: profile.honor_extended_key_usages,
      value: profile.honor_extended_key_usages
        ? "Follows CSR"
        : [...(profile.extended_key_usages || []), ...(profile.extra_extended_key_usage_oids || [])].join(', ') || 'None',
    },
  };
}

function getCryptoRules(profile: ApiSigningProfile) {
  if (!profile.crypto_enforcement?.enabled) return null;
  return {
    rsa: profile.crypto_enforcement.allow_rsa_keys ? (profile.crypto_enforcement.allowed_rsa_key_sizes ?? []) : null,
    ecdsa: profile.crypto_enforcement.allow_ecdsa_keys ? (profile.crypto_enforcement.allowed_ecdsa_key_sizes ?? []) : null,
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const HonorToken: React.FC<{ honors: boolean }> = ({ honors }) => (
  <span className={cn(
    "text-[9px] font-mono font-semibold uppercase tracking-wide rounded px-1 py-0.5 shrink-0",
    honors
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
  )}>
    {honors ? "CSR" : "FIXED"}
  </span>
);

const AlgoBadge: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Badge className="rounded-sm border border-primary/30 bg-primary/10 text-primary font-mono text-[9px] h-4 px-1">
    {children}
  </Badge>
);

const StatusBadge: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Badge className="rounded-sm border border-primary/30 bg-primary/10 text-primary text-[9px] font-semibold uppercase tracking-wide h-5 px-1.5">
    {children}
  </Badge>
);

const PropRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-center gap-2 py-1.5">
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-24 shrink-0">{label}</span>
    <div className={cn("text-xs text-foreground/80 min-w-0 truncate", mono && "font-mono")}>{value}</div>
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────────

interface IssuanceProfileCardProps {
  profile: ApiSigningProfile;
  className?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewUsage?: () => void;
}

export const IssuanceProfileCard: React.FC<IssuanceProfileCardProps> = ({
  profile, className, onEdit, onDelete, onViewUsage,
}) => {
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const validityLabel = getValidityLabel(profile);
  const certificateScope = profile.sign_as_ca ? 'CA certs' : 'End-entity';
  const subjectMode = profile.honor_subject ? 'Follows CSR' : 'Override';

  const { ku, eku } = getExtensionRows(profile);
  const cryptoRules = getCryptoRules(profile);

  return (
    <>
      <Card className={cn("overflow-hidden", className)}>

        {/* ── Header ── */}
        <CardHeader className="px-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm font-semibold tracking-tight leading-none text-primary">{profile.name}</CardTitle>
              {profile.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{profile.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {profile.sign_as_ca && <StatusBadge>CA</StatusBadge>}
            </div>
          </div>
        </CardHeader>

        {/* ── Property list ── */}
        <CardContent className="px-4 py-1 divide-y">
          <PropRow label="Validity" value={validityLabel} mono />
          <PropRow label="Scope" value={certificateScope} />
          <PropRow label="Subject" value={subjectMode} />
          <PropRow label="Key usage" value={<div className="flex items-center gap-1.5"><HonorToken honors={ku.honors} /><span>{ku.value}</span></div>} />
          <PropRow label="Ext. key usage" value={<div className="flex items-center gap-1.5"><HonorToken honors={eku.honors} /><span>{eku.value}</span></div>} />
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-24 shrink-0">Crypto</span>
            <div className="flex flex-1 items-center gap-1 min-w-0">
              {cryptoRules ? (
                <>
                  <div className="flex flex-wrap gap-1">
                    {cryptoRules.rsa !== null && (cryptoRules.rsa.length > 0 ? cryptoRules.rsa.map(s => <AlgoBadge key={`rsa-${s}`}>RSA-{s}</AlgoBadge>) : <AlgoBadge>RSA</AlgoBadge>)}
                    {cryptoRules.ecdsa !== null && (cryptoRules.ecdsa.length > 0 ? cryptoRules.ecdsa.map(s => <AlgoBadge key={`ec-${s}`}>EC {s}</AlgoBadge>) : <AlgoBadge>ECDSA</AlgoBadge>)}
                  </div>
                  <span className="ml-auto shrink-0"><StatusBadge><ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Enforced</StatusBadge></span>
                </>
              ) : (
                <span className="text-xs text-foreground/80">Not enforced</span>
              )}
            </div>
          </div>
        </CardContent>

        {/* ── Footer ── */}
        {onEdit && onDelete && (
          <CardFooter className="px-3 py-2 flex items-center justify-between border-t bg-muted/5">
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setIsDetailsModalOpen(true)}>
                <Eye className="mr-1 h-3 w-3" />
                Raw
              </Button>
              {onViewUsage && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onViewUsage}>
                  <Users className="mr-1 h-3 w-3" />
                  Usage
                </Button>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDelete}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={onEdit}>
                <Edit className="mr-1 h-3 w-3" />
                Edit
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      <Sheet open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <SheetContent side="right" className="!w-[33vw] sm:!max-w-none flex flex-col p-0">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Raw Profile Data</SheetTitle>
            <SheetDescription>{profile.name}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-6 py-4">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">{JSON.stringify(profile, null, 2)}</pre>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
};
