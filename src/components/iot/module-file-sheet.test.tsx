import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModuleFileSheet } from './module-file-sheet';
import type { SoftwareModule } from '@/types/iot';

// What these cover, and why each matters:
//
//  - the build-vs-deliver outcome is DERIVED, not asked. It follows from (the set's packaging, the
//    staged file's type) in every case: a non-swu set never builds, a staged .swu already IS the
//    deliverable, and anything else on an swu set has to be built or nothing ever ships. Asking
//    let the operator contradict the system and end up with a silently unlaunchable set.
//  - the two outcomes offer OPPOSITE things. Signing and encryption apply to a build, so they
//    appear only where one will happen; the prebuilt-SWU case says explicitly that they cannot be.
//  - the selector survives ONLY as the fallback for unknown packaging (the pack read failed, or a
//    create dialog with no target set yet), and must still gate submission there.
//  - the security payload has to be the shape the backend accepts. Shared encryption needs a user
//    AND a key name; per-device is an algorithm with neither. Sending half of either produces a
//    build that fails only at the backend.

const {
  uploadModuleArtifactBinaryMock,
  uploadModuleSwDescriptorMock,
  buildSoftwareModuleMock,
  isSupportedMock,
  fetchKmsKeysMock,
  fetchSymmetricKeysMock,
  fetchIssuedCertificatesMock,
  fetchUpdatePacksMock,
  downloadCatalogModuleFileMock,
  deleteCatalogModuleFileMock,
  updateCatalogModuleMock,
  fetchCatalogModuleMock,
} = vi.hoisted(() => ({
  uploadModuleArtifactBinaryMock: vi.fn(),
  uploadModuleSwDescriptorMock: vi.fn(),
  buildSoftwareModuleMock: vi.fn(),
  isSupportedMock: vi.fn(),
  fetchKmsKeysMock: vi.fn(),
  fetchSymmetricKeysMock: vi.fn(),
  fetchIssuedCertificatesMock: vi.fn(),
  fetchUpdatePacksMock: vi.fn(),
  downloadCatalogModuleFileMock: vi.fn(),
  deleteCatalogModuleFileMock: vi.fn(),
  updateCatalogModuleMock: vi.fn(),
  fetchCatalogModuleMock: vi.fn(),
}));

vi.mock('@/lib/iot-api', () => ({
  uploadModuleArtifactBinary: uploadModuleArtifactBinaryMock,
  uploadModuleSwDescriptor: uploadModuleSwDescriptorMock,
  buildSoftwareModule: buildSoftwareModuleMock,
  // The sheet reads the owning pack to learn its PACKAGING, which is what makes the
  // build-vs-deliver outcome derivable instead of a question. Omitting it here crashed every test
  // in this file on the mount effect.
  fetchUpdatePacks: fetchUpdatePacksMock,
  downloadCatalogModuleFile: downloadCatalogModuleFileMock,
  deleteCatalogModuleFile: deleteCatalogModuleFileMock,
  updateCatalogModule: updateCatalogModuleMock,
  fetchCatalogModule: fetchCatalogModuleMock,
}));

vi.mock('@/contexts/UpdatesCapabilitiesContext', () => ({
  useUpdatesCapabilities: () => ({ isSupported: isSupportedMock, isLoading: false }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { access_token: 'tok', profile: { sub: 'alice' } } }),
}));

vi.mock('@/lib/kms-data', () => ({ fetchKmsKeys: fetchKmsKeysMock }));
vi.mock('@/lib/symkms-api', () => ({ fetchSymmetricKeys: fetchSymmetricKeysMock }));
vi.mock('@/lib/issued-certificate-data', () => ({ fetchIssuedCertificates: fetchIssuedCertificatesMock }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

// The real Monaco editor doesn't render meaningfully in happy-dom (and would try to fetch its
// worker bundle). A plain textarea stands in for it, wired the same way: value in, onChange(text) out.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="sw-description editor" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

const mod: SoftwareModule = {
  key: 'application:telemetry',
  type: 'application',
  name: 'telemetry',
  version: '1.0.0',
  built: false,
  artifacts: [],
  locked: false,
  encrypted: false,
};

const onDone = vi.fn();
const renderSheet = (perModuleDeliverables = true) =>
  render(
    <ModuleFileSheet
      open
      onOpenChange={() => {}}
      groupId="g1"
      packName="gateway"
      module={mod}
      perModuleDeliverables={perModuleDeliverables}
      onDone={onDone}
    />,
  );

// The artifact picker is a react-dropzone dropzone (drag-and-drop), not a labelled <input> — the
// file is only STAGED until the answer (and possibly a build) resolves, so it holds the File object
// rather than uploading on drop. react-dropzone wires its hidden input's change event, so this
// drives that directly. input.files is a read-only FileList, so it has to be defined on the element
// rather than assigned through fireEvent's `target`, or React reads an empty list.
const dropFile = (name: string) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], name);
  const list = Object.assign([file], { item: (i: number) => [file][i], length: 1 });
  Object.defineProperty(input, 'files', { value: list, configurable: true });
  fireEvent.change(input, { target: { files: list } });
};

