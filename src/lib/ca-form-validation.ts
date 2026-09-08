import type { ProfileMode } from '@/components/shared/SigningProfileSelector';

export type CaProfileMode = 'none' | 'reuse' | 'inline';

export function getIssuanceProfileValidationErrors({
  profileMode,
  selectedProfileId,
  caProfileMode,
  inlineCaProfileErrors,
}: {
  profileMode: ProfileMode;
  selectedProfileId: string | null;
  caProfileMode: CaProfileMode;
  inlineCaProfileErrors: readonly string[];
}): string[] {
  return [
    ...(profileMode === 'reuse' && !selectedProfileId ? ['Default Issuance Profile: select an issuance profile.'] : []),
    ...(profileMode === 'create' ? ['Default Issuance Profile: create and select the new profile before creating the CA.'] : []),
    ...(caProfileMode === 'inline' ? inlineCaProfileErrors.map((error) => `CA Certificate Profile: ${error}`) : []),
  ];
}
