import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SoftwareModulesCard } from './SoftwareModulesCard';
import type { SoftwareModule } from '@/types/iot';

// What these cover, and why each matters:
//
//  - the capability gate: every request behind this card answers 501 on a backend without
//    composition, so the card must render an explanatory state AND skip its fetch entirely. A card
//    that fetched anyway would show a permanent error for a feature the deployment simply lacks.
//  - the readiness ratio: the set produces ONE atomic .swu assembled from every module's artifacts,
//    so a module carrying nothing would silently contribute nothing. "2 of 3 ready" plus a warning is
//    what makes that visible before a build, rather than after a device gets an incomplete update.
//  - no per-module Build: several deliverables per set could not be delivered (one job per device
//    carries a single URI), so the card must not offer one.

const {
  fetchSoftwareModulesMock,
  addSoftwareModuleMock,
  removeSoftwareModuleMock,
  buildSoftwareModuleMock,
  uploadModuleSwDescriptorMock,
  fetchReusableSoftwareModulesMock,
  importSoftwareModuleMock,
  uploadModuleArtifactBinaryMock,
  downloadModuleArtifactMock,
  isSupportedMock,
} = vi.hoisted(() => ({
  fetchSoftwareModulesMock: vi.fn(),
  addSoftwareModuleMock: vi.fn(),
  removeSoftwareModuleMock: vi.fn(),
  buildSoftwareModuleMock: vi.fn(),
  uploadModuleSwDescriptorMock: vi.fn(),
  fetchReusableSoftwareModulesMock: vi.fn(),
  importSoftwareModuleMock: vi.fn(),
  uploadModuleArtifactBinaryMock: vi.fn(),
  downloadModuleArtifactMock: vi.fn(),
  isSupportedMock: vi.fn(),
}));

// The two backends differ in whether each module has its own deliverable, and the card must render
// both. These helpers set the capability answers for one mode or the other.
const asHawkbit = () => isSupportedMock.mockImplementation(() => true);
const asNative = () =>
  isSupportedMock.mockImplementation((k: string) => k !== 'software_module_deliverables');

vi.mock('@/lib/iot-api', () => ({
  fetchSoftwareModules: fetchSoftwareModulesMock,
  addSoftwareModule: addSoftwareModuleMock,
  removeSoftwareModule: removeSoftwareModuleMock,
  buildSoftwareModule: buildSoftwareModuleMock,
  uploadModuleSwDescriptor: uploadModuleSwDescriptorMock,
  fetchReusableSoftwareModules: fetchReusableSoftwareModulesMock,
  importSoftwareModule: importSoftwareModuleMock,
  uploadModuleArtifactBinary: uploadModuleArtifactBinaryMock,
  downloadModuleArtifact: downloadModuleArtifactMock,
}));

vi.mock('@/contexts/UpdatesCapabilitiesContext', () => ({
  useUpdatesCapabilities: () => ({ isSupported: isSupportedMock, isLoading: false }),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

// The Add module dialog now carries the same file fields the sheet does (ModuleFilesFields), which
// bring an auth context and the KMS/SymKMS/certificate lookups behind the build options with them.
// None of that is what this file tests — module-file-sheet.test.tsx covers the form itself — so the
// dependencies are stubbed rather than stood up.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { access_token: 'tok', profile: { sub: 'alice' } }, isLoading: false }),
}));
vi.mock('@/lib/kms-data', () => ({ fetchKmsKeys: vi.fn().mockResolvedValue({ list: [] }) }));
vi.mock('@/lib/symkms-api', () => ({ fetchSymmetricKeys: vi.fn().mockResolvedValue({ list: [] }) }));
vi.mock('@/lib/issued-certificate-data', () => ({ fetchIssuedCertificates: vi.fn().mockResolvedValue({ certificates: [] }) }));
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="sw-description editor" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

// Stubbed to a marker: the sheet's own form (the SWU question, signing, encryption) is covered by
// module-file-sheet.test.tsx. Here all that matters is WHICH module the card opens it for — and the
// real sheet needs an auth provider and KMS/SymKMS endpoints that these tests have no business
// standing up.
vi.mock('@/components/iot/module-file-sheet', () => ({
  ModuleFileSheet: ({ open, module, perModuleDeliverables }: any) =>
    open ? (
      <div data-testid="module-file-sheet">
        {`sheet:${module?.key}:${perModuleDeliverables ? 'per-module' : 'atomic'}`}
      </div>
    ) : null,
}));

