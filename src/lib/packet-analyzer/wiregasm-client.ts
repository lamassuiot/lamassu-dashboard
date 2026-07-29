import type {
  CaptureLoadResult,
  FilterValidation,
  PacketFrameDetails,
  PacketFramesPage,
  WiregasmEngineInfo,
  WiregasmWorkerAction,
  WiregasmWorkerResult,
  WiregasmWorkerStatus,
} from './types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class WiregasmWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private disposed = false;

  constructor(onStatus?: (status: string) => void) {
    this.worker = new Worker(
      new URL('../../workers/wiregasm.worker.ts', import.meta.url),
      { type: 'module', name: 'lamassu-wiregasm' },
    );

    this.worker.addEventListener('message', (event) => {
      const message = event.data as WiregasmWorkerResult | WiregasmWorkerStatus;

      if ('kind' in message) {
        onStatus?.(message.status);
        return;
      }

      const request = this.pending.get(message.id);
      if (!request) {
        return;
      }

      this.pending.delete(message.id);

      if (message.ok) {
        request.resolve(message.result);
      } else {
        request.reject(new Error(message.error || 'Wiregasm request failed.'));
      }
    });

    this.worker.addEventListener('error', (event) => {
      const error = new Error(
        event.message || 'The packet analysis worker stopped unexpectedly.',
      );
      this.rejectPending(error);
    });

    this.worker.addEventListener('messageerror', () => {
      this.rejectPending(
        new Error('The packet analysis worker returned an unreadable response.'),
      );
    });
  }

  init(): Promise<WiregasmEngineInfo> {
    const assetBaseUrl = new URL('/wiregasm/', window.location.href).toString();
    return this.request<WiregasmEngineInfo>('init', { assetBaseUrl });
  }

  load(name: string, buffer: ArrayBuffer): Promise<CaptureLoadResult> {
    return this.request<CaptureLoadResult>(
      'load',
      { name, buffer },
      [buffer],
    );
  }

  frames(
    filter: string,
    skip: number,
    limit: number,
  ): Promise<PacketFramesPage> {
    return this.request<PacketFramesPage>('frames', { filter, skip, limit });
  }

  frame(number: number): Promise<PacketFrameDetails> {
    return this.request<PacketFrameDetails>('frame', { number });
  }

  checkFilter(filter: string): Promise<FilterValidation> {
    return this.request<FilterValidation>('check-filter', { filter });
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      await this.request('dispose');
    } catch {
      // The worker is being torn down; termination below is authoritative.
    } finally {
      this.disposed = true;
      this.worker.terminate();
      this.rejectPending(new Error('The packet analyzer was closed.'));
    }
  }

  private request<T>(
    action: WiregasmWorkerAction,
    payload?: Record<string, unknown>,
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error('The packet analyzer is closed.'));
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.worker.postMessage({ id, action, payload }, transfer);
    });
  }

  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }
}
