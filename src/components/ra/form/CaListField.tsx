'use client';

import { useState } from 'react';
import { PlusCircle, X } from 'lucide-react';

import { CaVisualizerCard } from '@/components/CaVisualizerCard';
import { CaSelectorModal } from '@/components/shared/CaSelectorModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { RaFormDependencies } from './types';

interface CaListFieldProps {
  label: string;
  description: string;
  emptyText: string;
  addLabel: string;
  modalDescription: string;
  value: readonly string[];
  onChange: (ids: string[]) => void;
  deps: RaFormDependencies;
}

/** An ordered, de-duplicated list of CAs with add (via selector modal) and remove. */
export function CaListField({ label, description, emptyText, addLabel, modalDescription, value, onChange, deps }: CaListFieldProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div>
        <Label>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {value.map(id => {
            const ca = deps.casById.get(id);
            return (
              <li key={id} className="flex items-center gap-2">
                {ca ? (
                  <CaVisualizerCard ca={ca} allCryptoEngines={deps.cryptoEngines} className="flex-grow border-border shadow-none" />
                ) : (
                  <code className="flex-grow rounded-lg border px-3 py-2 text-xs text-muted-foreground">{id}</code>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${ca?.name ?? id}`}
                  onClick={() => onChange(value.filter(existing => existing !== id))}
                >
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(true)}>
        <PlusCircle className="mr-2 size-4" /> {addLabel}
      </Button>
      <CaSelectorModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={addLabel}
        description={modalDescription}
        availableCAs={deps.cas}
        isLoadingCAs={deps.isLoading}
        errorCAs={deps.error}
        loadCAsAction={deps.reload}
        allCryptoEngines={deps.cryptoEngines}
        onCaSelected={ca => {
          if (!value.includes(ca.id)) onChange([...value, ca.id]);
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}
