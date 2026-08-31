export interface WiregasmEngineInfo {
  columns: string[];
  wiresharkVersion: string;
}

export interface CaptureSummary {
  filename: string;
  file_type: string;
  file_length: number;
  file_encap_type: string;
  packet_count: number;
  start_time: number;
  stop_time: number;
  elapsed_time: number;
}

export interface CaptureLoadResult {
  code: number;
  error: string;
  summary: CaptureSummary;
}

export interface PacketFrame {
  number: number;
  comments: boolean;
  ignored: boolean;
  marked: boolean;
  bg: number;
  fg: number;
  columns: string[];
}

export interface PacketFramesPage {
  frames: PacketFrame[];
  matched: number;
}

export interface ProtocolNode {
  label: string;
  filter: string;
  start: number;
  length: number;
  data_source_idx: number;
  type: 'proto' | 'url' | 'framenum' | '';
  url?: string;
  fnum?: number;
  tree: ProtocolNode[];
}

export interface FrameDataSource {
  name: string;
  data: string;
}

export interface PacketFrameDetails {
  number: number;
  comments: string[];
  data_sources: FrameDataSource[];
  tree: ProtocolNode[];
  follow: string[][];
}

export type TlsObservationStatus =
  | 'observed'
  | 'observed_encrypted_record'
  | 'decrypted'
  | 'inferred'
  | 'encrypted_unavailable'
  | 'capture_incomplete'
  | 'unsupported_by_dissector'
  | 'malformed'
  | 'not_present'
  | 'not_applicable';

export type TlsObservationPresence =
  | 'confirmed'
  | 'expected'
  | 'unknown'
  | 'absent'
  | 'not_applicable';

export interface TlsObservationDirection {
  source: 'client' | 'server';
  destination: 'client' | 'server';
}

export interface TlsObservationKeyShare {
  group: string;
  encoded_length_bytes?: number;
}

export interface TlsObservationCertificate {
  position: number;
  der_hex?: string;
}

export interface TlsObservationPhase {
  sequence?: number;
  direction?: TlsObservationDirection;
  status: TlsObservationStatus;
  presence?: TlsObservationPresence;
  frame_numbers?: number[];
  reason?: string;
  server_name?: {
    value: string | null;
    status: TlsObservationStatus;
    source: string;
    ech_protected?: boolean;
    outer_value?: string | null;
    reason?: string;
  };
  offered?: {
    versions?: string[];
    cipher_suites?: string[];
    supported_groups?: string[];
    key_shares?: TlsObservationKeyShare[];
    signature_schemes?: string[];
    certificate_signature_schemes?: string[];
    psk_key_exchange_modes?: Array<'psk_ke' | 'psk_dhe_ke'>;
    psk_identity_count?: number;
  };
  selected?: Record<string, unknown> | null;
  requested?: Record<string, unknown> | null;
  chain?: TlsObservationCertificate[] | null;
}

export type TlsObservationPhaseName =
  | 'client_hello'
  | 'hello_retry_request'
  | 'server_hello'
  | 'encrypted_extensions'
  | 'server_certificate'
  | 'server_key_exchange'
  | 'server_certificate_verify'
  | 'certificate_request'
  | 'client_certificate'
  | 'client_key_exchange'
  | 'client_certificate_verify';

export interface CbomObservation {
  schema: 'tls-crypto-observation/1.1';
  flow: {
    transport: 'TCP';
    ip_version?: 4 | 6;
    tcp_stream?: number | string;
    endpoints: {
      client: { ip: string; port: number };
      server: { ip: string; port: number };
    };
  };
  inspection?: Record<string, unknown>;
  phases: Partial<Record<TlsObservationPhaseName, TlsObservationPhase[]>>;
  summary?: Record<string, unknown>;
}

export interface CbomObservationBatch {
  observations: CbomObservation[];
  matchedFrames: number;
}

export interface CbomGenerationOptions {
  componentName: string;
  componentVersion?: string;
  compact?: boolean;
  keylogAvailable?: boolean;
}

export interface CbomGenerationResult {
  json: string;
  observations: number;
}

export interface FilterValidation {
  ok: boolean;
  error: string;
}

export interface ProtocolSelection {
  key: string;
  label: string;
  dataSourceIndex: number;
  start: number;
  length: number;
}

export type WiregasmWorkerAction =
  | 'init'
  | 'load'
  | 'frames'
  | 'frame'
  | 'cbom-observations'
  | 'check-filter'
  | 'dispose';

export interface WiregasmWorkerRequest {
  id: number;
  action: WiregasmWorkerAction;
  payload?: Record<string, unknown>;
}

export interface WiregasmWorkerResult {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface WiregasmWorkerStatus {
  kind: 'status';
  status: string;
}

export type CbomWorkerAction = 'generate' | 'dispose';

export interface CbomWorkerRequest {
  id: number;
  action: CbomWorkerAction;
  payload?: Record<string, unknown>;
}

export interface CbomWorkerResult {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}