// The fallback answer control (unknown packaging only) is a two-button radiogroup, not Radix Tabs:
// Tabs activates its first trigger for any unmatched value, so it could not represent
// "not answered yet".
const chooseTab = (nameRe: RegExp) => {
  fireEvent.click(screen.getByRole('radio', { name: nameRe }));
};

// What the pack read returns, i.e. what the sheet derives the outcome from. `undefined` stands for
// "could not be read" — a pack absent from the list — which is the only case that still asks.
const setPackaging = (packaging?: string) => {
  fetchUpdatePacksMock.mockResolvedValue({
    list: packaging === undefined ? [] : [{ id: 'p1', name: 'gateway', group_id: 'g1', packaging }],
  });
};

// The packaging arrives from an async read, so every assertion about the derived outcome has to
// wait for it. The dropzone is mounted as soon as the packaging is known (NOT once an answer
// exists — the answer derives from the files, so gating the dropzone on it deadlocked the form).
const awaitPackaging = () =>
  waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());

// The derived outcome is stated as an Alert TITLE. Matched through the slot rather than by text,
// because the same words appear in the sheet's own description and in the dropzone's label.
const outcomeTitles = () =>
  Array.from(document.querySelectorAll('[data-slot="alert-title"]')).map((el) => el.textContent ?? '');
const hasOutcome = (re: RegExp) => outcomeTitles().some((t) => re.test(t));

// Stages a raw image on an swu set, which derives 'build'.
const stageBuildInput = async () => {
  await awaitPackaging();
  dropFile('firmware.bin');
  await waitFor(() => expect(hasOutcome(/build inputs/i)).toBe(true));
};

