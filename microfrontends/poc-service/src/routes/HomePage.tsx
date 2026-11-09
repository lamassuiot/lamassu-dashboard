import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useShell } from '@lamassu/mfe-sdk';
import { apiGet } from '../lib/api';

/** Example page: an authenticated call to the backend through the shell's token. Replace with your own. */
export function HomePage() {
  const shell = useShell();
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<Record<string, unknown>>(shell, '/ca/v1/stats')
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [shell]);

  return (
    <div className="mfe:space-y-4">
      <h1 className="mfe:text-2xl mfe:font-semibold">PoC Service</h1>
      <p className="mfe:text-muted-foreground">Mounted by the dashboard under {shell.basePath}.</p>
      <Link to={`${shell.basePath}/detail`} className="mfe:text-primary mfe:underline">
        Go to detail
      </Link>
      <div className="mfe:rounded-lg mfe:border mfe:bg-card mfe:p-4 mfe:text-card-foreground">
        {error && <p role="alert" className="mfe:text-destructive">{error}</p>}
        {!error && !stats && <p className="mfe:text-muted-foreground">Loading…</p>}
        {stats && (
          <dl className="mfe:grid mfe:grid-cols-2 mfe:gap-2">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="mfe:contents">
                <dt className="mfe:text-muted-foreground">{key}</dt>
                <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
