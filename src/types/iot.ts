export interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'updating' | 'error';
  currentFirmware: string;
  lastSeen: string; // ISO Date string or human-readable
  location: string;
  updateHistory?: DeviceUpdateEvent[]; // This seems to be for a different kind of history, from MOCK_DATA
}

// This is for the MOCK_DEVICE_UPDATE_HISTORY, potentially different from Job History
export interface DeviceUpdateEvent {
  id: string;
  timestamp: string; // ISO Date string
  event: string; // e.g., "Pack Received", "Install Started", "Completed", "Failed"
  details?: string;
  logUrl?: string;
}

// One requirement a device must already satisfy to qualify for a launch (API-facing, snake_case).
// It names exactly ONE target — a distribution set (required_distribution_set_name) or a software module
// (required_module_key, "<type>:<name>") — plus the minimum version of it the device must already
// carry. The module form matters because a dependency is often finer than a whole set: "needs
// bootloader >= 2.1" is about a module, and which set ships it changes between releases.
//
// Preconditions are declared ONLY on the DISTRIBUTION SET being launched (UpdatePack.preconditions,
// a list of 1..N of these, set via setPackPreconditions) — never on a software module. What gets
// deployed is a set, so the set is what carries the rules gating its deployment; a module appears
// here only as the TARGET of one of those rules. A campaign merely TRIGGERS the check at launch time
// (its outcome comes back as qualifying_devices / precondition_failures) and carries no copy of the
// requirement list.
export interface CampaignPrecondition {
  required_distribution_set_name?: string;
  required_module_key?: string;
  min_version: string;
}

// A device that did not satisfy a precondition (used in dry-run/create responses and persisted on
// the campaign). `current_version` is "" when the pack is not installed; `required` is ">=<min>".
export interface PreconditionFailure {
  device_id: string;
  // Whichever target was checked; module_key is also set when it was a module, so the two are
  // distinguishable without parsing the string.
  distribution_set_name: string;
  module_key?: string;
  current_version: string;
  required: string;
}

// Used by UpdateStrategyForm (camelCase)
export interface UpdateStrategy {
  id?: string; // ID will be generated if not provided (e.g., when creating new)
  workflowType: string;
  rolloutType: 'numeric' | 'percentage';
  rolloutValue: number;
  testDeviceId?: string;
  updatePackId?: string; // This will store the ID of the distribution set
  auto?: boolean; // Auto mode toggle
  approvalThreshold?: number; // % of batch that must succeed before next batch (auto only)
  errorThreshold?: number; // % of all devices that can fail before aborting (auto only)
  // Optional planned start. Held as the raw <input type="datetime-local">
  // value (local wall-clock, e.g. "2026-09-01T09:00"); converted to a UTC ISO
  // string for the launch payload's scheduled_at. Empty ⇒ launch immediately.
  scheduledAt?: string;
  // Optional campaign display name; when empty the backend defaults it to the
  // distribution set's name.
  name?: string;
  // Optional free-text notes for the campaign.
  description?: string;
  // Optional priority hint (0–1000, validated server-side).
  weight?: number;
}

export interface ApiCreateUpdatePackPayload {
  name: string;
  version: string; // semver (x.y.z), set by the developer
  group_id: string; // dms_id is part of the payload to the external API
  type: string;
  packaging?: string; // 'swu' (default, build+sign an SWU) or 'non-swu' (raw download-install)
  allow_previous_version_download?: boolean; // enable downloading previous (snapshotted) versions
  // Launch preconditions declared up front — the same requirement setPackPreconditions edits later
  // (see UpdatePack.preconditions). Optional: omitted means no requirement. The backend validates
  // and stores these as part of creating the set, so nothing is half-configured if the caller never
  // returns to the set's page.
  preconditions?: CampaignPrecondition[];
  // The set's initial composition — hawkbit mode only, where CreateDistributionSet actually reads
  // this (native ignores it: a module is added afterwards via addSoftwareModule). Required there,
  // since the backend refuses an empty composition rather than filling in a module nobody asked for.
  // Each entry is either a brand-new module (type/name/version) or, via source_module_id, a reference
  // to one that already exists — composed into this set in the same call rather than a create-then-
  // import round trip.
  modules?: SoftwareModuleRef[];
}

