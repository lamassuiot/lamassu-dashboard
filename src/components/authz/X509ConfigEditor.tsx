'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronsUpDown } from 'lucide-react';
import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import type { CA } from '@/lib/ca-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import type { X509AuthConfig, X509CaTrustIdentityType } from '@/types/authz';
import { FormFieldError } from '@/components/shared/FormValidationSummary';

interface X509ConfigEditorProps {
  isNew: boolean;
  selectedCa: CA | null;
  caTrustValue: string;
  caTrustIdentityType: X509CaTrustIdentityType;
  setCaTrustIdentityType: (value: X509CaTrustIdentityType) => void;
  matchMode: X509AuthConfig['match_mode'];
  setMatchMode: (value: X509AuthConfig['match_mode']) => void;
  serialNumber: string;
  setSerialNumber: (value: string) => void;
  subjectCn: string;
  setSubjectCn: (value: string) => void;
  allCryptoEngines: ApiCryptoEngine[];
  onOpenCaSelector: () => void;
  disabled?: boolean;
}

export function X509ConfigEditor({
  isNew,
  selectedCa,
  caTrustValue,
  caTrustIdentityType,
  setCaTrustIdentityType,
  matchMode,
  setMatchMode,
  serialNumber,
  setSerialNumber,
  subjectCn,
  setSubjectCn,
  allCryptoEngines,
  onOpenCaSelector,
  disabled,
}: X509ConfigEditorProps) {
  const caButtonLabel = selectedCa
    ? selectedCa.name
    : isNew
    ? 'Select a Certification Authority...'
    : caTrustValue
    ? 'CA configured'
    : 'Select a Certification Authority...';
  const caMissing = !selectedCa && !caTrustValue.trim();
  const serialNumberMissing = matchMode === 'serial_and_ca' && !serialNumber.trim();
  const subjectCnMissing = (matchMode === 'cn_and_ca' || matchMode === 'subject_cn') && !subjectCn.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">
          Certification Authority <span className="text-destructive">*</span>
        </Label>
        <button
          type="button"
          onClick={onOpenCaSelector}
          disabled={disabled}
          aria-invalid={caMissing}
          aria-describedby={caMissing ? 'principal-x509-ca-error' : undefined}
          className="flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-input/50 px-3 text-sm whitespace-nowrap transition-[color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
        >
          <span className={selectedCa ? 'text-foreground' : 'text-muted-foreground'}>
            {caButtonLabel}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        {caMissing && <FormFieldError id="principal-x509-ca-error" title="Certification Authority required." description="Select one before saving." />}

        {selectedCa ? (
          <CaVisualizerCard ca={selectedCa} allCryptoEngines={allCryptoEngines} className="shadow-none border-border" />
        ) : isNew ? (
          <p className="text-xs text-muted-foreground">
            {caTrustIdentityType === 'fingerprint'
              ? 'SHA-256 fingerprint will be derived automatically'
              : 'Authority Key Identifier (AKI) will be resolved automatically'}
          </p>
        ) : caTrustValue ? (
          <p className="truncate font-mono text-xs text-muted-foreground">{caTrustValue}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="caTrustIdentityType" className="text-sm">
            CA Identity Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={caTrustIdentityType}
            onValueChange={(value: X509CaTrustIdentityType) => setCaTrustIdentityType(value)}
            disabled={disabled}
          >
            <SelectTrigger id="caTrustIdentityType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fingerprint">Fingerprint (SHA-256)</SelectItem>
              <SelectItem value="authority_key_id">Authority Key Identifier (AKI)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">How the trusted CA is identified for certificate matching.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="matchMode" className="text-sm">Match Mode</Label>
          <Select
            value={matchMode}
            onValueChange={(value: X509AuthConfig['match_mode']) => setMatchMode(value)}
            disabled={disabled}
          >
            <SelectTrigger id="matchMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any_from_ca">Any from CA</SelectItem>
              <SelectItem value="serial_and_ca">Serial Number + CA</SelectItem>
              <SelectItem value="cn_and_ca">Common Name (CN) + CA</SelectItem>
              <SelectItem value="subject_cn">Subject Common Name</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {matchMode === 'any_from_ca' && 'Trust any certificate issued by the specified CA.'}
            {matchMode === 'serial_and_ca' && 'Match a specific certificate by serial number and issuing CA.'}
            {matchMode === 'cn_and_ca' && 'Match certificates by Common Name pattern. Wildcards such as *.example.com are supported.'}
            {matchMode === 'subject_cn' && 'Match certificates by Subject Common Name.'}
          </p>
        </div>
      </div>

      {selectedCa && caTrustValue && (
        <div className="space-y-1.5">
          <Label htmlFor="caTrustValue" className="text-sm">Derived CA Trust Value</Label>
          <Input
            id="caTrustValue"
            value={caTrustValue}
            readOnly
            className="bg-muted/50 font-mono text-xs"
          />
        </div>
      )}

      {matchMode === 'serial_and_ca' && (
        <div className="space-y-1.5">
          <Label htmlFor="serialNumber" className="text-sm">
            Serial Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="serialNumber"
            placeholder="1A2B3C4D5E6FF7A8B9C0D1E2F3A4B5C6D"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            required
            disabled={disabled}
            className="font-mono text-sm"
            aria-invalid={serialNumberMissing}
            aria-describedby={serialNumberMissing ? 'principal-serial-number-error' : undefined}
          />
          {serialNumberMissing && <FormFieldError id="principal-serial-number-error" title="Serial Number required." description="Enter one for this match mode." />}
          <p className="text-xs text-muted-foreground">Certificate serial number.</p>
        </div>
      )}

      {(matchMode === 'cn_and_ca' || matchMode === 'subject_cn') && (
        <div className="space-y-1.5">
          <Label htmlFor="subjectCn" className="text-sm">
            Subject Common Name (CN) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="subjectCn"
            placeholder="device-*.example.com"
            value={subjectCn}
            onChange={(e) => setSubjectCn(e.target.value)}
            required
            disabled={disabled}
            className="font-mono text-sm"
            aria-invalid={subjectCnMissing}
            aria-describedby={subjectCnMissing ? 'principal-subject-cn-error' : undefined}
          />
          {subjectCnMissing && <FormFieldError id="principal-subject-cn-error" title="Subject Common Name required." description="Enter one for this match mode." />}
          <p className="text-xs text-muted-foreground">
            Use <code className="rounded bg-muted px-1 py-0.5 text-xs">*</code> for wildcard matching, e.g.{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">*.sensors.example.com</code>
          </p>
        </div>
      )}
    </div>
  );
}
