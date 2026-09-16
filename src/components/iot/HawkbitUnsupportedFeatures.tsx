'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CircleSlash, ExternalLink } from 'lucide-react';
import { useUpdatesCapabilities } from '@/contexts/UpdatesCapabilitiesContext';

// What hawkBit can do that this platform does NOT drive, stated in the product rather than left for
// an operator to discover by not finding it.
//
// Everything listed here was confirmed present on the live hawkBit (its endpoint or tenant-config key
// answers) and confirmed absent from internal/hawkbitupdates (the adapter never sends the field or
// calls the endpoint). It is deliberately NOT a roadmap: the point is that an operator who knows
// hawkBit can see which of its knobs this UI leaves at hawkBit's defaults, and go set them in
// hawkBit's own console if they need them.
//
// Kept as data so it stays honest: each entry says what the feature does and what happens today
// without it, not just a name.
type Feature = {
  name: string;
  /** hawkBit's own field or endpoint, so an operator can find it in hawkBit's console/API. */
  api: string;
  /** What it does in hawkBit. */
  does: string;
  /** What this platform does instead, today. */
  today: string;
};

const ROLLOUT_FEATURES: Feature[] = [
  {
    name: 'Rollout approval',
    api: 'rollout.approval.enabled + POST /rollouts/{id}/approve|deny',
    does: 'Requires an operator to approve (or deny, with a remark) a rollout before it may start.',
    today: 'Not driven here. If the tenant setting is on, campaigns will sit unapproved with no way to approve them from this UI. Note this is unrelated to the campaign "approval threshold" here, which is a per-batch success percentage.',
  },
  {
    name: 'User consent / confirmation flow',
    api: 'user.confirmation.flow.enabled, confirmationRequired, /targets/{id}/autoConfirm',
    does: 'Makes a device (or its operator) explicitly confirm an update before it installs, independently of the action type.',
    today: 'Never set, so hawkBit’s tenant default applies. The closest thing this UI exposes is the Phased workflow, which sends the "soft" action type.',
  },
  {
    name: 'Maintenance window',
    api: 'maintenanceWindow on POST /targets/{id}/assignedDS (Quartz cron + HH:mm:ss duration + UTC offset)',
    does: 'Separates download from install: the device may fetch now but install only inside the window, and hawkBit cancels the action once every window has lapsed.',
    today: 'Not sent — and note hawkBit accepts it only on a direct assignment, not on a rollout, so a campaign could not carry one even if this UI offered it. SWUpdate’s suricatta also ignores the field, so it would affect only other DDI clients.',
  },
  {
    name: 'Time-forced action type',
    api: 'actionType "timeforced" + forcetime',
    does: 'Starts soft (the device may postpone), then becomes forced automatically once the forcetime timestamp passes.',
    today: 'Not offered. The workflow picker maps only to forced (Direct) and soft (Phased), and forcetime is never sent — so there is no deadline-based escalation.',
  },
  {
    name: 'Download-only action type',
    api: 'actionType "downloadonly"',
    does: 'Has the device fetch the artifacts but never install them, so an install can be triggered later.',
    today: 'Not offered.',
  },
  {
    name: 'Dynamic rollout groups',
    api: 'dynamic + dynamicGroupTemplate on a rollout',
    does: 'Keeps a rollout open so targets that start matching later are absorbed into new groups automatically.',
    today: 'Only static rollouts are created: hawkBit computes the groups once, so a device added to the group after a campaign starts is not picked up. This is why adding devices to a running campaign is reported as unsupported.',
  },
  {
    name: 'Per-rollout weight / priority',
    api: 'weight on a rollout or assignment',
    does: 'Arbitrates between competing actions when a device has more than one pending.',
    today: 'Deliberately not sent. A campaign here carries a weight, but nothing reads it in either backend — forwarding it to hawkBit alone would make the same campaign behave differently per backend.',
  },
];

const ROLLOUT_LIFECYCLE: Feature[] = [
  {
    name: 'Stop and retry a rollout',
    api: 'POST /rollouts/{id}/stop, /rollouts/{id}/retry',
    does: 'Halts a rollout outright, or retries one that finished with failures.',
    today: 'Campaigns here support pause, resume, cancel and retrying failed devices, which cover the same ground through this platform\u2019s own launch model rather than these endpoints.',
  },
  {
    name: 'Edit a running rollout',
    api: 'PUT /rollouts/{id}',
    does: 'Updates some rollout fields after creation.',
    today: 'Not used, and group membership/thresholds genuinely cannot be recomposed after creation \u2014 which is why editing a campaign\u2019s strategy is reported as unsupported.',
  },
];

