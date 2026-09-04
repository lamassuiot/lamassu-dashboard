'use client';

import { fetchRagSeedManifest, type RagSeedDocument } from '@/lib/rag-seed';
import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';

type WebLLMModule = typeof import('@mlc-ai/web-llm');

const RAG_DB_NAME = 'lamassu-local-rag';
const RAG_DB_VERSION = 1;
const RAG_STORE_NAME = 'seed-index';
const RAG_INDEX_KEY = 'rag-seed-v3-semantic';
const EMBEDDING_MODEL_ID = 'snowflake-arctic-embed-s-q0f32-MLC-b4';
const EMBEDDING_BATCH_SIZE = 4;
const MAX_CHUNK_LENGTH = 1200;
const CHUNK_OVERLAP = 180;
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'with',
]);

let embeddingWorkerInstance: Worker | null = null;
let webllmModulePromise: Promise<WebLLMModule> | null = null;
let embeddingEnginePromise: Promise<MLCEngineInterface> | null = null;
let activeEmbeddingModelId: string | null = null;

export interface RagChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  text: string;
  embedding?: number[];
}

export interface RagIndexedDocument {
  id: string;
  title: string;
  path: string;
  type: RagSeedDocument['type'];
  status: 'indexed' | 'skipped' | 'error';
  chunkCount: number;
  error?: string;
}

export interface RagIndexSummary {
  documentCount: number;
  indexedDocumentCount: number;
  skippedDocumentCount: number;
  chunkCount: number;
  builtAt: number;
  retrievalMode: 'semantic' | 'lexical';
}

interface RagStoredIndex {
  key: string;
  manifestSignature: string;
  builtAt: number;
  retrievalMode: 'semantic' | 'lexical';
  documents: RagIndexedDocument[];
  chunks: RagChunk[];
}

export interface RagSearchResult extends RagChunk {
  score: number;
}

export interface RagSearchResponse {
  summary: RagIndexSummary;
  results: RagSearchResult[];
}

function getEmbeddingWorker() {
  if (!embeddingWorkerInstance) {
    embeddingWorkerInstance = new Worker(new URL('../components/tools/webllm.worker.ts', import.meta.url), {
      type: 'module',
    });
  }

  return embeddingWorkerInstance;
}

function resetEmbeddingEngineCache() {
  if (embeddingWorkerInstance) {
    embeddingWorkerInstance.terminate();
    embeddingWorkerInstance = null;
  }

  embeddingEnginePromise = null;
  activeEmbeddingModelId = null;
}

async function loadWebLLMModule() {
  if (!webllmModulePromise) {
    webllmModulePromise = import('@mlc-ai/web-llm');
  }

  return webllmModulePromise;
}

async function ensureEmbeddingEngine(onInitProgress?: (report: InitProgressReport) => void) {
  const webllm = await loadWebLLMModule();

  if (!embeddingEnginePromise) {
    embeddingEnginePromise = webllm.CreateWebWorkerMLCEngine(getEmbeddingWorker(), EMBEDDING_MODEL_ID, {
      initProgressCallback: onInitProgress,
      appConfig: {
        ...webllm.prebuiltAppConfig,
        cacheBackend: 'indexeddb',
      },
    });

    try {
      const engine = await embeddingEnginePromise;
      activeEmbeddingModelId = EMBEDDING_MODEL_ID;
      return engine;
    } catch (error) {
      resetEmbeddingEngineCache();
      throw error;
    }
  }

  const engine = await embeddingEnginePromise;
  engine.setInitProgressCallback(onInitProgress ?? (() => undefined));

  if (activeEmbeddingModelId !== EMBEDDING_MODEL_ID) {
    try {
      await engine.reload(EMBEDDING_MODEL_ID);
      activeEmbeddingModelId = EMBEDDING_MODEL_ID;
    } catch (error) {
      resetEmbeddingEngineCache();
      throw error;
    }
  }

  return engine;
}

function openRagDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(RAG_DB_NAME, RAG_DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open the local RAG database.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RAG_STORE_NAME)) {
        database.createObjectStore(RAG_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function readStoredIndex() {
  const database = await openRagDatabase();

  return new Promise<RagStoredIndex | null>((resolve, reject) => {
    const transaction = database.transaction(RAG_STORE_NAME, 'readonly');
    const store = transaction.objectStore(RAG_STORE_NAME);
    const request = store.get(RAG_INDEX_KEY);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to read the local RAG index.'));
    };

    request.onsuccess = () => {
      resolve((request.result as RagStoredIndex | undefined) ?? null);
    };

    transaction.oncomplete = () => {
      database.close();
    };
  });
}

async function writeStoredIndex(index: RagStoredIndex) {
  const database = await openRagDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RAG_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(RAG_STORE_NAME);
    const request = store.put(index);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to persist the local RAG index.'));
    };

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Failed to persist the local RAG index.'));
    };
  });
}

function getManifestSignature(manifest: RagSeedDocument[]) {
  return JSON.stringify(manifest);
}

function normalizeWhitespace(text: string) {
  return text.replace(/\u0000/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function chunkText(text: string, document: RagSeedDocument) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/\n\s*\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const chunks: RagChunk[] = [];
  let current = '';

  for (const segment of segments) {
    const candidate = current ? `${current}\n\n${segment}` : segment;

    if (candidate.length <= MAX_CHUNK_LENGTH) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push({
        id: `${document.id}-chunk-${chunks.length + 1}`,
        documentId: document.id,
        documentTitle: document.title,
        documentPath: document.path,
        text: current,
      });
    }

    if (segment.length <= MAX_CHUNK_LENGTH) {
      current = segment;
      continue;
    }

    let start = 0;
    while (start < segment.length) {
      const end = Math.min(segment.length, start + MAX_CHUNK_LENGTH);
      const slice = segment.slice(start, end).trim();

      if (slice) {
        chunks.push({
          id: `${document.id}-chunk-${chunks.length + 1}`,
          documentId: document.id,
          documentTitle: document.title,
          documentPath: document.path,
          text: slice,
        });
      }

      if (end === segment.length) {
        break;
      }

      start = Math.max(end - CHUNK_OVERLAP, start + 1);
    }

    current = '';
  }

  if (current) {
    chunks.push({
      id: `${document.id}-chunk-${chunks.length + 1}`,
      documentId: document.id,
      documentTitle: document.title,
      documentPath: document.path,
      text: current,
    });
  }

  return chunks;
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\d{3}/g, ' ');
}

