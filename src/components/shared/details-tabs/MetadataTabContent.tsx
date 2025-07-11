

'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, Edit, Save, X, Loader2 } from "lucide-react";
import type { ToastProps } from '@/components/ui/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PatchOperation } from '@/lib/ca-data';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div className="h-96 w-full flex items-center justify-center bg-muted/30 rounded-md"><Loader2 className="h-8 w-8 animate-spin"/></div> });

interface MetadataTabContentProps {
  rawJsonData: any;
  itemName: string;
  tabTitle: string;
  toast: ({ title, description, variant }: Omit<ToastProps, 'id'> & { title?: React.ReactNode; description?: React.ReactNode }) => void;
  isEditable?: boolean;
  itemId?: string;
  onSave?: (itemId: string, patchOperations: PatchOperation[]) => Promise<void>;
  onUpdateSuccess?: () => void;
}

export const MetadataTabContent: React.FC<MetadataTabContentProps> = ({
  rawJsonData,
  itemName,
  tabTitle,
  toast,
  isEditable = false,
  itemId,
  onSave,
  onUpdateSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    const jsonString = rawJsonData ? JSON.stringify(rawJsonData, null, 2) : '{}';
    setContent(jsonString);
  }, [rawJsonData]);

  const handleCopy = async () => {
    const jsonString = JSON.stringify(rawJsonData, null, 2);
    if (!jsonString || jsonString === 'null' || jsonString === '{}') {
      toast({ title: "Copy Failed", description: `No metadata found to copy for ${itemName}.`, variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      toast({ title: "Copied!", description: `Metadata for ${itemName} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(`Failed to copy metadata for ${itemName}: `, err);
      toast({ title: "Copy Failed", description: `Could not copy metadata for ${itemName}.`, variant: "destructive" });
    }
  };
  
  const handleEdit = () => {
    setIsEditing(true);
  };
  
  const handleCancel = () => {
    const jsonString = rawJsonData ? JSON.stringify(rawJsonData, null, 2) : '{}';
    setContent(jsonString);
    setIsEditing(false);
    setJsonError(null);
  };
  
  const handleSave = async () => {
    if (!onSave || !itemId) return;
    
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Invalid JSON: ${e.message}`);
      return;
    }

    setIsSaving(true);
    try {
      const patch: PatchOperation[] = [{ op: 'replace', path: '', value: parsedContent }];
      await onSave(itemId, patch);
      toast({ title: "Success!", description: "Metadata updated successfully." });
      setIsEditing(false);
      onUpdateSuccess?.();
    } catch (e: any) {
      toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 py-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{tabTitle}</h3>
        {!isEditing && (
          <div className="flex items-center space-x-2">
            {isEditable && onSave && (
              <Button onClick={handleEdit} variant="outline" size="sm">
                <Edit className="mr-2 h-4 w-4" /> Edit
              </Button>
            )}
            <Button onClick={handleCopy} variant="outline" size="sm" disabled={!rawJsonData || Object.keys(rawJsonData).length === 0}>
              {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div className="border rounded-md overflow-hidden">
            <Editor
              height="30rem"
              defaultLanguage="json"
              value={content}
              onChange={(value) => setContent(value || '')}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, automaticLayout: true }}
            />
          </div>
          {jsonError && <Alert variant="destructive"><AlertDescription>{jsonError}</AlertDescription></Alert>}
          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="ghost" onClick={handleCancel} disabled={isSaving}><X className="mr-2 h-4 w-4"/>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        rawJsonData && Object.keys(rawJsonData).length > 0 ? (
          <ScrollArea className="h-96 w-full rounded-md border p-4 bg-muted/30">
            <pre className="text-xs whitespace-pre-wrap break-all font-mono">
              {JSON.stringify(rawJsonData, null, 2)}
            </pre>
          </ScrollArea>
        ) : (
           <p className="text-sm text-muted-foreground p-4 text-center border rounded-md bg-muted/20">
              No metadata available for this item.
            </p>
        )
      )}
    </div>
  );
};
