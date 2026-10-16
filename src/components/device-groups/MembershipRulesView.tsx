'use client';

import Link from '@/components/shared/RouterLink';
import { Layers } from 'lucide-react';
import { normalizeFilterCriteria } from '@/lib/device-groups-utils';
import type { DeviceGroup, DeviceGroupFilterOption } from '@/types/device-group';
import { AndConnector, CriteriaRuleList } from './CriteriaRuleList';

interface RuleBlock {
  key: string;
  source: DeviceGroup | null;
  rules: DeviceGroupFilterOption[];
}

/**
 * Splits the backend's flat `inherited_criteria` back into one block per ancestor.
 * Falls back to a single unattributed block when the ancestor chain does not add up
 * (e.g. the group list could not be loaded).
 */
function buildInheritedBlocks(group: DeviceGroup, ancestors: DeviceGroup[]): RuleBlock[] {
  const inherited = normalizeFilterCriteria(group.inherited_criteria ?? []);
  if (inherited.length === 0) return [];

  const perAncestor = ancestors
    .map((ancestor) => ({ key: ancestor.id, source: ancestor, rules: normalizeFilterCriteria(ancestor.criteria ?? []) }))
    .filter((block) => block.rules.length > 0);
  const attributedCount = perAncestor.reduce((sum, block) => sum + block.rules.length, 0);

  return attributedCount === inherited.length ? perAncestor : [{ key: 'inherited', source: null, rules: inherited }];
}

interface MembershipRulesViewProps {
  group: DeviceGroup;
  /** Root-first ancestor chain, with each ancestor's own rules in `criteria`. */
  ancestors: DeviceGroup[];
}

export function MembershipRulesView({ group, ancestors }: Readonly<MembershipRulesViewProps>) {
  const ownRules = normalizeFilterCriteria(group.criteria ?? []);
  const inheritedBlocks = buildInheritedBlocks(group, ancestors);
  const inheritedCount = inheritedBlocks.reduce((sum, block) => sum + block.rules.length, 0);
  const totalCount = ownRules.length + inheritedCount;

  return (
    <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
      <div>
        <p className="font-semibold">Membership Rules</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A device belongs to this group when it matches <span className="font-medium text-foreground">every</span> rule below,
          including the rules inherited from parent groups. Membership updates automatically as devices change.
        </p>
      </div>

      <div className="space-y-5 lg:col-span-2">
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          {totalCount === 0 ? (
            <p>No rules apply, so this group matches <span className="font-medium">every device</span> in the system.</p>
          ) : (
            <p>
              Devices must match <span className="font-medium">{totalCount} rule{totalCount === 1 ? '' : 's'}</span>
              {inheritedCount > 0 && (
                <span className="text-muted-foreground"> ({ownRules.length} own, {inheritedCount} inherited)</span>
              )}
              .
            </p>
          )}
        </div>

        {inheritedBlocks.map((block, index) => (
          <section key={block.key} aria-label={block.source ? `Rules inherited from ${block.source.name}` : 'Inherited rules'}>
            {index > 0 && <AndConnector className="-mt-3 mb-2" />}
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Inherited from{' '}
              {block.source ? (
                <Link href={`/device-groups/details?groupId=${block.source.id}`} className="text-primary hover:underline">
                  {block.source.name}
                </Link>
              ) : (
                'parent groups'
              )}
            </p>
            <CriteriaRuleList criteria={block.rules} inherited />
          </section>
        ))}

        <section aria-label="Rules defined by this group">
          {inheritedBlocks.length > 0 && <AndConnector className="-mt-3 mb-2" />}
          <p className="mb-2 text-xs font-medium text-muted-foreground">Defined by this group</p>
          {ownRules.length > 0 ? (
            <CriteriaRuleList criteria={ownRules} />
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {inheritedCount > 0
                ? 'No additional rules. This group contains every device of its parent.'
                : 'No rules defined.'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
