export type RagSeedDocumentType = 'md' | 'txt' | 'pdf';

export interface RagSeedDocument {
  id: string;
  title: string;
  path: string;
  type: RagSeedDocumentType;
  description?: string;
}

const RAG_SEED_MANIFEST_PATH = '/rag-seed/index.json';

export async function fetchRagSeedManifest(): Promise<RagSeedDocument[]> {
  const response = await fetch(RAG_SEED_MANIFEST_PATH, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to load RAG seed manifest: ${response.status}`);
  }

  const manifest = (await response.json()) as RagSeedDocument[];

  return manifest;
}

export function isRagSeedDocumentType(value: string): value is RagSeedDocumentType {
  return value === 'md' || value === 'txt' || value === 'pdf';
}
