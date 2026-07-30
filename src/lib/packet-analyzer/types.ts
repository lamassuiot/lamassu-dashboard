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

export type TlsCode = string;

export interface CbomObservation {
  schemaVersion: '1.0';
  streamId?: string;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  tcpSyn?: boolean;
  clientHello?: {
    sni?: string;
    cipherSuites: Array<{ id: TlsCode; name?: string }>;
    supportedVersions: TlsCode[];
    supportedGroups: TlsCode[];
    signatureAlgorithms: TlsCode[];
  };
  serverHello?: {
    version: TlsCode;
    cipherSuite: TlsCode;
    cipherName?: string;
    keyShareGroup?: TlsCode;
  };
  certificates?: Array<{ derHex: string }>;
  certificateRequested?: boolean;
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