export type EncryptionMode = '' | 'shared' | 'per-device';

export interface UpdatePack {
  id: string;
  name: string;
  group_id?: string; // owning device group; present on fleet-wide (/distribution-sets) responses
  version: string; // semver (x.y.z)
  type: 'rawfile' | 'firmware' | string; // Allow string for other potential types
  packaging?: 'swu' | 'non-swu' | string; // delivery mode: 'swu' builds/signs an SWU; 'non-swu' delivers raw artifacts
  // build lifecycle of the current version (URI remains the download link). 'build_failed' is a
  // build that was attempted and broke: still editable and retryable like 'draft', but distinguishable
  // from it — see last_build_error for the reason.
  status?: 'draft' | 'built' | 'build_failed' | string;
  descriptorFileName?: string;
  descriptorContent?: string; // Added for viewing descriptor
  uri?: string;
  createdAt?: string; // ISO Date string
  binaryFileName?: string; // Name of the uploaded binary file
  last_build_error?: string; // why the last build attempt failed (set with status 'build_failed')
  generationError?: string; // Error message if SWU generation failed
  
  // Security fields
  encryption_mode?: EncryptionMode; // '' = none, 'shared' = one SWU one key, 'per-device' = one SWU per device
  encryption_key_name?: string;
  encryption_alg_name?: string;
  encryption_iv?: string;
  sw_desc_encrypted?: boolean;
  signature_key_id?: string;
  signature_alg_name?: string;
  alg_sign?: string; // Legacy/Alternative
  signature_certificate?: string; // PEM-encoded certificate used for signing

  // Versioning: when true, previously-snapshotted versions of this pack can be downloaded.
  allow_previous_version_download?: boolean;

  // Launch preconditions: gate deployability for every launch of THIS pack (see
  // CampaignPrecondition). Read on every pack read, set via setPackPreconditions — not part of the
  // creation payload, matching release notes / the sw-description (metadata set after the pack
  // exists, editable independently of its build/lock state).
  preconditions?: CampaignPrecondition[];
}

// A (logical name, semantic version) reference to one software component a SWU build delivers.
export interface ArtifactRef {
  name: string;
  version: string;
}

// A reference to a pack that carries an artifact (reverse lookup of the pack<->artifact junction).
export interface PackArtifactRef {
  distribution_set_id: string;
  distribution_set_name: string;
  distribution_set_version: string;
  group_id: string;
}

// A first-class, globally-identified software component (binary tagged with name + version).
// Identity is (name, version) across the whole fleet — NOT owned by any pack. Packs merely
// reference it; the binary is downloaded by id, never through a pack.
export interface Artifact {
  id: string;
  name: string;
  version: string;
  filename: string;
  checksum?: string;
  size?: number; // size of the binary in bytes
  uploaded_at?: string;
  // Present on the fleet-wide catalog (GET /artifacts): the packs that reference this artifact.
  packs?: PackArtifactRef[];
}

// An immutable snapshot of an distribution set at a specific version (GET .../distribution-sets/:name/versions).
// Older versions remain downloadable when the pack has allow_previous_version_download enabled.
export interface UpdatePackVersion {
  id: string;
  distribution_set_id: string;
  group_id: string;
  name: string;
  version: string;
  uri?: string;
  type?: string;
  checksum?: string;
  artifacts?: ArtifactRef[]; // manifest of software components this build delivers
  encryption_mode?: EncryptionMode;
  encryption_key_name?: string;
  encryption_alg_name?: string;
  encryption_iv?: string;
  sw_desc_encrypted?: boolean;
  signature_key_id?: string;
  signature_alg_name?: string;
  signature_certificate?: string;
  created_at?: string;
}

// --- Device package inventory (pack-level) ---

export type FirmwareUpdateStatus = 'pending' | 'running' | 'success' | 'failed';
export type FirmwareUpdateSource = 'service' | 'external';