// Radix Select opens on pointer-down too.
const openSelect = (el: Element) => {
  fireEvent.pointerDown(el, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.mouseDown(el, { button: 0 });
  fireEvent.click(el);
};

const submitButton = () => screen.getByRole('button', { name: /^(upload|upload and build|working…)$/i }) as HTMLButtonElement;

describe('ModuleFileSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupportedMock.mockReturnValue(true);
    uploadModuleArtifactBinaryMock.mockResolvedValue({});
    uploadModuleSwDescriptorMock.mockResolvedValue({});
    buildSoftwareModuleMock.mockResolvedValue({});
    fetchKmsKeysMock.mockResolvedValue({ list: [{ key_id: 'kms-1', name: 'signing-key', algorithm: 'RSA' }] });
    fetchSymmetricKeysMock.mockResolvedValue({ list: [{ id: 'sym-1', algorithm: 'AES-256-CBC' }] });
    fetchIssuedCertificatesMock.mockResolvedValue({ certificates: [{ serialNumber: 'ser-1', pemData: '-----BEGIN CERT-----' }] });
    // Most tests exercise the swu set, where the outcome depends on what is staged.
    setPackaging('swu');
  });

  it('asks nothing on a set whose packaging is known — it states the rule instead', async () => {
    // REGRESSION: this used to be a two-button question. It never was one: the outcome follows from
    // the packaging and the staged file, and asking let the operator pick "direct upload" on an swu
    // set — storing bytes into a set that could then never be launched, with nothing saying why.
    renderSheet();
    await awaitPackaging();
    expect(screen.queryByRole('radio')).toBeNull();
    // Nothing staged yet, so there is no outcome to state — the RULE is stated instead, and the
    // dropzone is already there to stage into.
    expect(hasOutcome(/This set is delivered as a built SWU/i)).toBe(true);
    expect(submitButton().disabled).toBe(true);
  });

  it('derives a build from a raw image on an swu set', async () => {
    renderSheet();
    await awaitPackaging();
    expect(submitButton().disabled).toBe(true);

    dropFile('firmware.bin');
    // No .swu among the staged files, so this can only be a build input.
    await waitFor(() => expect(hasOutcome(/build inputs/i)).toBe(true));
    expect(screen.queryByRole('radio')).toBeNull();
    await waitFor(() => expect(submitButton().textContent).toMatch(/upload and build/i));
    expect(submitButton().disabled).toBe(false);
  });

  it('derives a direct delivery from a staged .swu — a finished image is never rebuilt', async () => {
    renderSheet();
    await awaitPackaging();
    dropFile('ready.swu');

    await waitFor(() => expect(hasOutcome(/already a built SWU/i)).toBe(true));
    expect(screen.queryByRole('radio')).toBeNull();
    // Nothing is built, so there is nothing to sign, encrypt, or feed a recipe to.
    expect(screen.queryByText(/^Signing$/)).toBeNull();
    expect(screen.queryByText(/^Encryption$/)).toBeNull();
    expect(screen.queryByLabelText(/sw-description editor/i)).toBeNull();

    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(submitButton().textContent).toMatch(/^upload$/i);
    fireEvent.click(submitButton());

    await waitFor(() => expect(uploadModuleArtifactBinaryMock).toHaveBeenCalled());
    expect(uploadModuleSwDescriptorMock).not.toHaveBeenCalled();
    expect(buildSoftwareModuleMock).not.toHaveBeenCalled();
  });

  it('never builds on a non-swu set where the backend has no per-module build (native)', async () => {
    // Native has no per-module build step at all: the raw file IS what each device downloads,
    // whole-set packaging or not, so this stays derived rather than asked.
    isSupportedMock.mockImplementation((k: string) => k !== 'software_module_deliverables');
    setPackaging('non-swu');
    renderSheet(false);
    await awaitPackaging();
    expect(hasOutcome(/Delivered to the device exactly as uploaded/i)).toBe(true);
    expect(screen.queryByRole('radio')).toBeNull();

    // Even a raw image — which on an swu set would derive a build — is delivered as-is here.
    dropFile('firmware.bin');
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(submitButton().textContent).toMatch(/^upload$/i);
    expect(screen.queryByText(/^Signing$/)).toBeNull();
    fireEvent.click(submitButton());
    await waitFor(() => expect(uploadModuleArtifactBinaryMock).toHaveBeenCalled());
    expect(buildSoftwareModuleMock).not.toHaveBeenCalled();
  });

  it('offers a genuine build-or-deliver choice on a non-swu set that can still build per module (hawkbit)', async () => {
    // REGRESSION: hawkBit builds (and can sign/encrypt) each module's own .swu independently of
    // the pack's overall packaging, so a non-SWU pack still lets this ONE module opt into a real
    // build — unlike the swu/non-swu split above, the file bytes alone cannot settle which the
    // operator wants, so this is asked rather than derived.
    setPackaging('non-swu');
    renderSheet();
    await awaitPackaging();
    expect(screen.getByRole('radio', { name: /direct upload/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /build swu/i })).toBeTruthy();
    expect(submitButton().disabled).toBe(true);

    // Direct upload: delivered unchanged, no build, no signing/encryption fields.
    chooseTab(/direct upload/i);
    dropFile('firmware.bin');
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(submitButton().textContent).toMatch(/^upload$/i);
    expect(screen.queryByText(/^Signing$/)).toBeNull();
    fireEvent.click(submitButton());
    await waitFor(() => expect(uploadModuleArtifactBinaryMock).toHaveBeenCalled());
    expect(buildSoftwareModuleMock).not.toHaveBeenCalled();
  });

  it('builds and signs/encrypts a module on a non-swu set when the operator chooses to (hawkbit)', async () => {
    setPackaging('non-swu');
    renderSheet();
    await awaitPackaging();

    chooseTab(/build swu/i);
    dropFile('firmware.bin');
    await waitFor(() => expect(screen.getByText('Signing')).toBeTruthy());
    await waitFor(() => expect(submitButton().textContent).toMatch(/upload and build/i));
    fireEvent.click(submitButton());
    await waitFor(() => expect(buildSoftwareModuleMock).toHaveBeenCalled());
    expect(uploadModuleArtifactBinaryMock).toHaveBeenCalled();
  });

  it('falls back to asking when the packaging cannot be read', async () => {
    // The only case left where the outcome is genuinely unknown. It must still gate submission
    // rather than guessing a default, since the two outcomes are handled in opposite ways.
    setPackaging(undefined);
    renderSheet();
    await waitFor(() => expect(screen.getByRole('radio', { name: /build swu/i })).toBeTruthy());
    expect(screen.getByRole('radio', { name: /direct upload/i }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: /build swu/i }).getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(submitButton().disabled).toBe(true);

    chooseTab(/build swu/i);
    await waitFor(() => expect(document.querySelector('input[type="file"]')).toBeTruthy());
    expect(submitButton().disabled).toBe(true);
    dropFile('firmware.bin');
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });

  it('offers signing and encryption once a build is what will happen', async () => {
    // This is where they belong: the build is what applies them.
    renderSheet();
    await stageBuildInput();
    expect(screen.getByText(/Build this module now/i)).toBeTruthy();
    expect(screen.getByText('Signing')).toBeTruthy();
    expect(screen.getByText('Encryption')).toBeTruthy();
  });

  it('explains per-module signing/encryption via an info icon, not permanent text', async () => {
    // Supplementary — it doesn't change what to pick, only reassures that a composed set's modules
    // are signed/encrypted independently — so it is a hover, not a paragraph under every build.
    renderSheet();
    await stageBuildInput();
    await waitFor(() => expect(screen.getByText('Signing')).toBeTruthy());
    // Not shown until asked for.
    expect(screen.queryByText(/signed and encrypted independently/i)).toBeNull();

    // One trigger next to EACH of Signing and Encryption — the note applies to both.
    const triggers = document.querySelectorAll('[data-slot="tooltip-trigger"]');
    expect(triggers.length).toBe(2);
    fireEvent.pointerEnter(triggers[0]);
    fireEvent.focus(triggers[0]);
    await waitFor(() => expect(screen.getAllByText(/signed and encrypted independently/i).length).toBeGreaterThan(0));
  });

  it('warns when a build would be neither signed nor encrypted', async () => {
    renderSheet();
    await stageBuildInput();
    await waitFor(() => expect(screen.getByText('No security selected')).toBeTruthy());
  });

  it('builds unsigned when no options are chosen', async () => {
    renderSheet();
    await stageBuildInput();
    await waitFor(() => expect(submitButton().textContent).toMatch(/upload and build/i));
    fireEvent.click(submitButton());

    await waitFor(() => expect(buildSoftwareModuleMock).toHaveBeenCalled());
    // No invented key names or algorithms: an empty payload is what "no security" means.
    expect(buildSoftwareModuleMock.mock.calls[0][0].payload).toEqual({});
  });

  it('stores the input without building when the operator turns the build off', async () => {
    // Deferring the build is still the operator's call — what is NOT theirs is whether a build is
    // what these files need, which is derived. Turning it off stores the input for a later build.
    renderSheet();
    await stageBuildInput();
    fireEvent.click(screen.getByLabelText(/Build this module now/i));

    await waitFor(() => expect(submitButton().textContent).toMatch(/^upload$/i));
    fireEvent.click(submitButton());
    await waitFor(() => expect(uploadModuleArtifactBinaryMock).toHaveBeenCalled());
    expect(buildSoftwareModuleMock).not.toHaveBeenCalled();
  });

  it('hides the per-module build where the set builds one deliverable', async () => {
    // Native stores the input and builds the whole set, so per-module signing has nothing to act on
    // and the endpoint would answer 501.
    isSupportedMock.mockImplementation((k: string) => k !== 'software_module_deliverables');
    renderSheet(false);
    // REGRESSION: native mode composes a distribution set from MANY modules, each staging its own
    // input, and it is the SET that gets built later (via the pack's Generate SWU) — never this one
    // module in isolation. The per-module build must stay unreachable here regardless of what the
    // hawkbit-only "build now" toast wording elsewhere does.
    await stageBuildInput();
    expect(hasOutcome(/The whole set builds one deliverable/i)).toBe(true);
    expect(screen.queryByText(/Build this module now/i)).toBeNull();
    expect(screen.queryByText('Signing')).toBeNull();
    await waitFor(() => expect(submitButton().textContent).toMatch(/^upload$/i));
    fireEvent.click(submitButton());
    await waitFor(() => expect(uploadModuleArtifactBinaryMock).toHaveBeenCalled());
    expect(buildSoftwareModuleMock).not.toHaveBeenCalled();
  });

  it('will not submit a build with signing half-chosen', async () => {
    // A key with no method is a request the backend rejects, so it is refused here instead.
    renderSheet();
    await stageBuildInput();
    await waitFor(() => expect(submitButton().disabled).toBe(false));

    // Choose a signing key but no method.
    openSelect(screen.getAllByRole('combobox')[0]);
    await waitFor(() => expect(screen.getByRole('option', { name: /signing-key/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /signing-key/i }));

    await waitFor(() => expect(submitButton().disabled).toBe(true));
  });

  it('does not offer per-device encryption where the backend cannot do it', async () => {
    // hawkbit serves one distribution set to every assigned target, so per-device has no meaning
    // there and offering it produced a build that always failed.
    isSupportedMock.mockImplementation((k: string) => k !== 'per_device_encryption');
    renderSheet();
    await stageBuildInput();
    await waitFor(() => expect(screen.getByText('Encryption')).toBeTruthy());

    const modeSelect = screen.getAllByRole('combobox').at(-1)!;
    openSelect(modeSelect);
    await waitFor(() => expect(screen.getByRole('option', { name: /^None$/ })).toBeTruthy());
    expect(screen.queryByRole('option', { name: /per-device/i })).toBeNull();
  });
  it('sends the shape a shared-key build needs: a user AND a key name', async () => {
    // The backend reads shared encryption as (user, key name, algorithm) together; a key with no
    // user is per-device mode, which is a different thing entirely. Sending half of either produces
    // a build that fails only at the backend.
    renderSheet();
    await stageBuildInput();

    // Encryption mode -> shared.
    const combos = screen.getAllByRole('combobox');
    openSelect(combos[combos.length - 1]);
    await waitFor(() => expect(screen.getByRole('option', { name: /shared/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /shared/i }));

    // Then the symmetric key.
    await waitFor(() => expect(screen.getByText(/Symmetric key/i)).toBeTruthy());
    const withKey = screen.getAllByRole('combobox');
    openSelect(withKey[withKey.length - 1]);
    await waitFor(() => expect(screen.getByRole('option', { name: /sym-1/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /sym-1/i }));

    await waitFor(() => expect(submitButton().disabled).toBe(false));
    fireEvent.click(submitButton());

    await waitFor(() => expect(buildSoftwareModuleMock).toHaveBeenCalled());
    const payload = buildSoftwareModuleMock.mock.calls[0][0].payload;
    expect(payload.user).toBe('alice');
    expect(payload.encryption_key_name).toBe('sym-1');
    // The algorithm is normalised to the swugenerator's spelling, not passed through raw.
    expect(payload.encryption_alg_name).toBe('AES-256-CBC');
  });

  it('refuses to submit shared encryption with no key chosen', async () => {
    renderSheet();
    await stageBuildInput();
    await waitFor(() => expect(submitButton().disabled).toBe(false));

    const combos = screen.getAllByRole('combobox');
    openSelect(combos[combos.length - 1]);
    await waitFor(() => expect(screen.getByRole('option', { name: /shared/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /shared/i }));

    // Mode chosen, key not — an incomplete request the backend would reject.
    await waitFor(() => expect(submitButton().disabled).toBe(true));
  });
  it('starts clean when reopened for the same module', async () => {
    // REGRESSION: the reset was keyed on the module changing, so reopening for the SAME module kept
    // the previous state — and the next file need not be the same kind as the last one. The outcome
    // is derived now, so what must not survive a close is the STAGED FILES: they are what it is
    // derived from, and a stale one would state an outcome for a file the operator never re-chose.
    // Caught in a real browser, not by the tests above.
    const { rerender } = render(
      <ModuleFileSheet open onOpenChange={() => {}} groupId="g1" packName="gateway" module={mod}
        perModuleDeliverables onDone={onDone} />,
    );
    await awaitPackaging();
    dropFile('ready.swu');
    await waitFor(() => expect(hasOutcome(/already a built SWU/i)).toBe(true));

    // Close, then reopen for the very same module.
    rerender(
      <ModuleFileSheet open={false} onOpenChange={() => {}} groupId="g1" packName="gateway" module={mod}
        perModuleDeliverables onDone={onDone} />,
    );
    rerender(
      <ModuleFileSheet open onOpenChange={() => {}} groupId="g1" packName="gateway" module={mod}
        perModuleDeliverables onDone={onDone} />,
    );

    // Back to the rule, not to an outcome: nothing is staged to derive one from.
    await waitFor(() => expect(hasOutcome(/This set is delivered as a built SWU/i)).toBe(true));
    expect(screen.queryByText('ready.swu')).toBeNull();
    expect(hasOutcome(/already a built SWU/i)).toBe(false);
    expect(submitButton().disabled).toBe(true);
  });
  it('shows what was dropped, with a way to remove it', async () => {
    // Staged, not uploaded: the drop only lands in state until the answer (and possibly a build)
    // resolves, so the operator needs to see what is queued and be able to change their mind.
    renderSheet();
    await awaitPackaging();
    dropFile('ready.swu');

    await waitFor(() => expect(screen.getByText('ready.swu')).toBeTruthy());
    // Labelled per file, since a module takes several at once — "the selected file" would be
    // ambiguous the moment there are two.
    fireEvent.click(screen.getByRole('button', { name: /remove ready\.swu/i }));
    await waitFor(() => expect(screen.queryByText('ready.swu')).toBeNull());
    expect(submitButton().disabled).toBe(true);
  });
});


describe('standalone modules in the shared file sheet', () => {
  const standalone: SoftwareModule = { ...mod, id: 'standalone-1', delivery_intent: 'undecided' };
  const renderStandalone = (module = standalone) => render(<ModuleFileSheet open onOpenChange={vi.fn()} groupId="" packName="" module={module} perModuleDeliverables onDone={vi.fn()} />);
  beforeEach(() => {
    vi.clearAllMocks();
    uploadModuleArtifactBinaryMock.mockResolvedValue({});
    fetchCatalogModuleMock.mockResolvedValue(standalone);
  });
  it('uploads while delivery is undecided, using the existing uploader with a module ID', async () => {
    renderStandalone();
    expect(screen.getByText('Decide later')).toBeInTheDocument();
    dropFile('firmware.bin');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(uploadModuleArtifactBinaryMock).toHaveBeenCalledWith(expect.objectContaining({ moduleId: 'standalone-1', file: expect.any(File) })));
    expect(fetchUpdatePacksMock).not.toHaveBeenCalled();
    expect(buildSoftwareModuleMock).not.toHaveBeenCalled();
  });
  it('keeps only failed uploads queued for retry', async () => {
    uploadModuleArtifactBinaryMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Upload unavailable')).mockResolvedValue({});
    renderStandalone();
    dropFile('first.bin');
    await waitFor(() => expect(screen.getByText('first.bin')).toBeInTheDocument());
    dropFile('second.bin');
    await waitFor(() => expect(screen.getByText('second.bin')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Upload unavailable');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(uploadModuleArtifactBinaryMock).toHaveBeenCalledTimes(3));
    expect(uploadModuleArtifactBinaryMock.mock.calls.map((c) => c[0].file.name)).toEqual(['first.bin', 'second.bin', 'second.bin']);
  });
  it('retains download access for released modules and prevents changes', () => {
    renderStandalone({ ...standalone, locked: true, artifacts: [{ id: 'file-1', name: 'image', version: '', filename: 'image.bin' }] });
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove image.bin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download image.bin' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
  it('keeps build and security controls for a composed module addressed by ID', async () => {
    isSupportedMock.mockReturnValue(true);
    setPackaging('swu');
    render(<ModuleFileSheet open onOpenChange={vi.fn()} groupId="g1" packName="gateway" module={{ ...standalone, delivery_intent: 'swu-build' }} perModuleDeliverables onDone={vi.fn()} />);
    expect(await screen.findByText('Build this module now')).toBeInTheDocument();
    expect(screen.getByText('sw-description', { selector: 'label' })).toBeInTheDocument();
    dropFile('firmware.bin');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload and build' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Upload and build' }));
    await waitFor(() => expect(buildSoftwareModuleMock).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1', packName: 'gateway', moduleKey: standalone.key })));
    expect(uploadModuleArtifactBinaryMock).toHaveBeenCalledWith(expect.objectContaining({ moduleId: standalone.id }));
  });
  it('retries a failed build without uploading successful inputs again', async () => {
    isSupportedMock.mockReturnValue(true);
    setPackaging('swu');
    buildSoftwareModuleMock.mockRejectedValueOnce(new Error('Builder unavailable')).mockResolvedValue({});
    render(<ModuleFileSheet open onOpenChange={vi.fn()} groupId="g1" packName="gateway" module={{ ...standalone, delivery_intent: 'swu-build' }} perModuleDeliverables onDone={vi.fn()} />);
    dropFile('firmware.bin');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload and build' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Upload and build' }));
    await screen.findByText('Builder unavailable');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload and build' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Upload and build' }));
    await waitFor(() => expect(buildSoftwareModuleMock).toHaveBeenCalledTimes(2));
    expect(uploadModuleArtifactBinaryMock).toHaveBeenCalledTimes(1);
  });

});
