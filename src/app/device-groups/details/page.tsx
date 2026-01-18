import DeviceGroupDetailsClient from './DeviceGroupDetailsClient';

// Page component (Server Component shell)
export default function DeviceGroupDetailsPage() {
  // The client component uses useSearchParams() to get groupId
  return <DeviceGroupDetailsClient />;
}
