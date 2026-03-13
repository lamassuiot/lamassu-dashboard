

'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Copy, Check, Save, Loader2, FileJson } from "lucide-react";
import { sileo } from '@/lib/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PatchOperation } from '@/lib/ca-data';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { DetailSectionCard } from '@/components/shared/DetailSectionCard';

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
  const [jsonError, setJsonError] = useState<string | null>(null);

  const canEdit = isEditable && !!onSave && !!itemId;
  const isEmpty = !rawJsonData || Object.keys(rawJsonData).length === 0;
  const initialContent = isEmpty ? '{\n  \n}' : JSON.stringify(rawJsonData, null, 2);
  const isDirty = canEdit && content !== initialContent;

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
      sileo.success({ title: "Success!", description: "Metadata updated successfully." });
      onUpdateSuccess?.();
    } catch (e: any) {
      sileo.error({ title: "Save Failed", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DetailSectionCard
      icon={FileJson}
      title={tabTitle}
      description={`View${isEditable ? ' or edit' : ''} metadata attached to ${itemName}.`}
      contentClassName="space-y-4"
      action={canEdit || !isEmpty ? (
        <div className="flex items-center gap-2">
          <Button onClick={handleCopy} variant="outline" size="sm">
            {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
          {isDirty ? (
            <Button onClick={handleSave} size="sm" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          ) : null}
        </div>
      ) : undefined}
    >
      <div className="space-y-2">
        <div className="overflow-hidden rounded-lg border">
          <Editor
            height={EDITOR_HEIGHT}
            defaultLanguage="json"
            value={content}
            onChange={(value) => {
              setContent(value || '');
              if (jsonError) setJsonError(null);
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
        {jsonError && <Alert variant="destructive"><AlertDescription>{jsonError}</AlertDescription></Alert>}
      </div>
    </DetailSectionCard>
  );
};
