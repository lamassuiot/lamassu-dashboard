/**
 * Drives the dashboard's OWN API client against a live backend, once per backend.
 *
 * This is not a unit test and is excluded from `npm test` by its filename (double underscore) — it
 * needs both backends and a hawkBit running, so it is opt-in:
 *
 *   OTA_E2E=1 npx vitest run src/lib/__backend-e2e.test.ts
 *
 * Why go through src/lib/iot-api.ts rather than curl: the point is to exercise what the UI actually
 * sends. Every call below is the same function the React components call, so a payload the UI gets
 * wrong shows up here, and a backend that only works when driven by hand does not pass.
 *
 * The base URL is resolved from window.lamassuConfig exactly as the browser resolves it (see
 * api-domains.ts), which is why each backend just needs that one global rewritten.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createUpdatePack,
  fetchSoftwareModules,
  addSoftwareModule,
  uploadModuleArtifactBinary,
  buildSoftwareModule,
  uploadModuleSwDescriptor,
  uploadPackDescriptor,
  generateSwu,
  createCampaign,
  triggerItemRollout,
  fetchUpdatePacks,
} from './iot-api';

const RUN = process.env.OTA_E2E === '1';

type Backend = {
  label: string;
  updatesApi: string;
  group: string;
  /** software_module_deliverables: hawkbit builds per module, native builds the whole set. */
  perModuleBuild: boolean;
};

const BACKENDS: Backend[] = [
  {
    label: 'native',
    updatesApi: 'http://localhost:10190',
    // A DEVICE GROUP uuid, not a DMS id. The two backends genuinely disagree about what a group id
    // is: native resolves it through the device manager's GetDevicesByGroup (service.go:182), so a
    // non-uuid fails with `invalid input syntax for type uuid`, while hawkbit mode treats the same
    // string as an opaque hawkBit target tag and accepts anything. A device-group uuid is the one
    // form BOTH backends resolve, which is what makes this the id to use.
    group: '11111111-1111-4111-8111-000000000005',
    perModuleBuild: false,
  },
  {
    label: 'hawkbit',
    updatesApi: 'http://localhost:10091',
    // The device group whose members are the real SWUpdate containers, so a campaign here reaches
    // hardware rather than inventory-only records.
    group: '11111111-1111-4111-8111-000000000005',
    perModuleBuild: true,
  },
];

/** Point the UI's own base-URL resolver at one backend, the way config.js does in the browser. */
function useBackend(b: Backend) {
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as any).window.lamassuConfig = {
    LAMASSU_API: 'http://localhost:8080/api',
    LAMASSU_UPDATES_API: b.updatesApi,
    // Mirrors public/config.js on this dev stack. isAuthEnabled() treats anything but an explicit
    // false as auth-on, and apiFetch then throws "User not authenticated" before any request goes
    // out — so omitting this does not test an unauthenticated backend, it tests nothing at all.
    LAMASSU_AUTH_ENABLED: false,
  };
}

/** A minimal swupdate descriptor, enough for a module build to have something to assemble. */
function swDescriptionFor(moduleKey: string, payloadFilename: string): string {
  const name = moduleKey.split(':').slice(1).join(':') || moduleKey;
  return `software =
{
\tversion = "1.0.0";
\tdescription = "UI e2e module ${name}";
\thardware-compatibility: [ "1.0" ];
\timages: (
\t\t{
\t\t\tfilename = "${payloadFilename}";
\t\t\tpath = "/web/${name}.bin";
\t\t\ttype = "rawfile";
\t\t}
\t);
}
`;
}

function fileFrom(name: string, body: string): File {
  return new File([body], name, { type: 'application/octet-stream' });
}

const stamp = Date.now();