// The current version of an distribution set installed on a device. A device can hold many packs, each
// at exactly one current version. This is the single per-device install marker — the individual
// artifacts the device has are derived from this pack version's manifest (see DevicePackArtifact).
export interface DevicePackVersion {
  id: string;
  device_id: string;
  distribution_set_id: string;
  distribution_set_name: string;
  group_id: string;
  version: string; // semver (x.y.z)
  packaging: 'swu' | 'non-swu' | string;
  checksum?: string;
  installed_at: string;
  launch_id?: string;
  job_id?: string;
}

// One pack-update attempt for a device. Records the pack-level version transition and lifecycle
// status for a launched job.
export interface DevicePackUpdate {
  id: string;
  job_id?: string;
  launch_id?: string;
  device_id: string;
  distribution_set_id: string;
  distribution_set_name: string;
  group_id: string;
  packaging: 'swu' | 'non-swu' | string;
  version_from: string;
  version_to: string;
  status: FirmwareUpdateStatus;
  timestamp_init?: string | null;
  timestamp_completed?: string | null;
  source?: FirmwareUpdateSource;
}

// One artifact a pack version delivers. Since a device installs a whole pack version (an immutable
// manifest), the artifact's installed version IS the version the manifest declares; checksum/size
// come from the global artifact catalog and installed_at is the pack's install time.
export interface DevicePackArtifact {
  artifact_name: string;
  version: string;
  checksum?: string;
  size?: number;
  installed_at?: string | null;
}

// A device's installed distribution set plus the artifacts that pack delivers — the per-device
// "package inventory" entry (a pack owns its artifacts).
export interface DevicePackWithArtifacts extends DevicePackVersion {
  artifacts: DevicePackArtifact[];
}

// The latest version a device group should run for a pack — the declared "latest" target. One per
// (group, pack); exact-pin semantics (a device is in sync only on an exact version match).
export interface GroupLatestPack {
  id: string;
  group_id: string;
  distribution_set_id: string;
  distribution_set_name: string;
  version: string; // latest semver (x.y.z)
  updated_at: string;
}

// One pack's drift between a device's installed version and its group's latest version.
export interface PackDrift {
  distribution_set_id: string;
  distribution_set_name: string;
  current_version: string; // '' when the device lacks the pack (missing)
  latest_version: string;
  in_sync: boolean;
  missing: boolean;
}

// A device's drift report against its group's latest pack versions.
export interface DeviceLatestDrift {
  device_id: string;
  group_id: string;
  drifts: PackDrift[];
}

// The packs a single device is behind on (installed version != the pack's latest). Each PackDrift's
// latest_version carries the pack's LATEST version here.
export interface DeviceVersionDrift {
  device_id: string;
  outdated: PackDrift[];
}

// Devices in a group that are not on the latest version of one or more packs.
export interface GroupVersionCompliance {
  group_id: string;
  devices: DeviceVersionDrift[];
}

// One (device, pack) row in a group's version matrix: the version the device runs vs the pack's
// latest, with an in-sync flag. Unlike compliance, in-sync rows are included.
export interface DevicePackVersionStatus {
  device_id: string;
  distribution_set_id: string;
  distribution_set_name: string;
  current_version: string;
  latest_version: string;
  in_sync: boolean;
}

// The full per-device version matrix for a group: every tracked (device, pack) with the installed
// version vs the pack's latest (compliant + outdated).
export interface GroupVersionStatus {
  group_id: string;
  rows: DevicePackVersionStatus[];
}

// Operator-/system-driven lifecycle of a launch campaign (independent of per-device job states).
// An empty backend value is treated as 'running' (legacy campaigns predate this field).
export type LaunchLifecycleStatus = 'running' | 'paused' | 'cancelled' | 'completed';

