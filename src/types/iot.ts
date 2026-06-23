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

// A single campaign precondition: a device must already have `required_pack_name` installed at a
// version >= `min_version` to qualify (API-facing, snake_case).
export interface CampaignPrecondition {
  required_pack_name: string;
  min_version: string;
}

// A device that did not satisfy a precondition (used in dry-run/create responses and persisted on
// the campaign). `current_version` is "" when the pack is not installed; `required` is ">=<min>".
export interface PreconditionFailure {
  device_id: string;
  pack_name: string;
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
  preconditions?: CampaignPrecondition[];
}

export interface ApiCreateUpdatePackPayload {
  name: string;
  version: string; // semver (x.y.z), set by the developer
  group_id: string; // dms_id is part of the payload to the external API
  type: string;
  packaging?: string; // 'swu' (default, build+sign an SWU) or 'non-swu' (raw download-install)
  allow_previous_version_download?: boolean; // enable downloading previous (snapshotted) versions
}

export type EncryptionMode = '' | 'shared' | 'per-device';

export interface UpdatePack {
  id: string;
  name: string;
  group_id?: string; // owning device group; present on fleet-wide (/updatepacks) responses
  version: string; // semver (x.y.z)
  type: 'rawfile' | 'firmware' | string; // Allow string for other potential types
  packaging?: 'swu' | 'non-swu' | string; // delivery mode: 'swu' builds/signs an SWU; 'non-swu' delivers raw artifacts
  status?: 'draft' | 'built' | string; // build lifecycle of the current version (URI remains the download link)
  descriptorFileName?: string;
  descriptorContent?: string; // Added for viewing descriptor
  uri?: string;
  createdAt?: string; // ISO Date string
  binaryFileName?: string; // Name of the uploaded binary file
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
}

// A (logical name, semantic version) reference to one software component a SWU build delivers.
export interface ArtifactRef {
  name: string;
  version: string;
}

// A reference to a pack that carries an artifact (reverse lookup of the pack<->artifact junction).
export interface PackArtifactRef {
  update_pack_id: string;
  pack_name: string;
  pack_version: string;
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

// An immutable snapshot of an distribution set at a specific version (GET .../updatepacks/:name/versions).
// Older versions remain downloadable when the pack has allow_previous_version_download enabled.
export interface UpdatePackVersion {
  id: string;
  update_pack_id: string;
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
  update_pack_id: string;
  pack_name: string;
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
  update_pack_id: string;
  pack_name: string;
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
  update_pack_id: string;
  pack_name: string;
  version: string; // latest semver (x.y.z)
  updated_at: string;
}

// One pack's drift between a device's installed version and its group's latest version.
export interface PackDrift {
  update_pack_id: string;
  pack_name: string;
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
  update_pack_id: string;
  pack_name: string;
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
  exec_date: string; // ISO Date string
  // Operator-/system-driven lifecycle: '' (legacy == running) | 'running' | 'paused' | 'cancelled' | 'completed'
  status?: LaunchLifecycleStatus | string;
  devices_with_job: string[];
  devices_without_job: string[];
  active_launches?: string[] | null; // Device IDs that are currently active/executing in this campaign
  failed_devices?: string[] | null; // Device IDs whose update reached a terminal failure (subset of devices_with_job)
  // Campaign-level strategy configuration (added per campaign, not per DMS)
  workflow_type?: string;
  rollout_type?: 'numeric' | 'percentage';
  rollout_value?: number;
  test_device_id?: string;
  update_pack_id?: string; // Immutable - cannot be changed after creation
  auto?: boolean; // Auto mode toggle
  approval_threshold?: number; // % of batch that must succeed before next batch (auto only)
  error_threshold?: number; // % of all devices that can fail before aborting (auto only)
  version?: number; // Version from the distribution set
  // Campaign preconditions (all optional / backward-compatible)
  preconditions?: CampaignPrecondition[];
  forced_preconditions?: boolean;
  precondition_failures?: PreconditionFailure[];
}

export interface CampaignListResponse {
  next: string | null;
  list: CampaignItem[] | null;
  active_launches?: string[]; // Device IDs that are currently active/executing
}

export interface ApiGlobalStrategy {
  group_id: string;
  workflow_type: string;
  rollout_type: 'numeric' | 'percentage';
  rollout_value: number;
  test_device_id?: string;
  update_pack_id?: string; // This is the pack ID from the API
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
  definition: DeviceJobDefinition;
  id: string; // Job ID
  mtime: string; // ISO Date string
  status: DeviceJobStatus; // Job's overall status
  stime: string; // ISO Date string
  tags: string[];
  workflow: DeviceJobWorkflow;
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
