/// <reference lib="webworker" />

import { Wiregasm, vectorToArray } from '@goodtools/wiregasm';
import loadWiregasm from '@goodtools/wiregasm/dist/wiregasm';
import type { Vector } from '@goodtools/wiregasm';
import type {
  WiregasmWorkerRequest,
  WiregasmWorkerResult,
  WiregasmWorkerStatus,
} from '@/lib/packet-analyzer/types';

const WASM_ASSET_NAME = 'wiregasm.wasm.gz';
const DATA_ASSET_NAME = 'wiregasm.data.gz';

let analyzer: Wiregasm | null = null;
let initialization: Promise<Wiregasm> | null = null;
let wasmAsset: ArrayBuffer | null = null;
let dataAsset: ArrayBuffer | null = null;
let activeCapturePath: string | null = null;
let assetBaseUrl: string | null = null;

const postStatus = (status: string) => {
  const message: WiregasmWorkerStatus = { kind: 'status', status };
  self.postMessage(message);
};

const fetchCompressedAsset = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${url} (HTTP ${response.status}).`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzip) {
    return buffer;
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser does not support the decompression API required by Wiregasm.',
    );
  }

  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
};

const resolveAssetUrl = (filename: string): string => {
  const baseUrl =
    assetBaseUrl ?? new URL('/wiregasm/', self.location.href).toString();
  return new URL(filename, baseUrl).toString();
};

const createAnalyzer = async (): Promise<Wiregasm> => {
  if (!wasmAsset || !dataAsset) {
    postStatus('Downloading the Wireshark engine…');
    [wasmAsset, dataAsset] = await Promise.all([
      fetchCompressedAsset(resolveAssetUrl(WASM_ASSET_NAME)),
      fetchCompressedAsset(resolveAssetUrl(DATA_ASSET_NAME)),
    ]);
  }

  postStatus('Registering packet dissectors…');
  const nextAnalyzer = new Wiregasm();
  await nextAnalyzer.init(loadWiregasm, {
    wasmBinary: wasmAsset.slice(0),
    getPreloadedPackage: () => dataAsset!.slice(0),
    print: () => undefined,
    printErr: () => undefined,
    handleStatus: (_type: number, status: string) => {
      if (status) {
        postStatus(status);
      }
    },
  });

  analyzer = nextAnalyzer;
  postStatus('Packet engine ready');
  return nextAnalyzer;
};

const getAnalyzer = async (): Promise<Wiregasm> => {
  if (analyzer?.initialized) {
    return analyzer;
  }

  if (!initialization) {
    initialization = createAnalyzer().finally(() => {
      initialization = null;
    });
  }

  return initialization;
};

const isVector = (value: unknown): value is Vector<unknown> =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as Vector<unknown>).size === 'function' &&
  typeof (value as Vector<unknown>).get === 'function';

const serialize = <T>(value: unknown): T => {
  const json = JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === 'bigint') {
      return Number(currentValue);
    }

    if (isVector(currentValue)) {
      return vectorToArray(currentValue);
    }

    return currentValue;
  });

  return JSON.parse(json) as T;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const handleRequest = async (
  request: WiregasmWorkerRequest,
): Promise<unknown> => {
  if (request.action === 'init') {
    const requestedAssetBaseUrl = request.payload?.assetBaseUrl;
    if (typeof requestedAssetBaseUrl === 'string') {
      try {
        assetBaseUrl = new URL(requestedAssetBaseUrl).toString();
      } catch {
        throw new Error('The Wiregasm asset URL is invalid.');
      }
    }

    const instance = await getAnalyzer();
    return {
      columns: instance.columns(),
      wiresharkVersion: instance.lib.wiresharkVersion(),
    };
  }

  if (request.action === 'dispose') {
    analyzer?.destroy();
    analyzer = null;
    activeCapturePath = null;
    return null;
  }

  const instance = await getAnalyzer();

  switch (request.action) {
    case 'load': {
      const name = request.payload?.name;
      const buffer = request.payload?.buffer;

      if (typeof name !== 'string' || !(buffer instanceof ArrayBuffer)) {
        throw new Error('A capture file name and buffer are required.');
      }

      postStatus(`Dissecting ${name}…`);
      const previousCapturePath = activeCapturePath;
      const result = instance.load(name, new Uint8Array(buffer));

      if (result.code !== 0) {
        throw new Error(result.error || 'Wiregasm could not read this capture.');
      }

      activeCapturePath = `${instance.uploadDir}/${name}`;

      if (previousCapturePath && previousCapturePath !== activeCapturePath) {
        try {
          (
            instance.lib.FS as typeof instance.lib.FS & {
              unlink?: (path: string) => void;
            }
          ).unlink?.(previousCapturePath);
        } catch {
          // The old in-memory capture is non-critical and disappears with the worker.
        }
      }

      postStatus('Capture ready');
      return serialize(result);
    }
    case 'frames': {
      const filter =
        typeof request.payload?.filter === 'string'
          ? request.payload.filter
          : '';
      const skip = Number(request.payload?.skip ?? 0);
      const limit = Number(request.payload?.limit ?? 250);
      return serialize(instance.frames(filter, skip, limit));
    }
    case 'frame': {
      const number = Number(request.payload?.number);
      if (!Number.isInteger(number) || number < 1) {
        throw new Error('A valid packet number is required.');
      }
      return serialize(instance.frame(number));
    }
    case 'check-filter': {
      const filter =
        typeof request.payload?.filter === 'string'
          ? request.payload.filter
          : '';
      return serialize(instance.test_filter(filter));
    }
    default:
      throw new Error(`Unsupported Wiregasm action: ${request.action}`);
  }
};

self.addEventListener(
  'message',
  async (event: MessageEvent<WiregasmWorkerRequest>) => {
    const { id } = event.data;

    try {
      const result = await handleRequest(event.data);
      const response: WiregasmWorkerResult = { id, ok: true, result };
      self.postMessage(response);
    } catch (error) {
      const response: WiregasmWorkerResult = {
        id,
        ok: false,
        error: getErrorMessage(error),
      };
      self.postMessage(response);
    }
  },
);

export {};