export interface CampaignItem {
  id: string;
  group_id: string;
  name: string;
  description?: string;
  exec_date: string; // ISO Date string
  scheduled_at?: string; // ISO Date string; set when the campaign starts at a planned time
  // Operator-/system-driven lifecycle: '' (legacy == running) | 'running' | 'paused' | 'cancelled' | 'completed'
  status?: LaunchLifecycleStatus | string;
  // Scalar counts (replaces device-ID arrays for scalability)
  total_devices?: number;
  pending_count?: number;
  active_count?: number;
  completed_count?: number;
  failed_count?: number;
  test_device_status?: string; // assignment status of the test/canary device: 'pending'|'active'|'completed'|'failed'
  // Campaign-level strategy configuration (added per campaign, not per DMS)
  workflow_type?: string;
  rollout_type?: 'numeric' | 'percentage';
  rollout_value?: number;
  test_device_id?: string;
  distribution_set_id?: string; // Immutable - cannot be changed after creation
  // The launched set's name, where the backend reports it. hawkBit gives every VERSION of a set its own
  // id, so looking distribution_set_id up among sets' current versions misses older campaigns.
  distribution_set_name?: string;
  auto?: boolean; // Auto mode toggle
  approval_threshold?: number; // % of batch that must succeed before next batch (auto only)
  error_threshold?: number; // % of all devices that can fail before aborting (auto only)
  current_batch_size?: number; // devices dispatched in the in-flight batch (native)
  completed_in_batch?: number; // of those, how many have SUCCEEDED (native) — failures aren't counted, see approval_threshold
  version?: number | string; // Version from the distribution set
  // Campaign preconditions (all optional / backward-compatible)
  preconditions?: CampaignPrecondition[];
  forced_preconditions?: boolean;
  precondition_failures?: PreconditionFailure[];
}

export interface CampaignListResponse {
  next: string | null;
  list: CampaignItem[] | null;
}

export interface ApiGlobalStrategy {
  group_id: string;
  workflow_type: string;
  rollout_type: 'numeric' | 'percentage';
  rollout_value: number;
  test_device_id?: string;
  distribution_set_id?: string; // This is the pack ID from the API
  auto?: boolean; // Auto mode toggle
  approval_threshold?: number;
  error_threshold?: number;
}

// Types for /device/{deviceId}/jobs response
export interface DeviceJobArtifact {
  name: string;
  uri: string;
}

export interface DeviceJobDefinition {
  artifacts: DeviceJobArtifact[];
  dmsID: string;
  launchID: string;
  type: string[];
  version: string;
}

export interface DeviceJobStatus { // This is for the job's overall status
  definitionHash: string;
  state: string; // e.g., "ACTIVATE", "TERMINATED"
  clientId?: string; // As seen in JobHistoryStatus
  context?: JobHistoryStatusContext; // As seen in JobHistoryStatus
  message?: string; // As seen in JobHistoryStatus
  progress?: number; // As seen in JobHistoryStatus
}

export interface DeviceJobWorkflowState {
  description: string;
  name: string;
}

export interface DeviceJobWorkflowGroup {
  description: string;
  name: string;
  states: string[];
}

export interface DeviceJobWorkflowTransition {
  description: string;
  eligible: string;
  from: string;
  to: string;
  action?: string;
  immediate?: boolean;
  inmediate?: boolean; // tolerated misspelling seen in some workflow definitions
}

export interface DeviceJobWorkflow {
  description: string;
  groups: DeviceJobWorkflowGroup[];
  name: string;
  states: DeviceJobWorkflowState[];
  transitions: DeviceJobWorkflowTransition[];
}

export interface DeviceJob { // This is one item from the /api/dms/[dmsId]/device/[deviceId]/jobs list
  clientId: string;
  // Populated for WFX-backed jobs (native mode). The backend-agnostic /launch/:id/jobs endpoint
  // (used for hawkbit mode, which has no WFX definition/workflow to report) omits both.
  definition?: DeviceJobDefinition;
  id: string; // Job ID
  mtime: string; // ISO Date string
  status: DeviceJobStatus; // Job's overall status
  stime: string; // ISO Date string
  tags: string[];
  workflow?: DeviceJobWorkflow;
  // REMOVED 'history' from here as it's not part of the direct API response
}

export interface DeviceJobListResponse {
  next: string | null;
  list: DeviceJob[] | null;
}

// Type for DMS items fetched from Lamassu API
export interface GroupInfo {
  id: string;
  name: string;
}

// Type for the Lamassu DMS list API response
export interface GroupListResponse {
  next: string | null;
  list: GroupInfo[] | null;
}


// --- NEW TYPES FOR DEVICE JOB HISTORY ---
export interface JobHistoryStatusContext {
  lines: string[]; // Or any other structure based on actual data
  [key: string]: any; // Allow other properties if context is flexible
}

