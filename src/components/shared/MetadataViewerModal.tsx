
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { sileo } from '@/lib/toast';
import { Copy, Check, Edit, Save, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { cn } from '@/lib/utils';

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
  presentation?: 'dialog' | 'sheet';
  useMonacoViewer?: boolean;
  sheetContentClassName?: string;
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
  presentation = 'dialog',
  useMonacoViewer = false,
  sheetContentClassName,
}) => {
  const monacoTheme = useMonacoTheme();
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
      sileo.success({ title: "Copied!", description: "Metadata JSON copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      sileo.error({ title: "Copy Failed" });
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
      sileo.success({ title: "Success!", description: "Metadata updated successfully." });
      setDisplayData(parsedContent); // Update internal state immediately
      setIsEditing(false);
      onUpdateSuccess?.(); // Notify parent to refetch list data in the background
    } catch (e: any) {
      sileo.error({ title: "Save Failed", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };


  const contentBody = (
    <>
      <div className={cn("my-2 relative", presentation === 'sheet' && "flex-1 min-h-0")}>
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
          <div className={cn("border rounded-md overflow-hidden h-[400px]", presentation === 'sheet' && "h-full min-h-0")}>
            <Editor
              height="100%"
              defaultLanguage="json"
              value={content}
              onChange={(value) => setContent(value || '')}
              theme={monacoTheme}
              options={{ minimap: { enabled: false }, automaticLayout: true }}
            />
          </div>
        ) : useMonacoViewer ? (
          <div className={cn("border rounded-md overflow-hidden h-[400px]", presentation === 'sheet' && "h-full min-h-0")}>
            <Editor
              height="100%"
              defaultLanguage="json"
              value={jsonStringForDisplay}
              theme={monacoTheme}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                automaticLayout: true,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
              }}
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
    </>
  );

  const footerContent = isEditing ? (
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
      {presentation === 'sheet' ? (
        <SheetClose asChild>
          <Button type="button" variant="outline">Close</Button>
        </SheetClose>
      ) : (
        <DialogClose asChild>
          <Button type="button" variant="outline">Close</Button>
        </DialogClose>
      )}
    </div>
  );

  if (presentation === 'sheet') {
    return (
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn("w-full p-0 sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex flex-col", sheetContentClassName)}>
          <SheetHeader className="border-b px-6 py-5 text-left">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>

          <div className="flex flex-1 min-h-0 flex-col overflow-hidden px-6 py-4">
            {contentBody}
          </div>

          <SheetFooter className="border-t px-6 py-4">
            {footerContent}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {contentBody}

        <DialogFooter>
          {footerContent}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
