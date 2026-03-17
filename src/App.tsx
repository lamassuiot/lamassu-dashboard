import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { IdentifierDisplayProvider } from '@/contexts/IdentifierDisplayContext';
import { ThemedToaster } from '@/components/shared/ThemedToaster';
import Layout from '@/app/layout';
import { Loader2 } from 'lucide-react';

// OIDC callback pages (no layout wrapper)
const SigninCallbackPage = React.lazy(() => import('@/app/signin-callback/page'));
const SignoutCallbackPage = React.lazy(() => import('@/app/signout-callback/page'));
const SilentRenewCallbackPage = React.lazy(() => import('@/app/silent-renew-callback/page'));

// Main pages (rendered inside layout)
const HomePage = React.lazy(() => import('@/app/page'));
const AlertsPage = React.lazy(() => import('@/app/alerts/page'));
const CryptoEnginesPage = React.lazy(() => import('@/app/crypto-engines/page'));

const CertificateAuthoritiesPage = React.lazy(() => import('@/app/certificate-authorities/page'));
const CaDetailsPage = React.lazy(() => import('@/app/certificate-authorities/details/page'));
const IssueCertificatePage = React.lazy(() => import('@/app/certificate-authorities/issue-certificate/page'));
const CaNewPage = React.lazy(() => import('@/app/certificate-authorities/new/page'));
const CaNewGeneratePage = React.lazy(() => import('@/app/certificate-authorities/new/generate/page'));
const CaNewGenerateExistingKeyPage = React.lazy(() => import('@/app/certificate-authorities/new/generate-existing-key/page'));
const CaNewImportFullPage = React.lazy(() => import('@/app/certificate-authorities/new/import-full/page'));
const CaNewImportPublicPage = React.lazy(() => import('@/app/certificate-authorities/new/import-public/page'));

const CertificatesPage = React.lazy(() => import('@/app/certificates/page'));
const CertificateDetailsPage = React.lazy(() => import('@/app/certificates/details/page'));
const CertificateImportPage = React.lazy(() => import('@/app/certificates/import/page'));

const DevicesPage = React.lazy(() => import('@/app/devices/page'));
const DeviceDetailsPage = React.lazy(() => import('@/app/devices/details/page'));

const DeviceGroupsPage = React.lazy(() => import('@/app/device-groups/page'));
const DeviceGroupsNewPage = React.lazy(() => import('@/app/device-groups/new/page'));
const DeviceGroupDetailsPage = React.lazy(() => import('@/app/device-groups/details/page'));
const DeviceGroupEditPage = React.lazy(() => import('@/app/device-groups/edit/page'));

const IntegrationsPage = React.lazy(() => import('@/app/integrations/page'));
const IntegrationsNewPage = React.lazy(() => import('@/app/integrations/new/page'));
const IntegrationsConfigurePage = React.lazy(() => import('@/app/integrations/configure/page'));

const KmsKeysPage = React.lazy(() => import('@/app/kms/keys/page'));
const KmsKeysNewPage = React.lazy(() => import('@/app/kms/keys/new/page'));
const KmsKeyDetailsPage = React.lazy(() => import('@/app/kms/keys/details/page'));

const RegistrationAuthoritiesPage = React.lazy(() => import('@/app/registration-authorities/page'));
const RegistrationAuthoritiesNewPage = React.lazy(() => import('@/app/registration-authorities/new/page'));
const RegistrationAuthoritiesCacertsPage = React.lazy(() => import('@/app/registration-authorities/cacerts/page'));

const SettingsPage = React.lazy(() => import('@/app/settings/page'));

const SigningProfilesPage = React.lazy(() => import('@/app/signing-profiles/page'));
const SigningProfilesNewPage = React.lazy(() => import('@/app/signing-profiles/new/page'));
const SigningProfilesEditPage = React.lazy(() => import('@/app/signing-profiles/edit/page'));

const CertificateViewerPage = React.lazy(() => import('@/app/tools/certificate-viewer/page'));

const VerificationAuthoritiesPage = React.lazy(() => import('@/app/verification-authorities/page'));

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground w-full p-6 text-center">
    <Loader2 className="h-16 w-16 animate-spin text-primary" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <IdentifierDisplayProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* OIDC callback routes — no layout wrapper */}
                <Route path="/signin-callback" element={<SigninCallbackPage />} />
                <Route path="/signout-callback" element={<SignoutCallbackPage />} />
                <Route path="/silent-renew-callback" element={<SilentRenewCallbackPage />} />

                {/* Main app routes — inside the layout shell */}
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="alerts" element={<AlertsPage />} />
                  <Route path="crypto-engines" element={<CryptoEnginesPage />} />

                  <Route path="certificate-authorities" element={<CertificateAuthoritiesPage />} />
                  <Route path="certificate-authorities/details" element={<CaDetailsPage />} />
                  <Route path="certificate-authorities/issue-certificate" element={<IssueCertificatePage />} />
                  <Route path="certificate-authorities/new" element={<CaNewPage />} />
                  <Route path="certificate-authorities/new/generate" element={<CaNewGeneratePage />} />
                  <Route path="certificate-authorities/new/generate-existing-key" element={<CaNewGenerateExistingKeyPage />} />
                  <Route path="certificate-authorities/new/import-full" element={<CaNewImportFullPage />} />
                  <Route path="certificate-authorities/new/import-public" element={<CaNewImportPublicPage />} />

                  <Route path="certificates" element={<CertificatesPage />} />
                  <Route path="certificates/details" element={<CertificateDetailsPage />} />
                  <Route path="certificates/import" element={<CertificateImportPage />} />

                  <Route path="devices" element={<DevicesPage />} />
                  <Route path="devices/details" element={<DeviceDetailsPage />} />

                  <Route path="device-groups" element={<DeviceGroupsPage />} />
                  <Route path="device-groups/new" element={<DeviceGroupsNewPage />} />
                  <Route path="device-groups/details" element={<DeviceGroupDetailsPage />} />
                  <Route path="device-groups/edit" element={<DeviceGroupEditPage />} />

                  <Route path="integrations" element={<IntegrationsPage />} />
                  <Route path="integrations/new" element={<IntegrationsNewPage />} />
                  <Route path="integrations/configure" element={<IntegrationsConfigurePage />} />

                  <Route path="kms/keys" element={<KmsKeysPage />} />
                  <Route path="kms/keys/new" element={<KmsKeysNewPage />} />
                  <Route path="kms/keys/details" element={<KmsKeyDetailsPage />} />

                  <Route path="registration-authorities" element={<RegistrationAuthoritiesPage />} />
                  <Route path="registration-authorities/new" element={<RegistrationAuthoritiesNewPage />} />
                  <Route path="registration-authorities/cacerts" element={<RegistrationAuthoritiesCacertsPage />} />

                  <Route path="settings" element={<SettingsPage />} />

                  <Route path="signing-profiles" element={<SigningProfilesPage />} />
                  <Route path="signing-profiles/new" element={<SigningProfilesNewPage />} />
                  <Route path="signing-profiles/edit" element={<SigningProfilesEditPage />} />

                  <Route path="tools/certificate-viewer" element={<CertificateViewerPage />} />

                  <Route path="verification-authorities" element={<VerificationAuthoritiesPage />} />
                </Route>
              </Routes>
            </Suspense>
            <ThemedToaster offset={{ top: 40 }} />
          </IdentifierDisplayProvider>
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
}
