import type React from 'react';
import { Activity, Blocks, Cloud, Cpu, Database, FileText, FlaskConical, KeyRound, Network, Puzzle, Server, ShieldCheck } from 'lucide-react';

/**
 * Icons a module's manifest may name (`nav.icon`, kebab-case lucide names). A curated map instead of
 * the full lucide set keeps the shell bundle small; add entries here when a module needs another icon.
 */
const MODULE_ICONS: Record<string, React.ElementType> = {
  activity: Activity,
  blocks: Blocks,
  cloud: Cloud,
  cpu: Cpu,
  database: Database,
  'file-text': FileText,
  'flask-conical': FlaskConical,
  'key-round': KeyRound,
  network: Network,
  puzzle: Puzzle,
  server: Server,
  'shield-check': ShieldCheck,
};

export function resolveModuleIcon(name?: string): React.ElementType {
  return (name !== undefined && Object.hasOwn(MODULE_ICONS, name) ? MODULE_ICONS[name] : undefined) ?? Puzzle;
}
