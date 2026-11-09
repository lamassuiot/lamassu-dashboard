import type React from 'react';
import type { ModuleDescriptor } from '@lamassu/mfe-sdk';
import { resolveModuleIcon } from '@/lib/module-icons';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  devOnly?: boolean;
  /** If set, the item is only shown when the user has "ui" in global_actions for this capability key (e.g. "pki.ca.ca_certificate") */
  uiAuthzCapabilities?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
  devOnly?: boolean;
}

/**
 * Adds the external modules' entries to the built-in navigation without mutating it.
 * A module joins the group with the same label, or a new group placed after all existing ones;
 * a module whose `basePath` equals an existing item's `href` is skipped.
 */
export function mergeNavigation(base: NavGroup[], modules: ModuleDescriptor[]): NavGroup[] {
  const groups = base.map((group) => ({ ...group, items: [...group.items] }));
  const hrefs = new Set(groups.flatMap((group) => group.items.map((item) => item.href)));

  for (const module of modules) {
    if (hrefs.has(module.basePath)) continue;
    hrefs.add(module.basePath);

    let group = groups.find((candidate) => candidate.label === module.nav.group);
    if (!group) {
      group = { label: module.nav.group, items: [] };
      groups.push(group);
    }
    group.items.push({
      href: module.basePath,
      label: module.nav.label,
      icon: resolveModuleIcon(module.nav.icon),
      uiAuthzCapabilities: module.nav.uiAuthzCapabilities,
    });
  }

  return groups;
}
