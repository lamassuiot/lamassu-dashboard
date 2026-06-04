'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Copy, Check, Download } from 'lucide-react';
import { Label } from '../ui/label';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface CodeBlockProps {
  content: string;
  title?: string;
  showDownload?: boolean;
  downloadFilename?: string;
  downloadMimeType?: string;
  className?: string;
  /** @deprecated height is now automatic; this prop is ignored */
  textareaClassName?: string;
  language?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  content,
  title,
  showDownload = false,
  downloadFilename = 'download.txt',
  downloadMimeType = 'text/plain',
  className,
  language,
}) => {
  const [copied, setCopied] = useState(false);
  const [editorHeight, setEditorHeight] = useState(60);
  const monacoTheme = useMonacoTheme();

  const handleEditorMount = useCallback((editor: any) => {
    const updateHeight = () => {
      setEditorHeight(Math.max(editor.getContentHeight(), 40));
    };
    editor.onDidContentSizeChange(updateHeight);
    updateHeight();
  }, []);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      sileo.success({ title: 'Copied to clipboard!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      sileo.error({ title: 'Copy failed' });
    }
  };

  const handleDownload = () => {
    if (!content) return;
    try {
      const blob = new Blob([content], { type: downloadMimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      sileo.error({ title: 'Download failed' });
    }
  };

  const detectedLanguage = language
    ?? (content.trimStart().startsWith('{') || content.trimStart().startsWith('[')
      ? 'json'
      : content.trimStart().startsWith('-----BEGIN')
      ? 'plaintext'
      : 'shell');

  return (
    <div className={cn('space-y-1.5', className)}>
      {title && <Label className="text-sm font-semibold text-muted-foreground">{title}</Label>}
      <div className="flex items-start gap-2">
        <div
          className="min-w-0 flex-1 overflow-hidden rounded-md border"
          style={{ height: editorHeight }}
        >
          <MonacoEditor
            value={content}
            language={detectedLanguage}
            theme={monacoTheme}
            onMount={handleEditorMount}
            loading={<div className="h-10 animate-pulse bg-muted/40" />}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'off',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 0,
              renderLineHighlight: 'none',
              wordWrap: 'off',
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'auto',
                alwaysConsumeMouseWheel: false,
              },
              overviewRulerLanes: 0,
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              padding: { top: 8, bottom: 8 },
              contextmenu: false,
              automaticLayout: true,
            }}
          />
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {showDownload && (
            <Button variant="secondary" size="icon" onClick={handleDownload} title="Download" className="h-8 w-8">
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button variant="secondary" size="icon" onClick={handleCopy} title="Copy" className="h-8 w-8">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
