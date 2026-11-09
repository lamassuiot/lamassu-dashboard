import { Link } from 'react-router';
import { useShell } from '@lamassu/mfe-sdk';

/** Second page: shows what the shell provides and proves sub-routes use the shell's router. */
export function DetailPage() {
  const shell = useShell();
  return (
    <div className="mfe:space-y-4">
      <h1 className="mfe:text-2xl mfe:font-semibold">PoC Service detail</h1>
      <dl className="mfe:grid mfe:grid-cols-2 mfe:gap-2 mfe:rounded-lg mfe:border mfe:bg-card mfe:p-4 mfe:text-card-foreground">
        <dt className="mfe:text-muted-foreground">basePath</dt>
        <dd>{shell.basePath}</dd>
        <dt className="mfe:text-muted-foreground">theme</dt>
        <dd>{shell.theme}</dd>
        <dt className="mfe:text-muted-foreground">can view CAs</dt>
        <dd data-testid="can-view-cas">{shell.hasCapability('pki.ca.ca_certificate') ? 'yes' : 'no'}</dd>
      </dl>
      <Link to={shell.basePath} className="mfe:text-primary mfe:underline">
        Back to PoC Service
      </Link>
    </div>
  );
}
