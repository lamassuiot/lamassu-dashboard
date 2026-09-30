import { Badge } from '@/components/ui/badge';

/** Principal chip: name plus its always-visible ID, so same-named principals stay distinguishable. */
export function PrincipalBadge({ id, name }: Readonly<{ id: string; name?: string }>) {
  return (
    <Badge variant="secondary" title={id} className="max-w-full">
      {name && <span className="truncate text-foreground">{name}</span>}
      <span className="truncate font-mono">{id}</span>
    </Badge>
  );
}
