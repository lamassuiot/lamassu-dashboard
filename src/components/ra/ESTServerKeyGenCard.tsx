
'use client';

import React from 'react';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Server } from "lucide-react";
import { SettingsCard } from './SettingsCard';

interface ESTServerKeyGenCardProps {
  enableKeyGeneration: boolean;
  setEnableKeyGeneration: (v: boolean) => void;
  serverKeygenType: string;
  setServerKeygenType: (v: string) => void;
  serverKeygenSpec: string;
  setServerKeygenSpec: (v: string) => void;
  currentServerKeygenSpecOptions: { value: string; label: string }[];
}

const serverKeygenTypes = [
  { value: 'RSA', label: 'RSA' },
  { value: 'ECDSA', label: 'ECDSA' },
];

export function ESTServerKeyGenCard({
  enableKeyGeneration,
  setEnableKeyGeneration,
  serverKeygenType,
  setServerKeygenType,
  serverKeygenSpec,
  setServerKeygenSpec,
  currentServerKeygenSpecOptions,
}: ESTServerKeyGenCardProps) {
  return (
    <SettingsCard
      icon={Server}
      title="Server Key Generation"
      description="Define whether the platform generates device keys and what algorithms are permitted."
    >
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
        <div className="space-y-0.5">
          <Label htmlFor="enableKeyGeneration" className="flex items-center">
            <Server className="mr-2 h-4 w-4 text-muted-foreground" />
            Enable Server-Side Key Generation
          </Label>
          <p className="text-sm text-muted-foreground">
            Generate cryptographic keys on the server instead of requiring client-side generation.
          </p>
        </div>
        <Switch id="enableKeyGeneration" checked={enableKeyGeneration} onCheckedChange={setEnableKeyGeneration} />
      </div>
      {enableKeyGeneration && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <Label htmlFor="serverKeygenType">Key Type</Label>
            <Select value={serverKeygenType} onValueChange={setServerKeygenType}>
              <SelectTrigger id="serverKeygenType" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {serverKeygenTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="serverKeygenSpec">{serverKeygenType === 'RSA' ? 'Key Bits' : 'Curve'}</Label>
            <Select value={serverKeygenSpec} onValueChange={setServerKeygenSpec}>
              <SelectTrigger id="serverKeygenSpec" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {currentServerKeygenSpecOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
