'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import type { Rule } from '@/types/authz';

interface PolicyBuilderJSONProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  note?: string;
}

const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 400;

export function PolicyBuilderJSON({ rules, onChange, note }: PolicyBuilderJSONProps) {
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
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
        setJsonError('Rules must be an array.');
        return;
      }
      setJsonError(null);
      onChange(parsed);
    } catch (err: any) {
      setJsonError(err.message);
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
    <div>
      <div className="overflow-hidden rounded-2xl border" style={{ height: editorHeight }}>
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

      <div className="flex items-start justify-between gap-4 pt-1.5">
        <p className={jsonError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'} role="status">
          {jsonError ? `Not applied: ${jsonError}` : note ?? 'Changes apply as you type.'}
        </p>
        <div
          className="flex h-4 w-16 shrink-0 cursor-ns-resize items-center justify-center"
          onMouseDown={handleDragStart}
          title="Drag to resize"
        >
          <div className="h-1 w-12 rounded-full bg-border" />
        </div>
      </div>
    </div>
  );
}
