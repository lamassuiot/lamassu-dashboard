'use client';

import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApiSigningProfile } from '@/lib/ca-data';

interface SigningProfileSelectProps {
  availableProfiles: ApiSigningProfile[];
  id?: string;
  isLoading?: boolean;
  onProfileIdChange: (id: string | null) => void;
  selectedProfileId: string | null;
  showDetails?: boolean;
  triggerClassName?: string;
}

export function SigningProfileSelect({
  availableProfiles,
  id = 'profile-select',
  isLoading = false,
  onProfileIdChange,
  selectedProfileId,
  showDetails = false,
  triggerClassName = 'w-full md:w-1/2',
}: SigningProfileSelectProps) {
  const selectedProfile = availableProfiles.find((profile) => profile.id === selectedProfileId);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className={`h-10 ${triggerClassName}`} />
      ) : (
        <Select value={selectedProfileId || ''} onValueChange={onProfileIdChange}>
          <SelectTrigger id={id} className={triggerClassName}>
            <SelectValue placeholder="Select a profile..." />
          </SelectTrigger>
          <SelectContent>
            {availableProfiles.length > 0 ? (
              availableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
              ))
            ) : (
              <SelectItem value="none" disabled>No profiles available</SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
      {showDetails && selectedProfile ? <IssuanceProfileCard profile={selectedProfile} /> : null}
    </div>
  );
}
