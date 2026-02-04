import EditDeviceGroupClient from './EditDeviceGroupClient';

// Page component (Server Component shell)
export default function EditDeviceGroupPage() {
  // The client component uses useSearchParams() to get groupId
  return <EditDeviceGroupClient />;
}
