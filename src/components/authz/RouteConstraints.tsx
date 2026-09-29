import { Badge } from '@/components/ui/badge';
import { describeRouteConstraint, formatRouteConstraint } from '@/lib/http-route-constraints';
import type { HTTPSchemaRoute } from '@/types/authz';

/** What a route requires beyond the policy grant: subject-bound request values, or no authz at all. */
export function RouteConstraints({ route, emptyLabel = '—' }: { route: HTTPSchemaRoute; emptyLabel?: string }) {
  if (route.skip_authz) {
    return (
      <Badge variant="secondary" title="Any authenticated subject can call this route; policies do not apply.">
        Always allowed
      </Badge>
    );
  }

  const constraints = route.constraints ?? [];
  if (constraints.length === 0) return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;

  return (
    <div className="space-y-1">
      {constraints.map((constraint, i) => {
        const { source, field, attribute } = describeRouteConstraint(constraint);
        return (
          <div
            key={i}
            className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs"
            title={`Request ${formatRouteConstraint(constraint)}`}
          >
            <Badge variant="outline" className="shrink-0 px-1.5 text-[10px]">
              {source}
            </Badge>
            <span className="break-all font-mono">{field}</span>
            <span className="shrink-0 text-muted-foreground">=</span>
            <span className="break-all font-mono text-muted-foreground">subject.{attribute}</span>
          </div>
        );
      })}
    </div>
  );
}
