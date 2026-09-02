

'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Copy, Check, Save, Loader2 } from "lucide-react";
import { sileo } from '@/lib/toast';
import type { PatchOperation } from '@/lib/ca-data';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { cn } from '@/lib/utils';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

const EDITOR_HEIGHT = '26rem';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div className="h-80 w-full flex items-center justify-center rounded-md bg-muted/30"><Loader2 className="h-8 w-8 animate-spin"/></div> });

interface MetadataTabContentProps {
  rawJsonData: any;
  itemName: string;
  tabTitle: string;
  isEditable?: boolean;
  itemId?: string;
  onSave?: (itemId: string, patchOperations: PatchOperation[]) => Promise<void>;
  onUpdateSuccess?: () => void;
}

export const MetadataTabContent: React.FC<MetadataTabContentProps> = ({
  rawJsonData,
  itemName,
  tabTitle,
  isEditable = false,
  itemId,
  onSave,
  onUpdateSuccess,
}) => {
  const monacoTheme = useMonacoTheme();
  const [copied, setCopied] = useState(false);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEdit = isEditable && !!onSave && !!itemId;
  const isEmpty = !rawJsonData || Object.keys(rawJsonData).length === 0;
  const initialContent = isEmpty ? '{\n  \n}' : JSON.stringify(rawJsonData, null, 2);
  const isDirty = canEdit && content !== initialContent;
  let jsonError: string | null = null;
  try {
    JSON.parse(content);
  } catch (error) {
    jsonError = `Invalid JSON: ${error instanceof Error ? error.message : 'Unable to parse metadata.'}`;
  }

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleCopy = async () => {
    const jsonString = content.trim();
    if (!jsonString || jsonString === 'null' || jsonString === '{}') {
      sileo.error({ title: "Copy Failed", description: `No metadata found to copy for ${itemName}.` });
      return;
    }
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      sileo.success({ title: "Copied!", description: `Metadata for ${itemName} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(`Failed to copy metadata for ${itemName}: `, err);
      sileo.error({ title: "Copy Failed", description: `Could not copy metadata for ${itemName}.` });
    }
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
      const patch: PatchOperation[] = [{ op: 'replace', path: '', value: parsedContent }];
      await onSave(itemId, patch);
      sileo.success({ title: "Success!", description: "Metadata updated successfully." });
      setSaveError(null);
      onUpdateSuccess?.();
    } catch (e: any) {
      setSaveError(e.message || 'Metadata could not be saved.');
      sileo.error({ title: "Save Failed", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
      <div>
        <p className="font-semibold">{tabTitle}</p>
        <p className="text-sm text-muted-foreground mt-1">
          View{isEditable ? ' or edit' : ''} metadata attached to {itemName}.
        </p>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center gap-2">
          <Button onClick={handleCopy} variant="secondary">
            {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
        </div>
        <div aria-invalid={!!jsonError} aria-describedby={jsonError ? 'metadata-tab-editor-error' : undefined} className={cn("overflow-hidden rounded-lg border", jsonError && "border-destructive ring-3 ring-destructive/20")}>
          <Editor
            height={EDITOR_HEIGHT}
            defaultLanguage="json"
            value={content}
            onChange={(value) => {
              setContent(value || '');
              setSaveError(null);
            }}
            theme={monacoTheme}
            options={{
              minimap: { enabled: false },
              automaticLayout: true,
              readOnly: !canEdit,
              domReadOnly: !canEdit,
              cursorStyle: 'line',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
            }}
          />
        </div>
        {jsonError && <FormFieldError id="metadata-tab-editor-error" title={jsonError} />}
        {isDirty && (
          <div className="space-y-3">
            <FormValidationSummary errors={[...(jsonError ? [jsonError] : []), ...(saveError ? [`Save: ${saveError}`] : [])]} />
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSaving || !!jsonError}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
