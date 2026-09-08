
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
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { cn } from '@/lib/utils';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

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
  const [saveError, setSaveError] = useState<string | null>(null);
  
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
        setSaveError(null);
    }
  }, [displayData, isOpen]);


  const jsonStringForDisplay = displayData ? JSON.stringify(displayData, null, 2) : '{}';
  const hasData = displayData && Object.keys(displayData).length > 0;
  let jsonError: string | null = null;
  try {
    JSON.parse(content);
  } catch (error) {
    jsonError = `Invalid JSON: ${error instanceof Error ? error.message : 'Unable to parse metadata.'}`;
  }


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

  const handleEdit = () => {
    setSaveError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    const currentJsonString = displayData ? JSON.stringify(displayData, null, 2) : '{}';
    setContent(currentJsonString);
    setIsEditing(false);
    setSaveError(null);
  };
  
  const handleSave = async () => {
    if (!onSave || !itemId) return;
    if (jsonError) return;
    
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(itemId, parsedContent);
      sileo.success({ title: "Success!", description: "Metadata updated successfully." });
      setDisplayData(parsedContent); // Update internal state immediately
      setIsEditing(false);
      setSaveError(null);
      onUpdateSuccess?.(); // Notify parent to refetch list data in the background
    } catch (e: any) {
      setSaveError(e.message || 'Metadata could not be saved.');
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
          <div aria-invalid={!!jsonError} aria-describedby={jsonError ? 'metadata-editor-error' : undefined} className={cn("border rounded-md overflow-hidden h-[400px]", presentation === 'sheet' && "h-full min-h-0", jsonError && "border-destructive ring-3 ring-destructive/20")}>
            <Editor
              height="100%"
              defaultLanguage="json"
              value={content}
              onChange={(value) => {
                setContent(value || '');
                setSaveError(null);
              }}
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

      {jsonError && <FormFieldError id="metadata-editor-error" title={jsonError} />}
    </>
  );

  const footerContent = isEditing ? (
    <div className="w-full space-y-3">
      <FormValidationSummary errors={[...(jsonError ? [jsonError] : []), ...(saveError ? [`Save: ${saveError}`] : [])]} />
      <div className="flex justify-end space-x-2">
        <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving || !!jsonError}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
          Save
        </Button>
      </div>
    </div>
  ) : (
    <div className="w-full flex justify-between items-center">
      {isEditable && onSave ? (
        <Button variant="secondary" onClick={handleEdit}><Edit className="mr-2 h-4 w-4"/>Edit</Button>
      ) : <div />}
      {presentation === 'sheet' ? (
        <SheetClose asChild>
          <Button type="button" variant="secondary">Close</Button>
        </SheetClose>
      ) : (
        <DialogClose asChild>
          <Button type="button" variant="secondary">Close</Button>
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
