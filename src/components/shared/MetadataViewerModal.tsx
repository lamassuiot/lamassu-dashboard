
'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Edit, Save, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center bg-muted/30 rounded-md"><Loader2 className="h-8 w-8 animate-spin"/></div> });

interface MetadataViewerModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: string;
  data: object | null;
  isEditable?: boolean;
  itemId?: string;
  onSave?: (itemId: string, content: object) => Promise<void>;
  onUpdateSuccess?: () => void;
}

export const MetadataViewerModal: React.FC<MetadataViewerModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  description,
  data,
  isEditable = false,
  itemId,
  onSave,
  onUpdateSuccess,
}) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  // Internal state to hold the current version of the data being displayed
  const [displayData, setDisplayData] = useState(data);

  // When the modal opens or the external data prop changes, reset our internal state
  useEffect(() => {
    if (isOpen) {
      setDisplayData(data);
    }
  }, [data, isOpen]);

  // When the display data changes (or modal opens), update the editor content
  useEffect(() => {
    const jsonString = displayData ? JSON.stringify(displayData, null, 2) : '{}';
    setContent(jsonString);
    if (!isOpen) { // Reset editing state when modal closes
        setIsEditing(false);
        setJsonError(null);
    }
  }, [displayData, isOpen]);


  const jsonStringForDisplay = displayData ? JSON.stringify(displayData, null, 2) : '{}';
  const hasData = displayData && Object.keys(displayData).length > 0;


  const handleCopy = async () => {
    if (!hasData) return;
    try {
      await navigator.clipboard.writeText(jsonStringForDisplay);
      setCopied(true);
      toast({ title: "Copied!", description: "Metadata JSON copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  };

  const handleEdit = () => setIsEditing(true);

  const handleCancel = () => {
    const currentJsonString = displayData ? JSON.stringify(displayData, null, 2) : '{}';
    setContent(currentJsonString);
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
      await onSave(itemId, parsedContent);
      toast({ title: "Success!", description: "Metadata updated successfully." });
      setDisplayData(parsedContent); // Update internal state immediately
      setIsEditing(false);
      onUpdateSuccess?.(); // Notify parent to refetch list data in the background
    } catch (e: any) {
      toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="my-2 relative">
           {!isEditing && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1.5 right-1.5 h-7 w-7 z-10"
                onClick={handleCopy}
                disabled={!hasData}
                title="Copy JSON"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
           )}

            {isEditing ? (
              <div className="border rounded-md overflow-hidden h-[400px]">
                  <Editor
                    height="100%"
                    defaultLanguage="json"
                    value={content}
                    onChange={(value) => setContent(value || '')}
                    theme="vs-dark"
                    options={{ minimap: { enabled: false }, automaticLayout: true }}
                  />
              </div>
            ) : (
                 <ScrollArea className="h-[400px] w-full rounded-md border bg-muted/30">
                    <pre className="text-xs whitespace-pre-wrap break-all font-mono p-4">
                        {hasData ? jsonStringForDisplay : "No metadata available for this item."}
                    </pre>
                </ScrollArea>
            )}
        </div>
        
        {jsonError && <Alert variant="destructive"><AlertDescription>{jsonError}</AlertDescription></Alert>}

        <DialogFooter>
            {isEditing ? (
                <div className="w-full flex justify-end space-x-2">
                    <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        Save
                    </Button>
                </div>
            ) : (
                <div className="w-full flex justify-between items-center">
                    {isEditable && onSave ? (
                         <Button variant="outline" onClick={handleEdit}><Edit className="mr-2 h-4 w-4"/>Edit</Button>
                    ) : <div />}
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Close</Button>
                    </DialogClose>
                </div>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