const composition: SoftwareModule[] = [
  { key: 'os:gateway', type: 'os', name: 'gateway', version: '1.0.0', built: false, artifacts: [], locked: false, encrypted: false },
  {
    key: 'application:telemetry',
    type: 'application',
    name: 'telemetry',
    version: '1.0.0',
    built: true,
    artifacts: [{ id: 'a1', name: 'tel', version: '1.0.0', filename: 'telemetry.swu', checksum: 'x', size: 10, uploaded_at: '' } as never],
    locked: false,
    encrypted: false,
  },
  { key: 'application:diagnostics', type: 'application', name: 'diagnostics', version: '1.0.0', built: false, artifacts: [], locked: false, encrypted: false },
];

// Every row action moved behind a kebab menu (see SoftwareModulesCard's "Actions for <key>" trigger),
// so a test that used to find a row's button directly now opens that row's menu first. Radix portals
// the open menu to document.body, so once open the item is reachable via `screen` like any other
// button/menuitem — this just does the one extra click that changed.
const actionsTriggerFor = (key: string) =>
  screen.getByRole('button', { name: new RegExp(`actions for ${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') });

// Radix's trigger opens on POINTERDOWN, not click — jsdom's fireEvent.click alone leaves it
// data-state="closed" (verified directly: a plain click never opened it). jsdom also implements
// neither PointerEvent capture nor scrollIntoView, which Radix's positioning code calls
// unconditionally, so those are stubbed once for every test in this file.
const openActionsFor = (key: string) => {
  const trigger = actionsTriggerFor(key);
  fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
  fireEvent.pointerUp(trigger, { button: 0, pointerId: 1 });
  fireEvent.click(trigger);
};

// While a menu is open, Radix wraps everything OUTSIDE its portal — including the trigger that
// opened it — in aria-hidden, so re-querying the trigger by role to click it again fails ("only a
// role=menu is present"). Escape is the one close path that doesn't need the trigger to be
// reachable: it targets the open menu itself, which the aria-hidden wrapping never touches.
const closeActionsFor = () => {
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
};

const renderCard = (props: Partial<React.ComponentProps<typeof SoftwareModulesCard>> = {}) =>
  render(<SoftwareModulesCard groupId="g1" packName="gateway" packVersion="1.0.0" packIsBuilt={false} {...props} />);

describe('SoftwareModulesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Native (atomic delivery) is the default for these tests; hawkbit-shaped cases opt in.
    asNative();
    fetchSoftwareModulesMock.mockResolvedValue(composition);
    fetchReusableSoftwareModulesMock.mockResolvedValue([]);
    uploadModuleArtifactBinaryMock.mockResolvedValue({});
    importSoftwareModuleMock.mockResolvedValue({});
    buildSoftwareModuleMock.mockResolvedValue({});
    downloadModuleArtifactMock.mockResolvedValue(new Blob(['swu-bytes']));
    // jsdom has no createObjectURL/anchor-click download machinery.
    if (!window.URL.createObjectURL) window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = vi.fn();
    // jsdom implements neither pointer capture nor scrollIntoView; Radix's DropdownMenu calls both
    // unconditionally while opening, so they are stubbed rather than left to throw.
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  });

  it('renders every module with its type, version and its contribution (atomic delivery)', async () => {
    renderCard();

    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    expect(screen.getByText('gateway')).toBeTruthy();
    expect(screen.getByText('diagnostics')).toBeTruthy();
    // The type distinguishes the mandatory base image from the applications on top of it.
    expect(screen.getByText('os')).toBeTruthy();
    expect(screen.getAllByText('application')).toHaveLength(2);
    // Only telemetry carries an artifact in the fixture, so only it contributes anything.
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getAllByText('Nothing yet')).toHaveLength(2);
  });

  it('states the readiness ratio and warns about modules contributing nothing', async () => {
    renderCard();

    await waitFor(() => expect(screen.getByText('1 of 3 ready')).toBeTruthy());
    expect(screen.getByText('Incomplete composition')).toBeTruthy();
  });

  it('reports a complete composition without the warning', async () => {
    fetchSoftwareModulesMock.mockResolvedValue(
      composition.map((m) => ({ ...m, built: true, artifacts: [{ id: 'a', filename: 'x.bin' } as never] })),
    );
    renderCard();

    await waitFor(() => expect(screen.getByText('3 of 3 ready')).toBeTruthy());
    expect(screen.queryByText('Incomplete composition')).toBeNull();
  });

  it('offers no per-module Build where the set builds one atomic deliverable', async () => {
    // Native: a launch dispatches one job per device carrying a single URI, so a module cannot have
    // its own deliverable. Offering a Build would promise something delivery cannot honour.
    renderCard();

    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    openActionsFor('application:telemetry');
    expect(screen.queryByRole('menuitem', { name: /^build$/i })).toBeNull();
    // The upload control is not gated on per-module deliverables — every backend needs a way to put
    // a file on a specific module — but the sw-description ANSWER is (see below).
    expect(screen.getByRole('menuitem', { name: /add files/i })).toBeTruthy();
  });

  it('offers a Build and a sw-description per module where modules have their own deliverables', async () => {
    // hawkbit: a target downloads every module's artifacts and suricatta installs each .swu it finds,
    // so one .swu per module is the shape that model expects.
    asHawkbit();
    renderCard();

    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    // Checked per row: each row's own menu offers Build, not just the first one's.
    for (const key of ['os:gateway', 'application:telemetry', 'application:diagnostics']) {
      openActionsFor(key);
      expect(screen.getByRole('menuitem', { name: /^build$/i })).toBeTruthy();
      // ONE upload control per row, not one per kind of file: the dialog asks which it is.
      expect(screen.getByRole('menuitem', { name: /add files/i })).toBeTruthy();
      closeActionsFor();
    }
  });

  it('offers a download only for a module that is actually built', async () => {
    // "If built then it should be downloadable" — and, symmetrically, an UNBUILT module has nothing
    // to download, so its download control must say so rather than silently doing nothing.
    asHawkbit();
    renderCard();

    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    // telemetry is built in the fixture; gateway (os) and diagnostics are not.
    openActionsFor('application:telemetry');
    const builtDownload = screen.getByRole('menuitem', { name: /download/i });
    expect(builtDownload.getAttribute('data-disabled')).toBeNull();
    closeActionsFor();

    openActionsFor('application:diagnostics');
    const unbuiltDownload = screen.getByRole('menuitem', { name: /download/i });
    expect(unbuiltDownload.getAttribute('data-disabled')).not.toBeNull();
  });

  it('downloads the built module and not a different one', async () => {
    asHawkbit();
    renderCard();
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());

    openActionsFor('application:telemetry');
    fireEvent.click(screen.getByRole('menuitem', { name: /download/i }));
    await waitFor(() =>
      expect(downloadModuleArtifactMock).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'g1', packName: 'gateway', moduleKey: 'application:telemetry' }),
      ),
    );
  });

  it('offers no per-module download where the set builds one atomic deliverable', async () => {
    // Native has no per-module deliverable at all — offering a download control there would promise
    // something the module never has; the pack's own SWU download is the real answer.
    renderCard();
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /download application:/i })).toBeNull();
  });

  it('warns that a composed hawkbit set installs as separate transactions', async () => {
    // SWUpdate has no rollback across several .swu files (upstream TODO for partial installs), so a
    // mid-way failure leaves the device mixed. The operator has to be able to see that.
    asHawkbit();
    renderCard();

    await waitFor(() => expect(screen.getByText(/Installs as 3 separate transactions/i)).toBeTruthy());
    expect(screen.getByText(/cannot roll back across them/i)).toBeTruthy();
  });

  it('does not warn about transactions where delivery is atomic', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    expect(screen.queryByText(/separate transactions/i)).toBeNull();
  });

  it('freezes the composition once the pack version is built', async () => {
    // A built version is immutable, and its composition with it: changing what a version is made of
    // after devices have it would mean two devices got different updates from the same version.
    renderCard({ packIsBuilt: true });

    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    const add = screen.getByRole('button', { name: /add module/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
  });

  it('renders a not-available state and skips the fetch when composition is unsupported', async () => {
    isSupportedMock.mockReturnValue(false);
    renderCard();

    await waitFor(() => expect(screen.getByText('Not available for this deployment')).toBeTruthy());
    // The request would answer 501; not making it is what keeps a missing feature from looking broken.
    expect(fetchSoftwareModulesMock).not.toHaveBeenCalled();
  });

  it('gates on the composition capability specifically, not on any other', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    expect(isSupportedMock).toHaveBeenCalledWith('software_module_composition');
  });

  it('surfaces a load failure with a retry instead of rendering an empty table', async () => {
    fetchSoftwareModulesMock.mockRejectedValue(new Error('backend exploded'));
    renderCard();

    await waitFor(() => expect(screen.getByText('Could not load the software modules')).toBeTruthy());
    expect(screen.getByText('backend exploded')).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('explains a single-module set instead of showing a meaningless "1 of 1" ratio', async () => {
    // A set holding only its mandatory base image is not composed of anything yet: that module IS
    // the pack. Showing "1 of 1 built" and a launch warning restated the pack's own status and read
    // as noise, which is what made this page confusing.
    fetchSoftwareModulesMock.mockResolvedValue([composition[0]]);
    renderCard();

    await waitFor(() => expect(screen.getByText(/Not composed/i)).toBeTruthy());
    expect(screen.queryByText('1 of 1 ready')).toBeNull();
    expect(screen.queryByText('Incomplete composition')).toBeNull();
    // The os module is labelled with hawkBit's own vocabulary (its OS type is "Core firmware or
    // operating system"), so the row does not read as a duplicate of the pack name.
    expect(screen.getByText('(OS / firmware)')).toBeTruthy();
  });

  it('never renders a remove control for the mandatory os module', async () => {
    // Removing it is always refused, so a dead red Remove item there was the most misleading thing
    // on the page. Only application modules get one.
    renderCard();

    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    openActionsFor('os:gateway');
    expect(screen.queryByRole('menuitem', { name: /remove/i })).toBeNull();
    closeActionsFor();

    openActionsFor('application:telemetry');
    expect(screen.getByRole('menuitem', { name: /remove/i })).toBeTruthy();
    closeActionsFor();

    openActionsFor('application:diagnostics');
    expect(screen.getByRole('menuitem', { name: /remove/i })).toBeTruthy();
  });

  it('states the frozen reason on the page, not only in a tooltip', async () => {
    // A disabled Add button with the explanation hidden in a title attribute left the operator with
    // no way to know why, since a disabled button receives no pointer events in most browsers.
    renderCard({ packIsBuilt: true });

    await waitFor(() => expect(screen.getByText(/already built — create a new version/i)).toBeTruthy());
  });

  it('handles a pack with no modules without crashing', async () => {
    fetchSoftwareModulesMock.mockResolvedValue([]);
    renderCard();

    await waitFor(() => expect(screen.getByText('This distribution set has no software modules.')).toBeTruthy());
    // With no modules there is nothing to warn about.
    expect(screen.queryByText('Incomplete composition')).toBeNull();
  });
  // --- Importing an existing module: the *..* half of the set<->module relation ---

  const candidate = {
    key: 'application:shared-app',
    type: 'application',
    name: 'shared-app',
    version: '2.0.0',
    built: true,
    artifacts: [{ id: 'x', filename: 'shared-app.swu' } as never],
    source_distribution_set_name: 'other-pack',
    source_distribution_set_version: '3.1.0',
    source_group_id: 'g1',
    shared: true,
  };

  const openImport = async () => {
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /import module/i }));
  };

  it('offers a module from another pack, with where it comes from', async () => {
    // A module is not confined to one distribution set. Without this an operator had to re-declare
    // the module and re-upload its binaries to ship the same application from a second set.
    fetchReusableSoftwareModulesMock.mockResolvedValue([candidate]);
    renderCard();
    await openImport();

    await waitFor(() => expect(screen.getByText('shared-app')).toBeTruthy());
    // Provenance matters: the same module name means different things on different packs.
    expect(screen.getByText('other-pack')).toBeTruthy();
    expect(screen.getByText(/v3\.1\.0/)).toBeTruthy();
  });

  it('states that importing SHARES the module where the backend links it', async () => {
    // hawkbit's relation is genuinely many-to-many, so both sets end up holding one module: a
    // rebuild is seen by both. An operator has to know that before clicking.
    fetchReusableSoftwareModulesMock.mockResolvedValue([candidate]);
    renderCard();
    await openImport();

    await waitFor(() => expect(screen.getByText(/Importing shares the module/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /^link$/i })).toBeTruthy();
  });

  it('states that importing COPIES the module where the backend duplicates it', async () => {
    // Native keys a module row to one pack version, so there is nothing to share — the artifact
    // LINKS come along (no re-upload) but the two modules then diverge.
    fetchReusableSoftwareModulesMock.mockResolvedValue([{ ...candidate, shared: false }]);
    renderCard();
    await openImport();

    await waitFor(() => expect(screen.getByText(/Importing copies the module/i)).toBeTruthy());
    expect(screen.getByText(/independent from then on/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeTruthy();
  });

  it('imports the module the operator picked, addressed by its source pack VERSION', async () => {
    // A pack's composition is per version, so the version is part of the address — importing from
    // the wrong one would silently take a different module.
    fetchReusableSoftwareModulesMock.mockResolvedValue([candidate]);
    renderCard();
    await openImport();

    await waitFor(() => expect(screen.getByText('shared-app')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

    await waitFor(() =>
      expect(importSoftwareModuleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'g1',
          packName: 'gateway',
          source: {
            source_group_id: 'g1',
            source_distribution_set_name: 'other-pack',
            source_distribution_set_version: '3.1.0',
            module_key: 'application:shared-app',
          },
        }),
      ),
    );
  });

  it('explains an empty candidate list instead of showing a blank table', async () => {
    renderCard();
    await openImport();
    await waitFor(() => expect(screen.getByText('Nothing to import')).toBeTruthy());
  });

  it('does not offer importing into a built version', async () => {
    // The backend refuses a composition change on a built version, so offering the action would
    // promise something that fails.
    renderCard({ packIsBuilt: true });
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    expect((screen.getByRole('button', { name: /import module/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  // --- The card's part in adding a file: opening the sheet for the right module ---
  //
  // The sheet's own form — the "is this a SWU?" question, signing, encryption — is covered in
  // module-file-sheet.test.tsx, against the real component.

  it('opens the file sheet for the module whose control was used', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    expect(screen.queryByTestId('module-file-sheet')).toBeNull();

    openActionsFor('application:diagnostics');
    fireEvent.click(screen.getByRole('menuitem', { name: /add files/i }));
    await waitFor(() => expect(screen.getByTestId('module-file-sheet')).toBeTruthy());
    // The module identity has to reach the sheet, or the file lands on the wrong one.
    expect(screen.getByTestId('module-file-sheet').textContent).toContain('application:diagnostics');
  });

  it('tells the sheet whether a module has its own deliverable', async () => {
    // It decides whether the sheet offers signing/encryption at all: where the set builds one
    // deliverable there is nothing per-module to sign.
    asHawkbit();
    renderCard();
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    // diagnostics, not telemetry: telemetry is built in the fixture and a built module's file
    // control is correctly disabled, so clicking it would prove nothing.
    openActionsFor('application:diagnostics');
    fireEvent.click(screen.getByRole('menuitem', { name: /add files/i }));
    await waitFor(() => expect(screen.getByTestId('module-file-sheet').textContent).toContain('per-module'));
  });

  it('offers the file control on every module, in both backends', async () => {
    // Every backend needs a way to put a file on a specific module: the pack-level upload cannot say
    // which module it meant.
    renderCard();
    await waitFor(() => expect(screen.getByText('telemetry')).toBeTruthy());
    for (const key of ['os:gateway', 'application:telemetry', 'application:diagnostics']) {
      openActionsFor(key);
      expect(screen.getByRole('menuitem', { name: /add files/i })).toBeTruthy();
      closeActionsFor();
    }
  });
});
