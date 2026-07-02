'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import type { Rule } from '@/types/authz';

interface PolicyBuilderJSONProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 400;

export function PolicyBuilderJSON({ rules, onChange, error }: PolicyBuilderJSONProps) {
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);
  const [editorHeight, setEditorHeight] = useState(DEFAULT_HEIGHT);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef(DEFAULT_HEIGHT);
  const monacoTheme = useMonacoTheme();

  useEffect(() => {
    setJsonText(JSON.stringify(rules, null, 2));
  }, [rules]);

  const handleChange = (value: string | undefined) => {
    const text = value ?? '';
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setJsonError('Rules must be an array');
        setIsValid(false);
        return;
      }
      setJsonError(null);
      setIsValid(true);
      onChange(parsed);
    } catch (err: any) {
      setJsonError(err.message);
      setIsValid(false);
    }
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartY.current = e.clientY;
    dragStartHeight.current = editorHeight;
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (dragStartY.current === null) return;
      const delta = ev.clientY - dragStartY.current;
      setEditorHeight(Math.max(MIN_HEIGHT, dragStartHeight.current + delta));
    };
    const onUp = () => {
      dragStartY.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editorHeight]);

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && jsonError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{jsonError}</AlertDescription>
        </Alert>
      )}

      {!error && !jsonError && isValid && jsonText && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Valid JSON</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border overflow-hidden" style={{ height: editorHeight }}>
        <Editor
          height={editorHeight}
          language="json"
          value={jsonText}
          theme={monacoTheme}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            tabSize: 2,
            wordWrap: 'on',
            formatOnPaste: true,
            formatOnType: true,
            automaticLayout: true,
          }}
        />
      </div>

      <div
        className="flex h-2 cursor-ns-resize items-center justify-center rounded-b-md"
        onMouseDown={handleDragStart}
        title="Drag to resize"
      >
        <div className="h-1 w-12 rounded-full bg-border" />
      </div>
    </div>
  );
}
