'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react'
import '@scalar/api-reference-react/style.css'
import { useTheme } from '@/contexts/ThemeContext'
import { get_KMS_API_PUBLIC_URL, get_CA_API_PUBLIC_URL, get_VA_CORE_API_PUBLIC_URL, get_DMS_MANAGER_API_PUBLIC_URL, get_DEV_MANAGER_API_PUBLIC_URL, get_ALERTS_API_PUBLIC_URL } from '@/lib/api-domains';
import { useAuth } from '@/contexts/AuthContext';

const servicesToCheck = [
  { title: 'KMS Service', slug: "kms", url: `${get_KMS_API_PUBLIC_URL()}/openapi` },
  { title: 'CA Service', slug: "ca", url: `${get_CA_API_PUBLIC_URL()}/openapi` },
  { title: 'VA Service', slug: "va", url: `${get_VA_CORE_API_PUBLIC_URL()}/openapi` },
  { title: 'DMS Manager Service', slug: "dms", url: `${get_DMS_MANAGER_API_PUBLIC_URL()}/openapi` },
  { title: 'Device Manager Service', slug: "device", url: `${get_DEV_MANAGER_API_PUBLIC_URL()}/openapi` },
  { title: 'Alerts Service', slug: "alerts", url: `${get_ALERTS_API_PUBLIC_URL()}/openapi` },
];

function App() {
  const { isDarkMode } = useTheme();
  const { user } = useAuth();

  console.log("isDarkMode:", isDarkMode);

  return (
    <ApiReferenceReact
      configuration={{
        url: 'https://registry.scalar.com/@scalar/apis/galaxy?format=yaml',
        sources: servicesToCheck,
        layout: 'classic',
        darkMode: false,
        theme: "kepler",
        onBeforeRequest: ({ request }) => {
          // Add a custom header to all requests
          request.headers.set('Authorization', `Bearer ${user?.access_token}`);
        },
        defaultOpenAllTags: true,
        showSidebar: false,
        hideModels: true
      }}
    />
  )
}
export default App