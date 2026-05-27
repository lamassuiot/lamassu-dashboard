import { Suspense } from 'react';

import EditDeviceGroupClient from './EditDeviceGroupClient';

// Page component (Server Component shell)
export default function EditDeviceGroupPage() {
  // The client component uses useSearchParams() to get groupId
  return (
    <Suspense fallback={null}>
      <EditDeviceGroupClient />
    </Suspense>
  );
}
