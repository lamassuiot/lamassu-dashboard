'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { storeCBOM } from '@/lib/cbom-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const CBOMUpload: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [projectIdentifier, setProjectIdentifier] = useState('');
  const [cbomData, setCbomData] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.access_token || !file || !projectIdentifier) {
      toast({
        title: 'Error',
        description: 'Please provide both project identifier and CBOM file',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileContent = await file.text();
      const jsonData = JSON.parse(fileContent);
      await storeCBOM(projectIdentifier, jsonData, user.access_token);
      
      toast({
        title: 'Success',
        description: 'CBOM uploaded successfully',
      });
      
      setProjectIdentifier('');
      setFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error('Failed to upload CBOM:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload CBOM',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.access_token || !cbomData || !projectIdentifier) {
      toast({
        title: 'Error',
        description: 'Please provide both project identifier and CBOM data',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const jsonData = JSON.parse(cbomData);
      await storeCBOM(projectIdentifier, jsonData, user.access_token);
      
      toast({
        title: 'Success',
        description: 'CBOM stored successfully',
      });
      
      setProjectIdentifier('');
      setCbomData('');
    } catch (error) {
      console.error('Failed to store CBOM:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to store CBOM',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tabs defaultValue="file" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="file">Upload File</TabsTrigger>
        <TabsTrigger value="text">Paste JSON</TabsTrigger>
      </TabsList>

      <TabsContent value="file">
        <form onSubmit={handleFileUpload} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-id-file">Project Identifier</Label>
            <Input
              id="project-id-file"
              placeholder="e.g., my-project or pkg:npm/my-package@1.0.0"
              value={projectIdentifier}
              onChange={(e) => setProjectIdentifier(e.target.value)}
              required
            />
            <p className="text-sm text-muted-foreground">
              A unique identifier for your project (can be a PURL)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-upload">CBOM File</Label>
            <Input
              id="file-upload"
              type="file"
              accept=".json,application/json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
            <p className="text-sm text-muted-foreground">
              Upload a JSON file containing your CBOM data
            </p>
          </div>

          <Button type="submit" disabled={isLoading || !file || !projectIdentifier}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload CBOM
              </>
            )}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="text">
        <form onSubmit={handleTextUpload} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-id-text">Project Identifier</Label>
            <Input
              id="project-id-text"
              placeholder="e.g., my-project or pkg:npm/my-package@1.0.0"
              value={projectIdentifier}
              onChange={(e) => setProjectIdentifier(e.target.value)}
              required
            />
            <p className="text-sm text-muted-foreground">
              A unique identifier for your project (can be a PURL)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cbom-data">CBOM JSON Data</Label>
            <Textarea
              id="cbom-data"
              placeholder="Paste your CBOM JSON data here..."
              value={cbomData}
              onChange={(e) => setCbomData(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              required
            />
            <p className="text-sm text-muted-foreground">
              Paste valid JSON data for your CBOM
            </p>
          </div>

          <Button type="submit" disabled={isLoading || !cbomData || !projectIdentifier}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Storing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Store CBOM
              </>
            )}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
};
