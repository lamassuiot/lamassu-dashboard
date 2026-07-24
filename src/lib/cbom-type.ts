export const CBOM_TYPES = ['gitrepo', 'filesystem', 'realtime'] as const;

export type CBOMType = (typeof CBOM_TYPES)[number];

export function getCBOMType(value: unknown): CBOMType {
  if (!value || typeof value !== 'object') {
    return 'gitrepo';
  }

  const raw = value as Record<string, any>;
  const bom = raw.bom ?? raw.data?.bom ?? raw.data ?? raw;
  const services = Array.isArray(bom?.metadata?.tools?.services)
    ? bom.metadata.tools.services
    : [];

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
