'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, Check } from "lucide-react";
import { fetchKmsKeys, type ApiKmsKey } from '@/lib/kms-data';
import { CryptoEngineViewer } from '@/components/shared/CryptoEngineViewer';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { KeyStrengthIndicator } from '@/components/shared/KeyStrengthIndicator';
import { Input } from "@/components/ui/input";

interface KmsKeySelectorProps {
  value?: string; // Selected key ID (pkcs11_uri)
  onValueChange: (keyId: string, keyData: ApiKmsKey) => void;
  allCryptoEngines: ApiCryptoEngine[];
  disabled?: boolean;
  className?: string;
  filterEngineId?: string; // Optional: filter keys by engine ID
  requirePrivateKey?: boolean; // Optional: only show keys with private key
}

export function KmsKeySelector({
  value,
  onValueChange,
  allCryptoEngines,
  disabled = false,
  className,
  filterEngineId,
  requirePrivateKey = false,
}: KmsKeySelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKmsKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedKey = keys.find(k => k.pkcs11_uri === value);
  const selectedEngine = selectedKey ? allCryptoEngines.find(e => e.id === selectedKey.engine_id) : null;

  const loadKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page_size', '100');
      if (filterEngineId) {
        params.append('engine_id', filterEngineId);
      }

      const response = await fetchKmsKeys(params);
      let filteredKeys = response.list || [];
      
      if (requirePrivateKey) {
        filteredKeys = filteredKeys.filter(key => key.has_private_key);
      }

      setKeys(filteredKeys);
    } catch (err: any) {
      setError(err.message || 'Failed to load KMS keys');
      setKeys([]);
    } finally {
      setIsLoading(false);
    }
  }, [filterEngineId, requirePrivateKey]);

  useEffect(() => {
    if (isModalOpen) {
      loadKeys();
    }
  }, [isModalOpen, loadKeys]);

  const handleSelectKey = (key: ApiKmsKey) => {
    onValueChange(key.pkcs11_uri, key);
    setIsModalOpen(false);
  };

  const filteredKeys = keys.filter(key => 
    key.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    key.key_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    key.pkcs11_uri.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setIsModalOpen(true)}
        className={`w-full justify-start text-left font-normal ${className}`}
        disabled={disabled}
      >
        {selectedKey ? (
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <KeyRound className="h-4 w-4 shrink-0" />
              <span className="font-medium truncate">{selectedKey.name}</span>
              <Badge variant="secondary" className="text-xs shrink-0">
                {selectedKey.algorithm} {selectedKey.size}
              </Badge>
            </div>
            {selectedEngine && (
              <div className="shrink-0">
                <CryptoEngineViewer engine={selectedEngine} />
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Select KMS Key...</span>
        )}
      </Button>

      <Sheet open={isModalOpen} onOpenChange={setIsModalOpen}>
        <SheetContent side="right" className="data-[side=right]:w-1/2 data-[side=right]:sm:max-w-none flex flex-col">
          <SheetHeader>
            <SheetTitle>Select KMS Key</SheetTitle>
            <SheetDescription>
              Choose an existing key from the Key Management Service
              {requirePrivateKey && " (showing only keys with private key available)"}
            </SheetDescription>
          </SheetHeader>

          <div className="px-6 py-4">
            <Input
              placeholder="Search by name or key ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                <p>{error}</p>
                <Button variant="secondary" onClick={loadKeys} className="mt-4">Retry</Button>
              </div>
            ) : filteredKeys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <KeyRound className="mx-auto h-12 w-12 opacity-20 mb-3" />
                <p>No KMS keys found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Strength</TableHead>
                    <TableHead>Crypto Engine</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKeys.map((key) => {
                    const engine = allCryptoEngines.find(e => e.id === key.engine_id);
                    const isSelected = value === key.pkcs11_uri;
                    return (
                      <TableRow
                        key={key.pkcs11_uri}
                        onClick={() => handleSelectKey(key)}
                        className={`cursor-pointer ${isSelected ? "bg-primary/5" : "hover:bg-muted/50"}`}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                            {key.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{key.algorithm} {key.size}</Badge>
                        </TableCell>
                        <TableCell>
                          <KeyStrengthIndicator algorithm={key.algorithm} size={String(key.size)} />
                        </TableCell>
                        <TableCell>
                          {engine ? (
                            <CryptoEngineViewer engine={engine} />
                          ) : (
                            <Badge variant="secondary" className="text-xs">{key.engine_id}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
