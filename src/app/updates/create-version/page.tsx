// src/app/updates/create-version/page.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, GitFork, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { fetchUpdatePacks, createUpdatePackVersion } from '@/lib/iot-api';
import { useDms } from '@/contexts/DmsContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { cn, isValidSemver, compareSemver } from '@/lib/utils';
import type { UpdatePack } from '@/types/iot';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';

// Lightweight "create a new version of an existing pack" page. It just bumps the pack to a fresh
// version and lands on the pack's details, where artifacts are uploaded and (for SWU packs) the SWU
// is built. Brand-new packs are created at /updates/create.
export default function CreateUpdatePackVersionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedDms, setSelectedDms, availableDms } = useDms();
  const { user } = useAuth();

  const basePackId = searchParams.get('basePackId');
  const dmsIdParam = searchParams.get('groupId');

  // Switch DMS if groupId param is provided and different from current
  useEffect(() => {
    if (dmsIdParam && availableDms.length > 0 && selectedDms?.id !== dmsIdParam) {
      const target = availableDms.find(d => d.id === dmsIdParam);
      if (target) setSelectedDms(target);
    }
  }, [dmsIdParam, availableDms, selectedDms, setSelectedDms]);

  const { data: fetchedUpdatePacks = [] } = useQuery<any, Error, UpdatePack[]>({
    queryKey: ['updatePacks', selectedDms?.id],
    queryFn: () => fetchUpdatePacks({ groupId: selectedDms!.id }, { pageSize: 50 }),
    enabled: !!selectedDms && !!user?.access_token,
    select: (data) => (Array.isArray(data) ? data : (data?.list || [])),
  });

  const [selectedBasePackId, setSelectedBasePackId] = useState<string | undefined>(undefined);
  const [newVersion, setNewVersion] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const selectedPack = fetchedUpdatePacks.find(p => p.id === selectedBasePackId);

  // Suggest the next version by bumping the current patch (x.y.z -> x.y.(z+1)); fallback to 1.0.0.
  const suggestNextVersion = (current?: string): string => {
    if (current && isValidSemver(current)) {
      const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10));
      return `${maj}.${min}.${pat + 1}`;
    }
    return '1.0.0';
  };

  // Preselect the base pack from the query param once packs are loaded.
  useEffect(() => {
    if (basePackId && fetchedUpdatePacks.find(p => p.id === basePackId)) {
      setSelectedBasePackId(basePackId);
    }
  }, [basePackId, fetchedUpdatePacks]);

  // Prefill a suggested next version whenever the selected pack changes.
  useEffect(() => {
    if (selectedPack) setNewVersion(suggestNextVersion(selectedPack.version));
  }, [selectedBasePackId]); // eslint-disable-line react-hooks/exhaustive-deps

  const versionValid = isValidSemver(newVersion.trim());
  const versionGreater = !!selectedPack && versionValid && (!isValidSemver(selectedPack.version) || compareSemver(newVersion.trim(), selectedPack.version) > 0);

  const handleCreateVersion = async () => {
    if (!selectedPack || !selectedDms || !user?.access_token) return;
    if (!versionValid) {
      toast({ title: 'Invalid version', description: 'Version must be semver (x.y.z).', variant: 'destructive' });
      return;
    }
    if (!versionGreater) {
      toast({ title: 'Version too low', description: `New version must be greater than the current v${selectedPack.version}.`, variant: 'destructive' });
      return;
    }
    setIsCreating(true);
    try {
      await createUpdatePackVersion({ groupId: selectedDms.id, packName: selectedPack.name, version: newVersion.trim() });
      toast({ title: 'New version created', description: `${selectedPack.name} is now v${newVersion.trim()} — upload artifacts next.` });
      router.push(`/updates/pack-details?groupId=${encodeURIComponent(selectedDms.id)}&packName=${encodeURIComponent(selectedPack.name)}`);
    } catch (err: any) {
      toast({ title: 'Failed to create version', description: err.message || 'An error occurred.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  if (!selectedDms) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Please select a Device Group above to manage distribution sets.</p>
      </div>
    );
  }

  return (
    <BreadcrumbPage items={[{ label: 'Home', href: '/' }, { label: 'Distribution Set', href: '/package-inventory' }, { label: 'New Version' }]} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/package-inventory')} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitFork className="h-8 w-8 text-primary" />
              New Version of an Existing Pack
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Packs are managed in the Package Inventory.</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select a pack to version</CardTitle>
          <CardDescription>
            Creating a new version bumps the pack and clears its built SWU. You'll upload fresh artifacts and
            (for SWU packs) build the SWU on the pack's page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Base pack</Label>
            <Select value={selectedBasePackId} onValueChange={setSelectedBasePackId}>
              <SelectTrigger><SelectValue placeholder="Select a pack" /></SelectTrigger>
              <SelectContent>
                {fetchedUpdatePacks.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} (current v{p.version})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedPack && (
            <div className="space-y-1.5">
              <Label htmlFor="new-version">New version</Label>
              <Input
                id="new-version"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                placeholder="e.g. 1.1.0"
                className={cn((newVersion && !versionValid) || (versionValid && !versionGreater) ? 'border-destructive focus-visible:ring-destructive' : '')}
              />
              <p className={cn('text-xs', (newVersion && !versionValid) || (versionValid && !versionGreater) ? 'text-destructive' : 'text-muted-foreground')}>
                {newVersion && !versionValid
                  ? 'Must be semver (x.y.z).'
                  : versionValid && !versionGreater
                    ? `Must be greater than the current v${selectedPack.version}.`
                    : `Semver (x.y.z), greater than the current v${selectedPack.version}.`}
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button onClick={handleCreateVersion} disabled={!selectedPack || isCreating || !versionGreater} className="ml-auto">
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create New Version
          </Button>
        </CardFooter>
      </Card>
    </BreadcrumbPage>
  );
}