describe.runIf(RUN)('campaign lifecycle through the dashboard API client', () => {
  beforeAll(() => {
    // apiFetch reads an access token when one is present; these dev backends run unauthenticated.
    (globalThis as any).window = (globalThis as any).window ?? {};
  });

  for (const backend of BACKENDS) {
    describe(backend.label, () => {
      const packName = `ui-e2e-${backend.label}-${stamp}`;
      const version = '1.0.0';
      const osKey = `os:${packName}`;
      const appKey = `application:extra-app`;

      it('creates a distribution set', async () => {
        useBackend(backend);
        const created = await createUpdatePack({
          groupId: backend.group,
          payload: {
            name: packName,
            group_id: backend.group,
            version,
            type: 'rawfile',
            packaging: 'swu',
          } as any,
        });
        expect(created).toBeTruthy();

        const packs = await fetchUpdatePacks({ groupId: backend.group }, { pageSize: 200 } as any);
        const names = (packs?.list ?? []).map((p: any) => p.name);
        expect(names).toContain(packName);
      });

      it('lists the mandatory os module the backend created with the set', async () => {
        useBackend(backend);
        const modules = await fetchSoftwareModules({ groupId: backend.group, packName });
        // Every set is born with exactly one 'os' module — this is the composition anchor, and the
        // reason the UI offers only 'application' when adding (SoftwareModulesCard's ADDABLE_TYPE).
        expect(modules.length).toBeGreaterThanOrEqual(1);
        expect(modules.some((m: any) => m.type === 'os')).toBe(true);
      });

      it('adds a second module (application) to the composition', async () => {
        useBackend(backend);
        await addSoftwareModule({
          groupId: backend.group,
          packName,
          module: { type: 'application', name: 'extra-app', version } as any,
        });
        const modules = await fetchSoftwareModules({ groupId: backend.group, packName });
        expect(modules.map((m: any) => `${m.type}:${m.name}`)).toContain(appKey);
      });

      // Artifact names are FLEET-WIDE, not scoped to the pack: uploading 'firmware' v1.0.0 a second
      // time anywhere fails with "must be greater than the current latest version". Stamping the name
      // keeps each run independent.
      it('uploads a binary to each module', async () => {
        useBackend(backend);
        await uploadModuleArtifactBinary({
          groupId: backend.group,
          packName,
          moduleKey: osKey,
          file: fileFrom('firmware.bin', `os payload ${stamp}`),
          artifactName: `firmware-${stamp}`,
          version,
        });
        await uploadModuleArtifactBinary({
          groupId: backend.group,
          packName,
          moduleKey: appKey,
          file: fileFrom('app.bin', `app payload ${stamp}`),
          artifactName: `app-${stamp}`,
          version,
        });
        const modules = await fetchSoftwareModules({ groupId: backend.group, packName });
        for (const m of modules as any[]) {
          expect(m.artifacts?.length ?? 0).toBeGreaterThan(0);
        }
      });

      it('builds the deliverable the way this backend builds', async () => {
        useBackend(backend);
        const modules = (await fetchSoftwareModules({ groupId: backend.group, packName })) as any[];

        if (backend.perModuleBuild) {
          // hawkbit: each module carries its own .swu, because a target downloads every module's
          // artifacts as separate deployment chunks. Each therefore needs its OWN sw-description —
          // the build refuses without one, since there is no set-level descriptor to fall back to
          // when the set is not what gets built.
          //
          // The descriptor's `filename` must name the artifact actually on the module (the uploaded
          // FILE name, not the catalogue artifact_name). Naming anything else fails inside
          // swugenerator with a bare "exit status 22" that says nothing about the mismatch.
          for (const mod of modules) {
            const payloadFilename = mod.artifacts?.[0]?.filename;
            expect(payloadFilename, `module ${mod.key} has no artifact to build from`).toBeTruthy();
            await uploadModuleSwDescriptor({
              groupId: backend.group,
              packName,
              moduleKey: mod.key,
              file: fileFrom('sw-description', swDescriptionFor(mod.key, payloadFilename)),
            });
            await buildSoftwareModule({ groupId: backend.group, packName, moduleKey: mod.key, payload: {} as any });
          }
        } else {
          // native: the SET builds one atomic .swu from every module's artifacts, so the build action
          // is Generate SWU on the pack — buildSoftwareModule would answer 501 here.
          //
          // selected_artifact_ids is not optional: uploading a binary only puts it in the fleet-wide
          // catalogue and links it to a module. CreateSWU is what STAGES the selected artifacts into
          // the build directory, so an empty selection builds from an empty directory and fails with
          // "failed to read binaries directory ... no such file or directory". This mirrors what the
          // Generate SWU dialog sends (generate-swu-dialog.tsx).
          const artifactIds = modules.flatMap((m) => (m.artifacts ?? []).map((a: any) => a.id));
          expect(artifactIds.length).toBeGreaterThan(0);

          // The set builds ONE deliverable, so the descriptor belongs to the pack rather than to any
          // module — the module-level upload answers 501 on this backend.
          await uploadPackDescriptor({
            groupId: backend.group,
            packName,
            file: fileFrom('sw-description', swDescriptionFor(osKey, 'firmware.bin')),
          } as any);

          await generateSwu({
            groupId: backend.group,
            packName,
            userId: 'e2e',
            payload: { selected_artifact_ids: artifactIds } as any,
          });
        }
        const packs = await fetchUpdatePacks({ groupId: backend.group }, { pageSize: 200 } as any);
        const pack = (packs?.list ?? []).find((p: any) => p.name === packName);
        expect(pack?.status).toBe('built');
      });

      it('creates and rolls out a campaign', async () => {
        useBackend(backend);
        const created = await createCampaign({
          groupId: backend.group,
          campaignData: {
            update_pack_name: packName,
            workflow_type: 'direct',
            rollout_type: 'percentage',
            rollout_value: 100,
            auto: true,
            name: `UI e2e ${backend.label} ${stamp}`,
          } as any,
        });
        const launchId = created?.launch_id ?? created?.id;
        expect(launchId).toBeTruthy();
        await triggerItemRollout({ groupId: backend.group, launchId: String(launchId) });
      });
    });
  }
});
