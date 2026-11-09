import { loadRemote, registerRemotes } from '@module-federation/runtime';
import type { ModuleDefinition, ModuleDescriptor } from '@lamassu/mfe-sdk';

/** Registers the manifest's modules as Module Federation remotes (nothing is downloaded yet). */
export function registerModuleRemotes(modules: ModuleDescriptor[]): void {
  if (modules.length === 0) return;
  registerRemotes(
    modules.map((module) => ({
      name: module.name,
      entry: new URL(module.entry, window.location.origin).href,
      type: 'module' as const,
    })),
  );
}

/** Downloads a registered remote and returns its exposed `./module` definition. */
export async function loadModuleDefinition(name: string): Promise<ModuleDefinition> {
  const loaded = await loadRemote<{ default?: ModuleDefinition }>(`${name}/module`);
  if (!loaded?.default) {
    throw new Error(`Module "${name}" did not load or has no default export.`);
  }
  return loaded.default;
}