export interface JobHistoryStatus { // Status object within a history entry
  clientId: string;
  definitionHash: string;
  state: string; // e.g., "INSTALLING", "INSTALLED", "ACTIVATE", "TERMINATED"
  message?: string;
  progress?: number;
  context?: JobHistoryStatusContext;
  reason?: string; // Optional reason for the state (e.g., "Immediate")
}

export interface JobHistoryEntry { // One entry in the 'history' array of a job
  mtime: string; // ISO Date string
  status: JobHistoryStatus;
}

export interface JobDetail { // A composite object representing a job with its complete history
  clientId: string;
  definition: DeviceJobDefinition;
  history: JobHistoryEntry[]; // The history is now explicitly part of this type
  id: string; // Job ID
  mtime: string; // Job's last modification time
  status: DeviceJobStatus; // Job's overall current status
  stime: string; // Job's start time
  tags: string[];
  workflow: DeviceJobWorkflow;
}

export interface JobHistoryResponse { // Overall response for device job history API
  next: string | null;
  list: JobDetail[] | null;
}

// Types for /api/devices (Device Manager API)
export interface ApiDeviceIdentity {
  active_version: number | null;
  board: string | null;
  serial_number: string | null;
  type: string | null;
}

export interface ApiDevice {
  id: string; // Device ID
  dms_owner: string | null; // DMS ID that owns/manages this device
  creation_timestamp: string; // ISO Date string
  status: 'ACTIVE' | 'INACTIVE' | 'PROVISIONING' | 'DEPROVISIONED' | 'NO_IDENTITY'; // Assuming these are possible statuses
  identity: ApiDeviceIdentity | null;
  metadata: Record<string, any> | null;
}

export interface DeviceListApiResponse {
  next: string | null;
  list: ApiDevice[] | null;
}

// Mirrors pkg/updates.Capability on the backend — a client should treat an unrecognised string as an
// unknown/future capability (present in `supported` as false if the backend reports it missing) rather
// than erroring, since new entries can appear from a newer backend.
export type UpdatesCapabilityKey =
  | 'latest_versions'
  | 'version_compliance'
  | 'artifact_signatures'
  | 'artifact_encryption'
  | 'per_device_encryption'
  | 'artifact_download_by_name'
  | 'workflows'
  | 'launch_strategy_update'
  | 'launch_complete'
  | 'launch_device_assignment'
  | 'scheduled_launch'
  | 'push_events'
  | 'launch_preconditions'
  | 'campaigns'
  | 'canary_device'
  | 'device_inventory'
  | 'artifact_catalog'
  | 'prebuilt_deliverable'
  | 'software_module_composition'
  | 'software_module_deliverables'
  // Whether a module can be created BEFORE any distribution set composes it. A property of the
  // backend's storage model, not of composition: hawkbit has it (a SoftwareModule is a first-class
  // entity owned by nothing), native does not yet (a module row is keyed by its owning pack version).
  // Where absent, modules are still created — by adding one to a distribution set.
  | 'standalone_software_modules';

// --- Software module composition (gated by the 'software_module_composition' capability) ---
//
// A distribution set (an "update pack" in the older API vocabulary) is composed of software modules:
// exactly one mandatory 'os' base image plus any number of 'application' modules. Each module holds
// its own artifacts and builds its own deliverable, which is what makes an OS image and an
// application independently versionable. Mirrors pkg/models.SoftwareModule on the backend.
export type SoftwareModuleType = 'os' | 'application';

