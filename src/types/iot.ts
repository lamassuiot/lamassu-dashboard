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

// Used by UpdateStrategyForm (camelCase)
export interface UpdateStrategy {
  id?: string; // ID will be generated if not provided (e.g., when creating new)
  workflowType: 'wfx.workflow.dau.direct' | 'wfx.workflow.dau.phased';
  rolloutType: 'numeric' | 'percentage';
  rolloutValue: number;
  testDeviceId?: string;
  updatePackId?: string; // This will store the ID of the update pack
  auto?: boolean; // Auto mode toggle
}

export interface ApiCreateUpdatePackPayload {
  name: string;
  version: number;
  dms_id: string; // dms_id is part of the payload to the external API
  type: string;
  allow_previous_version_download?: boolean; // enable downloading previous (snapshotted) versions
}

export type EncryptionMode = '' | 'shared' | 'per-device';

export interface UpdatePack {
  id: string;
  name: string;
  version: number;
  type: 'rawfile' | 'firmware' | string; // Allow string for other potential types
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
  pack_version: number;
  dms_id: string;
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

// An immutable snapshot of an update pack at a specific version (GET .../updatepacks/:name/versions).
// Older versions remain downloadable when the pack has allow_previous_version_download enabled.
export interface UpdatePackVersion {
  id: string;
  update_pack_id: string;
  dms_id: string;
  name: string;
  version: number;
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

// --- Device firmware/artifact inventory ---

export type ArtifactVersionStatus = 'active' | 'inactive' | 'backup';

// One artifact/firmware version present on a device. A device has many; for A/B devices an
// artifact can have an 'active' and a 'backup' slot. The 'active' row is the current version.
export interface DeviceArtifactVersion {
  id: string;
  device_id: string;
  artifact_name: string;
  version: string;
  checksum?: string;
  status: ArtifactVersionStatus;
  installed_at: string;
}

export type FirmwareUpdateStatus = 'pending' | 'running' | 'success' | 'failed';
export type FirmwareUpdateSource = 'service' | 'external';

// One firmware-update attempt for a device's artifact (service-driven or out-of-band/local).
export interface DeviceFirmwareUpdate {
  id: string;
  job_id?: string;
  launch_id?: string;
  device_id: string;
  artifact_name: string;
  version_from?: string;
  version_to: string;
  status: FirmwareUpdateStatus;
  timestamp_init?: string | null;
  timestamp_completed?: string | null;
  device_artifact_version_id?: string;
  source?: FirmwareUpdateSource;
}

// Request body for reporting an out-of-band / local firmware change on a device.
export interface NotifyDeviceArtifactPayload {
  artifact_name: string;
  version: string;
  checksum?: string;
  status?: ArtifactVersionStatus;
  version_from?: string;
  installed_at?: string;
  launch_id?: string;
  job_id?: string;
}

export interface LaunchItem {
  id: string;
  dms_id: string;
  name: string;
  exec_date: string; // ISO Date string
  devices_with_job: string[];
  devices_without_job: string[];
  active_launches?: string[] | null; // Device IDs that are currently active/executing in this launch
  // Launch-level strategy configuration (added per launch, not per DMS)
  workflow_type?: 'wfx.workflow.dau.direct' | 'wfx.workflow.dau.phased';
  rollout_type?: 'numeric' | 'percentage';
  rollout_value?: number;
  test_device_id?: string;
  update_pack_id?: string; // Immutable - cannot be changed after creation
  auto?: boolean; // Auto mode toggle
  version?: number; // Version from the update pack
}

export interface LaunchListResponse {
  next: string | null;
  list: LaunchItem[] | null;
  active_launches?: string[]; // Device IDs that are currently active/executing
}

export interface ApiGlobalStrategy {
  dms_id: string;
  workflow_type: 'wfx.workflow.dau.direct' | 'wfx.workflow.dau.phased';
  rollout_type: 'numeric' | 'percentage';
  rollout_value: number;
  test_device_id?: string;
  update_pack_id?: string; // This is the pack ID from the API
  auto?: boolean; // Auto mode toggle
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
export interface DmsInfo {
  id: string;
  name: string;
}

// Type for the Lamassu DMS list API response
export interface DmsListResponse {
  next: string | null;
  list: DmsInfo[] | null;
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
