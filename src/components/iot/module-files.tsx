'use client';

/**
 * The one implementation of "put files on a software module".
 *
 * It exists because that operation is now reachable from three places — the module's own Add files
 * sheet, the Add module dialog on a distribution set, and the New module dialog in the fleet-wide
 * catalog — and all three have to agree about the only question that actually matters:
 *
 *   DOES THIS STILL NEED BUILDING?
 *
 *   - Delivered as uploaded: nothing is built. Each file reaches the device exactly as uploaded, so
 *     any signing, encryption or sw-description has to be inside it already.
 *   - Build SWU: the files are build inputs. The module's build packages them into a SWU, which is
 *     where signing, encryption and the sw-description belong.
 *
 * The question is asked in both backends, but it does not mean the same thing in each. Where a
 * module has a build of its own ('software_module_deliverables', i.e. hawkbit mode) the build branch
 * offers the sw-description, the build itself and its signing and encryption. Where the distribution
 * set builds ONE deliverable from every module's inputs, the same branch only says so: the module
 * descriptor and build endpoints answer 501 there, and the set's Generate SWU is the build.
 *
 * Several files rather than one: a module is not a wrapper around a single file. hawkBit places no
 * limit on what a module carries, a realistic build input is a set of images, and the adapter only
 * refuses adding to a module that already holds a FINISHED deliverable.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useDropzone } from 'react-dropzone';
import { AlertTriangle, CheckCircle2, HelpCircle, Info, PackageCheck, UploadCloud, Wrench, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileUpload } from '@/components/iot/file-upload';
import { SwuSecurityFields, useSwuSecurity, type SwuSecurity } from '@/components/iot/swu-security-fields';
import { buildCatalogModule, buildSoftwareModule, uploadCatalogModuleDescriptor, uploadModuleArtifactBinary, uploadModuleSwDescriptor } from '@/lib/iot-api';
import { checkDescriptorFiles, type DescriptorCheck } from '@/lib/sw-descriptor';
import { cn } from '@/lib/utils';
import type { ModuleDeliveryIntent, SoftwareModuleBuildPayload } from '@/types/iot';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

/** What the staged files are: something to deliver untouched, or something to build a SWU from. */
export type ModuleFileAnswer = 'build' | 'as-uploaded';

export type ModuleFilesController = ReturnType<typeof useModuleFiles>;

/**
 * The state behind ModuleFilesFields, held by the caller so it can gate its own submit button and
 * hand the result to submitModuleFiles.
 *
 * `active` should be false while the surface is closed, so a closed dialog makes no KMS requests.
 */
