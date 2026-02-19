'use client';

import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Rule } from '@/types/authz';

interface PolicyBuilderJSONProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  error?: string | null;
}

export function PolicyBuilderJSON({ rules, onChange, error }: PolicyBuilderJSONProps) {
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    setJsonText(JSON.stringify(rules, null, 2));
  }, [rules]);

  const handleChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
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

  return (
    <div className="space-y-4">
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

      <Textarea
        value={jsonText}
        onChange={(e) => handleChange(e.target.value)}
        className="font-mono text-sm min-h-[400px]"
        placeholder="Enter policy rules as JSON array"
      />

      <div className="text-xs text-muted-foreground">
        <p className="font-semibold mb-1">Example:</p>
        <pre className="bg-muted p-2 rounded">
{`[
  {
    "namespace": "pki",
    "entityType": "document",
    "actions": ["read", "write"],
    "relations": [
      {
        "to": "folder",
        "via": "parent",
        "actions": ["read"],
        "relations": []
      }
    ],
    "directGrants": ["user123"]
  }
]`}
        </pre>
      </div>
    </div>
  );
}
