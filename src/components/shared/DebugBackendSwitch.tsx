'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';
import {
  DEFAULT_BACKEND_URLS, getDebugBackendOverride, getDebugUpdatesBaseUrl, setDebugBackend,
  type DebugBackend,
} from '@/lib/debug-backend';

const AUTO = '__auto__';

/**
 * Developer-only switch for which updates backend this browser talks to.
 *
 * The two backends are separate services with their own data, so this changes the API's base URL
 * rather than relabelling one backend's answers — run both locally and flip between them. The port
 * is editable because the defaults are only this repo's dev setup.
 *
 * Reloads on change: capabilities are read once at mount and fan out into pages that fetch on the
 * strength of them, so re-rendering in place would leave half the app pointed at the other backend.
 */
export function DebugBackendSwitch() {
  const { backend } = useUpdatesCapabilities();
  // Read on mount only: localStorage is not reactive, and this control is the only thing that writes it.
  const [mode, setMode] = React.useState<DebugBackend | null>(null);
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    setMode(getDebugBackendOverride());
    setUrl(getDebugUpdatesBaseUrl() ?? '');
  }, []);

  const applyMode = (value: string) => {
    const next = value === AUTO ? null : (value as DebugBackend);
    setDebugBackend(next, next ? DEFAULT_BACKEND_URLS[next] : null);
    window.location.reload();
  };

  const applyUrl = () => {
    if (!mode) return;
    setDebugBackend(mode, url);
    window.location.reload();
  };

  return (
    <div className="px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="debug-updates-backend" className="cursor-pointer text-sm">
          Updates backend
        </Label>
        <Select value={mode ?? AUTO} onValueChange={applyMode}>
          <SelectTrigger id="debug-updates-backend" className="h-7 w-[104px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO} className="text-xs">Auto</SelectItem>
            <SelectItem value="native" className="text-xs">native</SelectItem>
            <SelectItem value="hawkbit" className="text-xs">hawkbit</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode && (
        <Input
          aria-label="Updates API base URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={applyUrl}
          onKeyDown={(e) => { if (e.key === 'Enter') applyUrl(); }}
          className="mt-1.5 h-7 font-mono text-[11px]"
          placeholder={DEFAULT_BACKEND_URLS[mode]}
        />
      )}

      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {mode
          ? `Talking to the ${mode} backend — its own data and its own capabilities.`
          : `Detected: ${backend ?? 'loading…'}. Switch to point this browser at the other backend.`}
      </p>
    </div>
  );
}
