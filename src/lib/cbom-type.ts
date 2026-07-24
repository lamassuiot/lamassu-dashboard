export const CBOM_TYPES = ['gitrepo', 'filesystem', 'realtime'] as const;

export type CBOMType = (typeof CBOM_TYPES)[number];

export interface FilesystemScanInfo {
  scanType: string;
  target: string;
  urn: string;
}

const getBomServices = (value: unknown): any[] => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const raw = value as Record<string, any>;
  const bom = raw.bom ?? raw.data?.bom ?? raw.data ?? raw;
  return Array.isArray(bom?.metadata?.tools?.services) ? bom.metadata.tools.services : [];
};

export function getFilesystemScanInfo(value: unknown): FilesystemScanInfo | null {
  const services = getBomServices(value);

  for (const service of services) {
    if (!service || typeof service !== 'object') continue;
    const properties = (service as { properties?: Array<{ name?: string; value?: string }> }).properties;
    if (!Array.isArray(properties)) continue;

    const scanType = properties.find((property) => property?.name === 'theia:scan:type')?.value;
    const target = properties.find((property) => property?.name === 'theia:scan:target')?.value;
    if (!scanType || !target) continue;

    const raw = value as Record<string, any>;
    const bom = raw.bom ?? raw.data?.bom ?? raw.data ?? raw;
    const urn = bom?.serialNumber ?? '';

    return { scanType, target, urn };
  }

  return null;
}

export function getCBOMType(value: unknown): CBOMType {
  const services = getBomServices(value);

  if (services.some((service: unknown) => {
    if (!service || typeof service !== 'object') return false;
    return (service as { name?: unknown }).name === 'cbomkit-theia';
  })) {
    return 'filesystem';
  }

  if (services.some((service: unknown) => {
    if (!service || typeof service !== 'object') return false;
    const candidate = service as {
      name?: unknown;
      provider?: { name?: unknown };
    };
    return candidate.name === 'LiveCapture' && candidate.provider?.name === 'Ikerlan_LKS';
  })) {
    return 'realtime';
  }

  return 'gitrepo';
}
