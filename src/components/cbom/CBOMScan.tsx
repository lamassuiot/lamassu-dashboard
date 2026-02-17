'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { scanRepository, ScanRequest } from '@/lib/cbom-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const CBOMScan: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [scanUrl, setScanUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [subfolder, setSubfolder] = useState('');
  const [useCredentials, setUseCredentials] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pat, setPat] = useState('');

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.access_token || !scanUrl) {
      toast({
        title: 'Error',
        description: 'Please provide a repository URL',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const request: ScanRequest = {
        scanUrl,
        ...(branch && { branch }),
        ...(subfolder && { subfolder }),
      };

      if (useCredentials) {
        request.credentials = {
          ...(username && { username }),
          ...(password && { password }),
          ...(pat && { pat }),
        };
      }

      const result = await scanRepository(request, user.access_token);
      
      toast({
        title: 'Success',
        description: 'Repository scan completed successfully',
      });
      
      // Reset form
      setScanUrl('');
      setBranch('');
      setSubfolder('');
      setUsername('');
      setPassword('');
      setPat('');
      setUseCredentials(false);
      
      console.log('Scan result:', result);
    } catch (error) {
      console.error('Failed to scan repository:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to scan repository',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleScan} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="scan-url">Repository URL</Label>
        <Input
          id="scan-url"
          placeholder="https://github.com/username/repository.git"
          value={scanUrl}
          onChange={(e) => setScanUrl(e.target.value)}
          required
        />
        <p className="text-sm text-muted-foreground">
          Git repository URL to scan for cryptographic dependencies
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="branch">Branch (optional)</Label>
          <Input
            id="branch"
            placeholder="main"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="subfolder">Subfolder (optional)</Label>
          <Input
            id="subfolder"
            placeholder="src/"
            value={subfolder}
            onChange={(e) => setSubfolder(e.target.value)}
          />
        </div>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="credentials">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={useCredentials}
                onCheckedChange={(checked) => setUseCredentials(checked === true)}
                onClick={(e) => e.stopPropagation()}
              />
              <span>Use Authentication</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!useCredentials}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!useCredentials}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pat">Personal Access Token</Label>
                <Input
                  id="pat"
                  type="password"
                  placeholder="Personal Access Token"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  disabled={!useCredentials}
                />
                <p className="text-sm text-muted-foreground">
                  Provide either username/password or a personal access token
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button type="submit" disabled={isLoading || !scanUrl}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Scanning...
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" />
            Scan Repository
          </>
        )}
      </Button>
    </form>
  );
};