export function useModuleFiles({
  active,
  perModuleDeliverables,
  packaging,
  deliveryIntent,
  standalone = false,
  hasStoredFiles = false,
  storedFileNames = [],
}: {
  deliveryIntent?: ModuleDeliveryIntent;
  standalone?: boolean;
  hasStoredFiles?: boolean;
  /** Filenames already attached to this module. Needed, not just a count, because the sw-description
   *  names its files and a build only includes what it names — so "is every declared file here?"
   *  cannot be answered from a boolean. */
  storedFileNames?: string[];
  active: boolean;
  perModuleDeliverables: boolean;
  /** The owning pack's packaging ('swu' | 'non-swu'), when the caller knows it. Given it, the
   *  build-vs-deliver answer is DERIVED rather than asked — see derivedAnswer. Undefined (the create
   *  dialogs, before a target set is picked) falls back to asking. */
  packaging?: string;
}) {
  const [uploadedAnswer, setUploadedAnswer] = React.useState<ModuleFileAnswer | undefined>(undefined);
  const [manualAnswer, setManualAnswer] = React.useState<ModuleFileAnswer | undefined>(undefined);
  const [files, setFiles] = React.useState<File[]>([]);
  // The sw-description is held as editable TEXT, not as the loaded file: a file can seed it, but the
  // (possibly edited) content is what gets uploaded — same as the pack-level Generate SWU sheet.
  const [descriptorContent, setDescriptorContent] = React.useState('');
  const [descriptorName, setDescriptorName] = React.useState('sw-description');
  const [buildNow, setBuildNow] = React.useState(true);
  const [artifactName, setArtifactName] = React.useState('');
  const [version, setVersion] = React.useState('');

  // Whether the staged files can serve as a finished deliverable. Mirrors the backend rule exactly
  // (models.ClaimsToBeDeliverable / isDeliverable).
  const hasDeliverable = files.some((f) => /\.(swu|tar\.gz)$/i.test(f.name));

  // The build-vs-deliver question is NOT genuinely open once the packaging is known — it follows
  // from (packaging, file type) in every case, so asking the operator to declare it invited them to
  // contradict the system and get a silently unlaunchable set:
  //
  //   non-swu             → no build exists at all, so the files ARE the deliverable.
  //   swu + a .swu staged → that prebuilt image IS the deliverable; building from it is nonsense.
  //   swu + only inputs   → it must be built, or nothing ever ships.
  //
  // Derived here and merely STATED in the UI. Undefined only while packaging is unknown or nothing
  // is staged yet, where there is genuinely nothing to derive from.
  const derivedAnswer: ModuleFileAnswer | undefined = React.useMemo(() => {
    if (!packaging) return undefined;
    if (packaging !== 'swu') return 'as-uploaded';
    if (files.length === 0) return undefined;
    return hasDeliverable ? 'as-uploaded' : 'build';
  }, [packaging, files.length, hasDeliverable]);

  const answer = deliveryIntent !== undefined
    ? deliveryIntent === 'swu-build' ? 'build' : deliveryIntent === 'undecided' ? undefined : 'as-uploaded'
    : derivedAnswer ?? uploadedAnswer ?? manualAnswer;
  const answerIsDerived = derivedAnswer !== undefined;

  // Security only exists on the build branch, so its lookups only run there.
  // A module with its own deliverable can be built wherever it lives: standalone, through the
  // catalog's by-id routes, or inside a set. This used to also require !standalone, which silently
  // dropped the sw-description editor, the build step and these security fields out of the create
  // flow — a "build a SWU from inputs" module could stage binaries and never become a SWU.
  const canBuild = perModuleDeliverables;
  const security = useSwuSecurity(active && canBuild && answer === 'build');

  const willBuild = canBuild && answer === 'build' && buildNow;

  const addFiles = React.useCallback((incoming: File[]) => {
    setFiles((prev) => {
      // De-duplicated by name: a module's artifacts are addressed by filename, so the same name
      // twice is never two things — and dropping the same file twice is an easy accident.
      const seen = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !seen.has(f.name))];
    });
    // Only a fallback for the unknown-packaging case: where packaging IS known the answer is
    // derived from it (see derivedAnswer) and this suggestion is ignored.
    setManualAnswer((current) => {
      if (current !== undefined) return current;
      return incoming.some((f) => /\.swu$/i.test(f.name)) ? 'as-uploaded' : current;
    });
  }, []);

  const removeFile = React.useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const reset = React.useCallback(() => {
    setManualAnswer(undefined);
    setUploadedAnswer(undefined);
    setFiles([]);
    setDescriptorContent('');
    setDescriptorName('sw-description');
    setBuildNow(true);
    setArtifactName('');
    setVersion('');
    security.reset();
    // security.reset is stable enough for this; re-running on every render would clear the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An SWU build includes only what its sw-description names, so the descriptor and the files have
  // to agree BEFORE the build runs. A declared file nobody uploaded builds an image whose recipe
  // points at something not inside it: the build succeeds, the pack reports built, and every device
  // fails the install — as far from the cause as a failure can get.
  const descriptorCheck = React.useMemo(
    () => checkDescriptorFiles({
      content: descriptorContent,
      stored: storedFileNames,
      staged: files.map((f) => f.name),
    }),
    // storedFileNames is a fresh array each render for most callers, so it is keyed by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [descriptorContent, files, storedFileNames.join('\u0000')],
  );

  // Whether what is staged can be submitted. Callers where files are OPTIONAL (the two create
  // dialogs) should treat "no files" as valid — see `blocksSubmit`.
  const fileError = files.some((f) => deliveryIntent === 'swu-prebuilt' ? !/\.swu$/i.test(f.name) : deliveryIntent === 'swu-build' && /\.swu$/i.test(f.name))
    ? 'The files do not match the delivery intent.'
    : deliveryIntent === 'swu-prebuilt' && files.length > 1 ? 'Upload one prebuilt SWU per module.'
    // Only blocks the BUILD. Storing the inputs for a later build is still valid with a descriptor
    // that is ahead of its files, which is a normal half-finished state.
    : willBuild && descriptorCheck.missing.length > 0
      ? `The sw-description needs ${descriptorCheck.missing.length === 1 ? 'a file that is' : 'files that are'} not here: ${descriptorCheck.missing.join(', ')}.`
      : null;
  const isComplete = !fileError && (files.length > 0 || (willBuild && (hasStoredFiles || uploadedAnswer !== undefined))) && (answer !== undefined || deliveryIntent === 'undecided') && (!willBuild || security.value.isComplete);

  /** True when the staged files are incomplete in a way that must stop a submit. Distinguished from
   *  isComplete so a dialog whose file section is optional can still refuse a half-answered one. */
  const blocksSubmit = files.length > 0 && !isComplete;

  return {
    deliveryIntent,
    standalone,
    fileError,
    answer,
    noteUploaded: () => setUploadedAnswer(answer),
    setAnswer: setManualAnswer,
    /** True when `answer` came from the packaging rather than from the operator, so the UI states
     *  the outcome instead of offering a choice. */
    answerIsDerived,
    packaging,
    files,
    addFiles,
    removeFile,
    descriptorContent,
    setDescriptorContent,
    /** Declared-vs-available state of the sw-description's files — see checkDescriptorFiles. */
    descriptorCheck,
    descriptorName,
    setDescriptorName,
    buildNow,
    setBuildNow,
    artifactName,
    setArtifactName,
    version,
    setVersion,
    security,
    perModuleDeliverables,
    willBuild,
    isComplete,
    blocksSubmit,
    reset,
  };
}

/** The security choices in the shape a module build wants. Shared so every caller sends the same
 *  payload — a subtly different one fails only at the backend. */
export function moduleBuildPayload(s: SwuSecurity, userId: string): SoftwareModuleBuildPayload {
  return {
    // A shared encryption key is scoped to the user, exactly as the pack-level build scopes it.
    ...(s.encryptionMode === 'shared' && s.encryptionKeyName
      ? {
          user: userId,
          encryption_key_name: s.encryptionKeyName,
          encryption_alg_name: s.encryptionAlgName,
          sw_desc_encrypted: s.swDescEncrypted,
        }
      : {}),
    // Per-device is an algorithm with no key name and no user — that is how both backends spell it.
    ...(s.encryptionMode === 'per-device' ? { encryption_alg_name: s.encryptionAlgName } : {}),
    ...(s.hasSigning
      ? {
          signature_key_id: s.signingKeyId,
          signature_alg_name: s.signingMethod,
          ...(s.signingCertificate ? { signature_certificate: s.signingCertificate } : {}),
        }
      : {}),
  };
}

/**
 * Send what the fields staged: every file, then the sw-description, then the build.
 *
 * Sequential rather than concurrent on purpose — artifact names are fleet-wide and a build consumes
 * whatever is on the module, so the order the operator staged files in is the order they arrive.
 *
 * Returns the phrases describing what happened, for the caller's toast.
 */
export async function submitModuleFiles({
  groupId,
  packName,
  moduleKey,
  moduleId,
  state,
  userId,
}: {
  groupId: string;
  packName: string;
  moduleKey: string;
  moduleId?: string;
  state: ModuleFilesController;
  userId: string;
}): Promise<string[]> {
  const done: string[] = [];

  for (const file of state.files) {
    await uploadModuleArtifactBinary({
      groupId,
      packName,
      moduleKey,
      ...(moduleId ? { moduleId } : {}),
      file,
      // A single staged file can be named explicitly; with several, each keeps its own name — one
      // artifact name for all of them would collide on the second upload.
      artifactName: state.files.length === 1 ? state.artifactName.trim() || undefined : undefined,
      version: state.version.trim() || undefined,
    });
    state.noteUploaded();
    state.removeFile(file.name);
  }

  if (state.files.length > 0) {
    // A build input that is about to be built is never "stored": the backend consumes it as part of
    // the build below, so only the build-later path really leaves something sitting on the module.
    if (state.willBuild) {
      done.push(state.files.length === 1 ? 'the file was built in' : `${state.files.length} files were built in`);
    } else {
      done.push(state.files.length === 1 ? 'the file was added' : `${state.files.length} files were added`);
    }
  }

  // The sw-description goes to its own endpoint — it is the recipe a build reads, not something
  // delivered — but to the operator it is part of the same submission.
  if (state.perModuleDeliverables && state.answer === 'build' && state.descriptorContent.trim()) {
    const descriptorFile = new File(
      [state.descriptorContent],
      state.descriptorName.trim() || 'sw-description',
      { type: 'text/plain' },
    );
    // By id when there is no pack to route through — a catalog module has no (group, pack) path.
    if (packName) await uploadModuleSwDescriptor({ groupId, packName, moduleKey, file: descriptorFile });
    else if (moduleId) await uploadCatalogModuleDescriptor(moduleId, descriptorFile);
    done.push('the sw-description was stored');
  }

  if (state.willBuild) {
    const payload = moduleBuildPayload(state.security.value, userId);
    if (packName) await buildSoftwareModule({ groupId, packName, moduleKey, payload });
    else if (moduleId) await buildCatalogModule(moduleId, payload);
    done.push('the module was built');
  }

  return done;
}

/**
 * The fields themselves: the build-or-not question, the files, and everything each answer needs.
 *
 * `compact` drops the explanatory alerts and shrinks the descriptor editor, for the create dialogs
 * where this is one section of a larger form rather than the whole surface.
 */
export function ModuleFilesFields({
  state,
  disabled,
  compact = false,
  versionPlaceholder,
  only,
}: {
  state: ModuleFilesController;
  disabled: boolean;
  compact?: boolean;
  /** The module version artifacts fall back to, shown as the version field's placeholder. */
  versionPlaceholder?: string;
  /** Render only one half of the fields, for a surface that separates them — 'files' is what the
   *  module ships, 'build' is how it is packaged (sw-description, build switch, signing and
   *  encryption). Omitted renders both, which is what a single-panel caller wants. */
  only?: 'files' | 'build';
}) {
  const { perModuleDeliverables, answer, files, packaging, answerIsDerived, deliveryIntent, standalone } = state;
  const showFiles = only !== 'build';
  const showBuild = only !== 'files';
  const isSwuPack = packaging === 'swu';
  const packagingKnown = packaging !== undefined && packaging !== '';

  return (
    <div className="space-y-5">
      {state.fileError && <Alert variant="destructive"><AlertDescription>{state.fileError}</AlertDescription></Alert>}
      {/* Where the packaging is known this is NOT a question: the answer follows from (packaging,
          file type) in every case — non-swu has no build at all, a staged .swu already IS the
          deliverable, and anything else on an swu set must be built. Asking invited the operator to
          contradict the system and end up with a silently unlaunchable set, so the outcome is
          stated instead. The selector below survives only for the create dialogs, which can be
          open before a target set — and therefore a packaging — is known. */}
      {deliveryIntent !== undefined ? null : packagingKnown && !answerIsDerived ? (
        // Packaging is known but nothing is staged, so state the rule rather than an outcome.
        <Alert>
          <HelpCircle className="h-4 w-4" />
          <AlertTitle>{isSwuPack ? 'This set is delivered as a built SWU' : 'This set delivers raw files'}</AlertTitle>
          <AlertDescription>
            {isSwuPack
              ? 'Add the images to build from and a SWU is built from them. If you already have the built .swu, add that instead and it ships as-is.'
              : 'Nothing is built here — whatever you add is what each device downloads and installs.'}
          </AlertDescription>
        </Alert>
      ) : answerIsDerived ? (
        <Alert>
          {answer === 'build' ? <Wrench className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
          <AlertTitle>
            {answer === 'build'
              ? 'These are build inputs — a SWU will be built from them'
              : isSwuPack
                ? 'This is already a built SWU — it will be delivered as-is'
                : 'Delivered to the device exactly as uploaded'}
          </AlertTitle>
          <AlertDescription>
            {answer === 'build' ? (
              <>
                This distribution set is delivered as a <strong>SWU</strong>, and a SWU has to be built — the
                device&apos;s updater rejects a raw image with <em>&quot;No suitable .swu image found&quot;</em>.
                {perModuleDeliverables
                  ? ' The files below are packaged into one for this module.'
                  : ' The files below are stored as inputs; the set is built from every module\u2019s inputs with its Generate SWU action.'}
              </>
            ) : isSwuPack ? (
              <>
                A <code className="font-mono">.swu</code> is a finished image, so nothing is built and nothing here
                is re-signed or re-encrypted — whatever the device verifies is already inside it.
              </>
            ) : (
              <>
                This set delivers raw files, so whatever you upload is what each device downloads and installs.
                Nothing is built, so any signature or encryption the device checks must already be inside the file.
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : (
      <div className="space-y-2">
        <div role="radiogroup" aria-label="Build a SWU, or deliver the files as uploaded?" className="grid w-full grid-cols-2 gap-2">
          {([
            { value: 'build', icon: Wrench, label: 'Build SWU' },
            { value: 'as-uploaded', icon: PackageCheck, label: 'Direct upload' },
          ] as { value: ModuleFileAnswer; icon: React.ElementType; label: string }[]).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={answer === value}
              data-state={answer === value ? 'active' : 'inactive'}
              disabled={disabled}
              onClick={() => state.setAnswer(value)}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                'disabled:pointer-events-none disabled:opacity-50',
                answer === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        {answer === undefined ? (
          <p className="text-sm text-muted-foreground">
            Choose which these are. Build inputs are packaged into a SWU; anything else — a finished SWU, an
            image, whatever the device expects — is delivered exactly as uploaded.
          </p>
        ) : null}
      </div>
      )}

      {/* Gated on "we know enough to show it", not on an answer existing. With the answer derived
          FROM the staged files, gating on the answer deadlocked the form: no dropzone until an
          answer existed, and no answer until something was staged. */}
      {deliveryIntent !== undefined || packagingKnown || answer !== undefined ? (
        <>
          {/* Kept only for the unknown-packaging fallback, where the operator answered rather
              than the system deriving it. A KNOWN swu packaging cannot reach a direct upload with
              files staged at all — the answer is derived from them — so the old "this will never
              be sent to any device" trap is now structurally impossible instead of merely warned
              about. */}
          {deliveryIntent === undefined && answer === 'as-uploaded' && !answerIsDerived && !compact ? (
            <Alert>
              <PackageCheck className="h-4 w-4" />
              <AlertTitle>Delivered exactly as uploaded</AlertTitle>
              <AlertDescription>
                Nothing is built, so there is no signing or encryption to choose here: whatever the device must
                verify has to be inside the file already. Upload the build inputs instead and pick Build SWU to
                have those applied.
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Stated even in compact form: on this backend the build branch does something different
              from what its name promises, and that is not something to leave implicit. */}
          {answer === 'build' && !perModuleDeliverables && !standalone ? (
            <Alert>
              <Wrench className="h-4 w-4" />
              <AlertTitle>The whole set builds one deliverable</AlertTitle>
              <AlertDescription>
                On this backend a module has no SWU of its own — the files are stored, and the set is built from
                every module&apos;s inputs with the pack&apos;s Generate SWU action, which is where signing and
                encryption are chosen.
              </AlertDescription>
            </Alert>
          ) : null}

          {showFiles && (
          <div className="space-y-2">
            <Label>{standalone ? 'Files' : answer === 'build' ? 'Images and other build inputs' : 'Files to deliver'}</Label>
            <ModuleFilesDropzone
              files={files}
              onAdd={state.addFiles}
              onRemove={state.removeFile}
              disabled={disabled}
            />
          </div>
          )}

          {showBuild && perModuleDeliverables && answer === 'build' ? (
            <>
              <div className="space-y-2 rounded-lg border border-border p-3">
                <Label className="text-sm font-semibold">sw-description</Label>
                <p className="text-xs text-muted-foreground">
                  The recipe the build reads: which files to install and where. A module without one falls back to
                  the distribution set&apos;s.
                </p>
                <ModuleDescriptorEditor
                  content={state.descriptorContent}
                  onContentChange={state.setDescriptorContent}
                  onNameChange={state.setDescriptorName}
                  disabled={disabled}
                  height={compact ? '140px' : '180px'}
                />
                {/* The check the build itself cannot do late: what the recipe names, against what
                    will actually be in the image. */}
                <DescriptorFileChecklist check={state.descriptorCheck} />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="module-build-now" className="text-sm font-semibold">
                    Build this module now
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Packages the inputs into this module&apos;s SWU using the options below. Leave off to store the
                    inputs and build later.
                  </p>
                </div>
                <Switch
                  id="module-build-now"
                  checked={state.buildNow}
                  onCheckedChange={state.setBuildNow}
                  disabled={disabled}
                />
              </div>

              {/* Signing and encryption apply to the BUILD, which is why they appear only here. */}
              {state.buildNow ? (
                <SwuSecurityFields
                  fields={state.security.fields}
                  disabled={disabled}
                  sectionNote={
                    // Supplementary, not decision-relevant: it doesn't change what to pick, only
                    // reassures that a composed set's modules don't share one signature or key.
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            Applied to this module&apos;s SWU only. Each module in a distribution set is signed and
                            encrypted independently.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  }
                />
              ) : null}
            </>
          ) : null}

          {showFiles && files.length > 0 && deliveryIntent === undefined ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Only with a single file: an explicit artifact name applied to several uploads would
                  collide on the second, since artifact names are fleet-wide. */}
              {files.length === 1 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="module-artifact-name" className="text-xs">
                    Artifact name (optional)
                  </Label>
                  <Input
                    id="module-artifact-name"
                    value={state.artifactName}
                    onChange={(e) => state.setArtifactName(e.target.value)}
                    placeholder={files[0].name.replace(/\.[^/.]+$/, '')}
                    disabled={disabled}
                  />
                </div>
              ) : (
                <p className="self-end text-xs text-muted-foreground">
                  Each file keeps its own name in the fleet-wide artifact catalog.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="module-artifact-version" className="text-xs">
                  Version (optional)
                </Label>
                <Input
                  id="module-artifact-version"
                  value={state.version}
                  onChange={(e) => state.setVersion(e.target.value)}
                  placeholder={versionPlaceholder ? `defaults to ${versionPlaceholder}` : "the module's version"}
                  disabled={disabled}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Drag-and-drop for the module's own files.
 *
 * Unlike FileUpload (used below for the sw-description) nothing is uploaded on drop — the files are
 * only STAGED, because the answer above and, possibly, a build have to be settled before anything is
 * sent. It therefore holds the File objects rather than discarding them for their text, and lists
 * what is staged so a drop is never silently invisible.
 */
export function ModuleFilesDropzone({
  files,
  onAdd,
  onRemove,
  disabled,
}: {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (name: string) => void;
  disabled: boolean;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => { if (accepted.length) onAdd(accepted); },
    multiple: true,
    disabled,
  });

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          'cursor-pointer rounded-md border-2 border-dashed p-6 text-center transition-colors',
          isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className={cn('mx-auto mb-2 h-8 w-8', isDragActive ? 'text-primary' : 'text-muted-foreground')} />
        <p className={cn('text-sm', isDragActive ? 'text-primary' : 'text-muted-foreground')}>
          {isDragActive
            ? 'Drop the files here…'
            : files.length > 0
              ? 'Drag & drop more files here, or click to add'
              : 'Drag & drop files here, or click to choose them'}
        </p>
      </div>

      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <span className="truncate text-sm font-medium">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onRemove(file.name)}
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * What the sw-description names, and whether each of those files will be in the built image.
 *
 * This is the check that was missing: the build includes only declared files, so a descriptor and
 * the uploaded artifacts have to agree, and neither the old pack-level SWU dialog nor this form
 * verified it — the old one counted declared files and stopped there. Getting it wrong is invisible
 * until a device rejects the install, because the build, the pack status and the launch all succeed.
 *
 * "Present or uploaded" is one state, not two, so a file already attached and one being staged now
 * both read as satisfied — only their labels differ, which is what tells an operator whether they
 * still need to add something.
 */
function DescriptorFileChecklist({ check }: { check: DescriptorCheck }) {
  if (check.declared.length === 0 && check.undeclared.length === 0) return null;
  return (
    <div className="space-y-2">
      {check.declared.length > 0 && (
        <>
          <p className="text-xs font-medium">
            Files this recipe needs
            <span className="ml-1 font-normal text-muted-foreground">
              ({check.declared.filter((d) => d.status !== 'missing').length}/{check.declared.length} available)
            </span>
          </p>
          <ul className="space-y-1">
            {check.declared.map((d) => (
              <li key={d.name} className="flex items-center gap-2 text-xs">
                {d.status === 'missing' ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                <code className="font-mono">{d.name}</code>
                <span className="text-muted-foreground">
                  {d.status === 'stored' ? 'already on this module' : d.status === 'staged' ? 'uploading now' : 'not uploaded'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {check.missing.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>The build would produce an image missing {check.missing.length === 1 ? 'a file' : 'files'}</AlertTitle>
          <AlertDescription className="text-xs">
            An SWU contains only what its sw-description names. Built like this, the device&apos;s updater looks
            for {check.missing.length === 1 ? 'this file' : 'these files'} and fails the install — after the
            build, the pack and the campaign have all reported success. Upload{' '}
            {check.missing.map((m) => <code key={m} className="font-mono">{m}</code>).reduce((a, b) => <>{a}, {b}</>)},
            or take {check.missing.length === 1 ? 'it' : 'them'} out of the recipe.
          </AlertDescription>
        </Alert>
      )}
      {check.undeclared.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Not named by the recipe, so not included</AlertTitle>
          <AlertDescription className="text-xs">
            {check.undeclared.map((m) => <code key={m} className="font-mono">{m}</code>).reduce((a, b) => <>{a}, {b}</>)}{' '}
            {check.undeclared.length === 1 ? 'is' : 'are'} stored on the module but left out of the build. Add{' '}
            {check.undeclared.length === 1 ? 'it' : 'them'} to the sw-description if the device needs{' '}
            {check.undeclared.length === 1 ? 'it' : 'them'}.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Best-effort language for the sw-description editor: JSON descriptors get JSON highlighting,
 *  SWUpdate's libconfig-style ones fall back to something closer to their syntax. */
function descriptorLanguage(content: string): string {
  try { JSON.parse(content); return 'json'; } catch { return 'ini'; }
}

/** The sw-description editor: drag/drop (or click) to load a file's text, then edit it live —
 *  matching the pack-level Generate SWU sheet, so the same recipe is edited the same way wherever it
 *  appears. The loaded/edited text is what is uploaded, not the file. */
export function ModuleDescriptorEditor({
  content,
  onContentChange,
  onNameChange,
  disabled,
  height = '180px',
}: {
  content: string;
  onContentChange: (v: string) => void;
  onNameChange: (v: string) => void;
  disabled: boolean;
  height?: string;
}) {
  const handleLoad = async (file: File): Promise<boolean> => {
    onContentChange(await file.text());
    onNameChange(file.name || 'sw-description');
    return true;
  };
  return (
    <div className="space-y-2">
      <FileUpload label="Drag & drop the sw-description here, or click to load (then edit below)" onFileUpload={handleLoad} />
      <div className="overflow-hidden rounded-md border border-border">
        <Editor
          height={height}
          language={descriptorLanguage(content)}
          value={content}
          onChange={(v) => onContentChange(v ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            readOnly: disabled,
          }}
        />
      </div>
    </div>
  );
}

export const DELIVERY_LABELS: Record<ModuleDeliveryIntent, string> = {
  undecided: 'Decide later',
  'swu-build': 'Build SWU from inputs',
  'swu-prebuilt': 'Upload prebuilt SWU',
  raw: 'Deliver files unchanged',
};

export function ModuleDeliverySelect({ value, onChange, disabled, id = 'module-delivery-intent' }: {
  value: ModuleDeliveryIntent; onChange: (value: ModuleDeliveryIntent) => void; disabled?: boolean; id?: string;
}) {
  return <div className="space-y-1.5">
    <Label htmlFor={id}>Delivery intent</Label>
    <Select value={value} onValueChange={(v) => onChange(v as ModuleDeliveryIntent)} disabled={disabled}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(DELIVERY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">{value === 'undecided'
      ? 'Files can be stored now. Choose delivery before adding the module to a distribution set.'
      : value === 'swu-build' ? 'Upload build inputs. They are packaged into an SWU during the distribution set build workflow.'
      : value === 'swu-prebuilt' ? 'Upload an existing .swu. Its signing and encryption must already be included.'
      : 'The uploaded files are delivered without SWU conversion. The device must support their format.'}</p>
  </div>;
}