function extractPdfTextFallback(buffer: ArrayBuffer) {
  const decoded = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const literalMatches = [...decoded.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)]
    .map((match) => decodePdfLiteral(match[1] ?? ''))
    .filter((segment) => /[A-Za-z]{3,}/.test(segment));

  const literalText = normalizeWhitespace(literalMatches.join('\n'));
  if (literalText.length >= 400) {
    return literalText;
  }

  const asciiMatches = decoded.match(/[A-Za-z][A-Za-z0-9,.;:()/'" \-]{30,}/g) ?? [];
  return normalizeWhitespace(asciiMatches.join('\n'));
}

async function fetchDocumentText(document: RagSeedDocument) {
  const response = await fetch(document.path, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${document.path}: ${response.status}`);
  }

  if (document.type === 'pdf') {
    const buffer = await response.arrayBuffer();
    return extractPdfTextFallback(buffer);
  }

  return response.text();
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function dotProduct(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let score = 0;

  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }

  return score;
}

function summarizeIndex(index: RagStoredIndex): RagIndexSummary {
  const indexedDocumentCount = index.documents.filter((document) => document.status === 'indexed').length;
  const skippedDocumentCount = index.documents.filter((document) => document.status !== 'indexed').length;

  return {
    documentCount: index.documents.length,
    indexedDocumentCount,
    skippedDocumentCount,
    chunkCount: index.chunks.length,
    builtAt: index.builtAt,
    retrievalMode: index.retrievalMode,
  };
}

function scoreChunkLexically(chunk: RagChunk, queryTerms: string[]) {
  const lowerText = chunk.text.toLowerCase();
  const chunkTerms = tokenize(chunk.text);
  if (chunkTerms.length === 0) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const term of chunkTerms) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }

  let score = 0;
  for (const term of queryTerms) {
    const frequency = frequencies.get(term) ?? 0;
    if (frequency > 0) {
      score += 2 + frequency;
    }

    if (lowerText.includes(term)) {
      score += 0.5;
    }
  }

  if (queryTerms.length > 1 && lowerText.includes(queryTerms.join(' '))) {
    score += 3;
  }

  return score;
}

function toSearchResults(chunks: RagChunk[], scoreChunk: (chunk: RagChunk) => number, topK: number) {
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

async function embedTexts(texts: string[]) {
  if (texts.length === 0) {
    return [];
  }

  const engine = await ensureEmbeddingEngine();
  const response = await engine.embeddings.create({
    input: texts,
    model: EMBEDDING_MODEL_ID,
    encoding_format: 'float',
  });

  return response.data.map((item) => normalizeVector(item.embedding));
}

async function buildSemanticEmbeddings(chunks: RagChunk[]) {
  const batches: number[][] = [];

  for (let index = 0; index < chunks.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(index, index + EMBEDDING_BATCH_SIZE);
    const vectors = await embedTexts(batch.map((chunk) => chunk.text));
    batches.push(...vectors);
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: batches[index],
  }));
}

async function buildSeedIndex(manifest: RagSeedDocument[]) {
  const documents: RagIndexedDocument[] = [];
  const rawChunks: RagChunk[] = [];

  for (const document of manifest) {
    try {
      const text = await fetchDocumentText(document);
      const documentChunks = chunkText(text, document);

      if (documentChunks.length === 0) {
        documents.push({
          id: document.id,
          title: document.title,
          path: document.path,
          type: document.type,
          status: 'skipped',
          chunkCount: 0,
          error: 'No extractable text was found in this file.',
        });
        continue;
      }

      rawChunks.push(...documentChunks);
      documents.push({
        id: document.id,
        title: document.title,
        path: document.path,
        type: document.type,
        status: 'indexed',
        chunkCount: documentChunks.length,
      });
    } catch (error) {
      documents.push({
        id: document.id,
        title: document.title,
        path: document.path,
        type: document.type,
        status: 'error',
        chunkCount: 0,
        error: error instanceof Error ? error.message : 'Failed to parse this file.',
      });
    }
  }

  let chunks = rawChunks;
  let retrievalMode: RagStoredIndex['retrievalMode'] = 'lexical';

  try {
    chunks = await buildSemanticEmbeddings(rawChunks);
    retrievalMode = 'semantic';
  } catch (_) {
    chunks = rawChunks;
    retrievalMode = 'lexical';
  }

  const index: RagStoredIndex = {
    key: RAG_INDEX_KEY,
    manifestSignature: getManifestSignature(manifest),
    builtAt: Date.now(),
    retrievalMode,
    documents,
    chunks,
  };

  await writeStoredIndex(index);
  return index;
}

export async function ensureSeedIndex() {
  const manifest = await fetchRagSeedManifest();
  const signature = getManifestSignature(manifest);
  const existingIndex = await readStoredIndex();

  if (existingIndex && existingIndex.manifestSignature === signature) {
    return {
      index: existingIndex,
      summary: summarizeIndex(existingIndex),
    };
  }

  const index = await buildSeedIndex(manifest);
  return {
    index,
    summary: summarizeIndex(index),
  };
}

export async function searchSeedIndex(query: string, topK = 4): Promise<RagSearchResponse> {
  const { index, summary } = await ensureSeedIndex();
  const queryTerms = tokenize(query);

  if (queryTerms.length === 0) {
    return { summary, results: [] };
  }

  if (index.retrievalMode === 'semantic') {
    try {
      const [queryEmbedding] = await embedTexts([query]);
      if (queryEmbedding) {
        const results = toSearchResults(
          index.chunks.filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0),
          (chunk) => dotProduct(chunk.embedding ?? [], queryEmbedding),
          topK,
        );

        if (results.length > 0) {
          return {
            summary,
            results,
          };
        }
      }
    } catch (_) {
      // Fall back to lexical scoring below if the embedding query path fails.
    }
  }

  return {
    summary,
    results: toSearchResults(index.chunks, (chunk) => scoreChunkLexically(chunk, queryTerms), topK),
  };
}
