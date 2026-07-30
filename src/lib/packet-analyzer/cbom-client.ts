import type {
  CbomGenerationOptions,
  CbomGenerationResult,
  CbomObservation,
  CbomWorkerAction,
  CbomWorkerResult,
  WiregasmWorkerStatus,
} from './types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class CbomWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private disposed = false;

  constructor(onStatus?: (status: string) => void) {
    this.worker = new Worker('/workers/cbom.worker.mjs', {
      type: 'module',
      name: 'lamassu-cbom',
    });

    this.worker.addEventListener('message', (event) => {
      const message = event.data as CbomWorkerResult | WiregasmWorkerStatus;
      if ('kind' in message) {
        onStatus?.(message.status);
        return;
      }

      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);

      if (message.ok) {
        request.resolve(message.result);
      } else {
        request.reject(new Error(message.error || 'CBOM generation failed.'));
      }
    });

    this.worker.addEventListener('error', (event) => {
      this.rejectPending(
        new Error(event.message || 'The CBOM worker stopped unexpectedly.'),
      );
    });
    this.worker.addEventListener('messageerror', () => {
      this.rejectPending(
        new Error('The CBOM worker returned an unreadable response.'),
      );
    });
  }

  generate(
    observations: CbomObservation[],
    options: CbomGenerationOptions,
  ): Promise<CbomGenerationResult> {
    const assetBaseUrl = new URL('/python/', window.location.href).toString();
    return this.request<CbomGenerationResult>('generate', {
      assetBaseUrl,
      observations,
      options,
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;

    try {
      await this.request('dispose');
    } catch {
      // Worker termination below is authoritative.
    } finally {
      this.disposed = true;
      this.worker.terminate();
      this.rejectPending(new Error('The CBOM generator was closed.'));
    }
  }

  private request<T>(
    action: CbomWorkerAction,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error('The CBOM generator is closed.'));
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.worker.postMessage({ id, action, payload });
    });
  }

  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }
}
