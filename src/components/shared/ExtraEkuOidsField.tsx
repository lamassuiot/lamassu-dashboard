
'use client';

import React from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TagInput } from '@/components/shared/TagInput';
import { EXTRA_EKU_OID_PRESETS } from '@/lib/certificate-usage-options';

interface ExtraEkuOidsFieldProps {
  value: string[];
  onChange: (oids: string[]) => void;
  id?: string;
}

/**
 * Editor for arbitrary Extended Key Usage OIDs that have no dedicated
 * ExtendedKeyUsageOption (e.g. RFC 6402 CMC RA/CA, RFC 9483 cmKGA). Offers
 * one-click presets plus a free-text input for any other dotted OID.
 */
export const ExtraEkuOidsField: React.FC<ExtraEkuOidsFieldProps> = ({ value, onChange, id = 'extra-eku-oids' }) => {
  const selected = Array.isArray(value) ? value : [];
  const presetOids = EXTRA_EKU_OID_PRESETS.map(({ oid }) => oid);
  const customOids = selected.filter((oid) => !presetOids.includes(oid));

  const handlePresetToggle = (oid: string, checked: boolean) => {
    onChange(checked ? [...selected, oid] : selected.filter((o) => o !== oid));
  };

  const handleCustomOidsChange = (tags: string[]) => {
    onChange([...selected.filter((oid) => presetOids.includes(oid)), ...tags]);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
        {EXTRA_EKU_OID_PRESETS.map(({ label, oid }) => (
          <div key={oid} className="flex items-center space-x-2">
            <Checkbox
              id={`${id}-${oid}`}
              checked={selected.includes(oid)}
              onCheckedChange={(checked) => handlePresetToggle(oid, !!checked)}
            />
            <Label htmlFor={`${id}-${oid}`} className="text-sm font-normal cursor-pointer">
              {label} <span className="text-muted-foreground font-mono text-xs">({oid})</span>
            </Label>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-custom`} className="text-xs text-muted-foreground">Custom OIDs</Label>
        <TagInput
          id={`${id}-custom`}
          value={customOids}
          onChange={handleCustomOidsChange}
          placeholder="e.g., 1.3.6.1.4.1.311.20.2.2"
        />
      </div>
    </div>
  );
};
