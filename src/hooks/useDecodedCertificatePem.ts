import { useCallback, useState } from 'react';
import { decodeCertificatePem, type DecodedCertInfo } from '@/components/ca/DecodedCertificateSections';
import { useLatestRequest } from '@/hooks/useLatestRequest';

/**
 * Decoded details of the PEM last passed to `decode`, or null for blank input. Decoding is async,
 * so a result is applied only while its PEM is still the latest one.
 */
export function useDecodedCertificatePem() {
  const [decoded, setDecoded] = useState<DecodedCertInfo | null>(null);
  const startRequest = useLatestRequest();

  const decode = useCallback(async (pem: string) => {
    const isLatest = startRequest();
    if (!pem.trim()) {
      setDecoded(null);
      return;
    }
    const info = await decodeCertificatePem(pem);
    if (isLatest()) setDecoded(info);
  }, [startRequest]);

  return [decoded, decode] as const;
}
