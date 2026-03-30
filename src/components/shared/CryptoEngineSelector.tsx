
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { CryptoEngineViewer } from './CryptoEngineViewer';
import { useAuth } from '@/contexts/AuthContext';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fetchCryptoEngines } from '@/lib/kms-data';

interface CryptoEngineSelectorProps {
  value: string | undefined; // Allow undefined for initial state
  onValueChange: (engineId: string | undefined) => void;
  disabled?: boolean;
  className?: string;
}

export const CryptoEngineSelector: React.FC<CryptoEngineSelectorProps> = ({ value, onValueChange, disabled, className }) => {
  const [engines, setEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);
  const [errorEngines, setErrorEngines] = useState<string | null>(null);

  const fetchEngines = useCallback(async () => {
    

    setIsLoadingEngines(true);
    setErrorEngines(null);
    try {
      const data = await fetchCryptoEngines();
      setEngines(data);
      // If there's a default engine and no value is set, select the default
      if (!value && data.length > 0) {
        const defaultEngine = data.find(e => e.default && e.id);
        if (defaultEngine) {
          onValueChange(defaultEngine.id);
        }
      }

    } catch (err: any) {
      setErrorEngines(err.message || 'An unknown error occurred.');
      setEngines([]);
    } finally {
      setIsLoadingEngines(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed onValueChange, value from deps to avoid loops

  useEffect(() => {
    fetchEngines();
  }, [fetchEngines]);

  const selectedEngine = engines.find(e => e.id === value);
  const validEngines = engines.filter(e => e.id && e.id.trim() !== '');

  if (isLoadingEngines) {
    return (
      <div className={cn("flex items-center space-x-2 p-2 h-10 border rounded-md bg-muted/50 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading engines...</span>
      </div>
    );
  }

  if (errorEngines) {
    return (
      <div className={cn("flex flex-col items-start space-y-1 p-2 h-auto border rounded-md text-destructive border-destructive bg-destructive/10", className)}>
        <div className="flex items-center space-x-1">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Error loading engines:</span>
        </div>
        <p className="text-xs">{errorEngines}</p>
        <Button onClick={fetchEngines} variant="link" size="sm" className="p-0 h-auto text-destructive hover:text-destructive/80">
          Try again
        </Button>
      </div>
    );
  }

  if (validEngines.length === 0) {
    return (
      <div className={cn("p-2 h-10 border rounded-md text-sm text-muted-foreground bg-muted/50 flex items-center justify-center", className)}>
        No crypto engines available.
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || validEngines.length === 0}>
      <SelectTrigger className={cn("w-full h-auto min-h-10 py-1", className)}>
        {selectedEngine ? <CryptoEngineViewer engine={selectedEngine} /> : <span className="text-muted-foreground">Select a crypto engine...</span>}
      </SelectTrigger>
      <SelectContent>
        {validEngines.map(engine => (
          <SelectItem key={engine.id} value={engine.id}>
            <CryptoEngineViewer engine={engine} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