export type ModuleDeliveryIntent = 'undecided' | 'swu-build' | 'swu-prebuilt' | 'raw';
export interface SoftwareModule {
  id?: string;
  delivery_intent?: ModuleDeliveryIntent;
  // key is the stable "<type>:<name>" handle every module-scoped request addresses this module by.
  // It survives a pack version bump, unlike a backend-assigned id.
  key: string;
  type: SoftwareModuleType;
  name: string;
  // version is the module's own version, which need not match the pack version composing it.
  version: string;
  // built is whether this module has a deliverable. A pack is launchable only once EVERY module is
  // built, so the pack-level status is the AND over these.
  built: boolean;
  // uri is the URL a device fetches THIS module's own finished deliverable from — set once built.
  // Only ever populated where the backend has a per-module device-fetch path of its own (hawkbit mode:
  // a real hawkBit DDI artifact URL, with a literal "{controllerId}" placeholder — DDI is scoped
  // per-device and no specific device is known at this level). Native mode ships one pack-level .swu
  // instead (see UpdatePack.uri) and never sets this, so an empty value here is not "broken" — check
  // `software_module_deliverables` before reading its absence as a gap.
  uri?: string;
  artifacts: Artifact[];
  // locked is hawkBit's own immutability flag, set automatically once this module's owning
  // distribution set is assigned to a target — a client can rely on it to mean "shipped to a
  // device" without tracking assignment itself. Always false on a backend with no such concept.
  // NOT the same as `built`: a module can hold a finished deliverable and still be unlocked, if
  // nothing has been rolled out to it yet.
  locked: boolean;
  // encrypted reports whether this module's artifacts are stored encrypted at rest on the backend.
  // Unrelated to encrypting the deliverable a device decrypts — see the backend model's comment.
  encrypted: boolean;
  // In HAWKBIT mode a module is its own deliverable, so build security is recorded here rather
  // than on the containing distribution set. They are intentionally optional for native responses.
  encryption_mode?: EncryptionMode;
  encryption_key_name?: string;
  encryption_alg_name?: string;
  sw_desc_encrypted?: boolean;
  signature_key_id?: string;
  signature_alg_name?: string;
  // release_notes is the operator-authored changelog for this module version — free text, markdown
  // by convention. Unlike every other field here it is METADATA rather than backend-derived state,
  // and it stays editable after the module is built and even after it is locked (both backends allow
  // it; hawkBit's lock covers content, not description). Optional so a backend that predates the
  // field still deserialises.
  release_notes?: string;
}

// POST body for building one module's deliverable. Every field is optional — an empty body means
// "no encryption, no signing". Only meaningful where 'software_module_deliverables' is supported.
export interface SoftwareModuleBuildPayload {
  user?: string;
  encryption_key_name?: string;
  encryption_alg_name?: string;
  sw_desc_encrypted?: boolean;
  signature_key_id?: string;
  signature_alg_name?: string;
  signature_certificate?: string;
}

// POST body for adding a module to a pack's composition. version defaults to the pack's version.
// Names a module to create as part of a distribution set, OR — via source_module_id — references
// one that already exists to compose the set with instead (hawkbit mode only; native has no way to
// attach an existing module at creation, so it is ignored there). The two shapes are mutually
// exclusive: type/name/version describe a NEW module and are ignored when source_module_id is set.
export interface SoftwareModuleRef {
  delivery_intent?: ModuleDeliveryIntent;
  type?: SoftwareModuleType;
  name?: string;
  version?: string;
  source_module_id?: string;
}

// A module already defined on ANOTHER pack, offered as a candidate to compose this one with.
export interface ReusableSoftwareModule extends SoftwareModule {
  // Where this module is defined today. Both are needed to address it: a pack's composition is per
  // VERSION, so the same pack can offer different modules at different versions.
  source_distribution_set_name: string;
  source_distribution_set_version: string;
  source_group_id: string;
  // What importing it MEANS, which differs by backend and is worth telling the operator:
  //  - true (hawkbit): the import LINKS. Both packs hold one module, so its artifacts exist once
  //    and a rebuild is seen by both — but so is a change.
  //  - false (native): the import COPIES. Artifact links come along so nothing is re-uploaded, and
  //    the two modules are independent from then on.
  shared: boolean;
}

// POST body for importing an existing module. source_group_id defaults to the importing pack's.
export interface SoftwareModuleImport {
  source_module_id?: string;
  source_group_id?: string;
  source_distribution_set_name: string;
  source_distribution_set_version: string;
  module_key: string;
}

// GET /updates/v1/capabilities — what the deployment's active updates backend ("native" or "hawkbit")
// can and cannot do. A client should read this once at startup and hide features it reports missing,
// instead of discovering each gap from a failed request.
export interface UpdatesCapabilities {
  backend: string;
  supported: Record<string, boolean>;
  unsupported: string[];
}