const TARGET_FEATURES: Feature[] = [
  {
    name: 'Target filters with auto-assignment',
    api: '/rest/v1/autoassignments (supersedes the deprecated /targetfilters/{id}/autoAssignDS)',
    does: 'Saves a target query and has hawkBit keep assigning a distribution set to every target that matches — re-evaluated continuously (a scheduler runs about every 2s), so newly registered devices are picked up on their own.',
    today: 'Not used. Grouping here is a target tag (group:<id>) and assignment happens only when a campaign runs, so a device added later needs a new campaign. This is the closest hawkBit equivalent to "keep this fleet on this version".',
  },
  {
    name: 'Target types',
    api: 'GET/POST /targettypes',
    does: 'Restricts which distribution set types a target may receive, so an incompatible set cannot be assigned.',
    today: 'Not used; every target accepts any set this platform creates.',
  },
  {
    name: 'Target attributes',
    api: 'controllerAttributes, requestAttributes',
    does: 'Device-reported key/values (hardware revision, installed versions) usable in RSQL filters.',
    today: 'Not read or filtered on. Device inventory here comes from this platform’s own records.',
  },
];

const SET_FEATURES: Feature[] = [
  {
    name: 'Required migration step',
    api: 'requiredMigrationStep on a distribution set',
    does: 'Marks a set as a mandatory migration that cannot be skipped by a later assignment.',
    today: 'Never set (defaults to false).',
  },
  {
    name: 'Explicit locking',
    api: 'implicit.lock.enabled, locked on a set/module',
    does: 'Freezes a set or module against further change once it is in use.',
    today: 'Relied on implicitly — the UI reports a version as frozen once built, and hawkBit locks a set on first assignment, but the flag is not managed here.',
  },
  {
    name: 'Action cleanup',
    api: 'action.cleanup.auto.expiry / .status / onQuotaHit.percent',
    does: 'Automatically purges old actions after an expiry, keeping the action log bounded.',
    today: 'Left at hawkBit’s tenant default; not configurable from this UI.',
  },
  {
    name: 'Polling intervals',
    api: 'pollingTime, pollingOverdueTime, maintenanceWindowPollCount',
    does: 'Controls how often a device polls the DDI API and when hawkBit considers it overdue.',
    today: 'Left at hawkBit’s tenant default. This matters for how quickly a campaign reaches devices.',
  },
];

function FeatureList({ title, features }: { title: string; features: Feature[] }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="divide-y border-t">
        {features.map((f) => (
          <div key={f.name} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{f.name}</span>
              <Badge variant="outline" className="font-mono text-[10px]">{f.api}</Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{f.does}</p>
            <p className="mt-1 text-xs">
              <span className="font-medium text-muted-foreground">Here: </span>
              <span className="text-muted-foreground">{f.today}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// HawkbitUnsupportedFeatures lists hawkBit configuration this platform leaves at hawkBit's defaults.
// Renders only in hawkbit mode — in native mode there is no hawkBit to compare against.
export function HawkbitUnsupportedFeatures() {
  const { backend } = useUpdatesCapabilities();
  if (backend !== 'hawkbit') return null;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">hawkBit configuration not driven from here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This deployment talks to hawkBit, which has options this platform does not set. They stay at
            hawkBit&apos;s own defaults and can be changed in hawkBit&apos;s console or Management API — nothing below is
            broken, it is simply not managed here.
          </p>
        </div>
      </div>

      <FeatureList title="Rollouts and deployment" features={ROLLOUT_FEATURES} />
      <FeatureList title="Rollout lifecycle" features={ROLLOUT_LIFECYCLE} />
      <FeatureList title="Targets and grouping" features={TARGET_FEATURES} />
      <FeatureList title="Distribution sets and tenant settings" features={SET_FEATURES} />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ExternalLink className="h-3 w-3" />
        Field and endpoint names above are hawkBit&apos;s own, so they can be looked up directly in its
        Management API.
      </p>
    </div>
  );
}
