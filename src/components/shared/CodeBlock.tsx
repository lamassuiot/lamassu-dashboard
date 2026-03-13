
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Copy, Check, Download } from 'lucide-react';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

interface CodeBlockProps {
  content: string;
  title?: string;
  showDownload?: boolean;
  downloadFilename?: string;
  downloadMimeType?: string;
  className?: string;
  textareaClassName?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  content,
  title,
  showDownload = false,
  downloadFilename = 'download.txt',
  downloadMimeType = 'text/plain',
  className,
  textareaClassName,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      sileo.success({ title: 'Copied to clipboard!' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
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
    } catch (err) {
        sileo.error({ title: 'Download failed' });
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {title && <Label className="text-sm font-semibold text-muted-foreground">{title}</Label>}
      <div className="flex items-start gap-2">
        <Textarea
          readOnly
          value={content}
          className={cn("h-96 font-mono text-xs", textareaClassName)}
        />
        <div className="flex flex-col gap-2">
          {showDownload && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleDownload}
              title="Download content"
              className="h-8 w-8"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
            title="Copy to clipboard"
            className="h-8 w-8"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
