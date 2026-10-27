import React, { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from 'react-router';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/roboto/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import '@fontsource-variable/ibm-plex-sans/index.css';
import '@fontsource-variable/manrope/index.css';
import RootLayout from './app/layout';
import DeviceDetailsLayout from './app/devices/details/layout';
import { LoadingBar } from '@/components/shared/LoadingBar';

const pageModules = import.meta.glob<{ default: React.ComponentType }>('./app/**/page.tsx');
const pages = Object.entries(pageModules).map(([file, load]) => ({
  path: file.replace(/^\.\/app/, '').replace(/\/page\.tsx$/, '') || '/',
  Page: lazy(load),
}));

// Nested layouts (src/app/<dir>/layout.tsx) wrap every page under their directory, as they did under
// Next — e.g. /updates and /package-inventory provide the device-group context their pages read.
// The root layout and the device details one are applied explicitly below.
const layoutModules = import.meta.glob<{ default: React.ComponentType<{ children: React.ReactNode }> }>('./app/**/layout.tsx', { eager: true });
const nestedLayouts = Object.entries(layoutModules)
  .map(([file, module]) => ({ base: file.replace(/^\.\/app/, '').replace(/\/layout\.tsx$/, ''), Layout: module.default }))
  .filter(({ base }) => base !== '' && base !== '/devices/details');
const underBase = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
const layoutFor = (path: string) => nestedLayouts.find(({ base }) => underBase(path, base));

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    if (location.state?.preserveScroll) return;
    document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [location.key, location.state]);

  return null;
}

function PageLoader() {
  return (
    <div role="status" aria-label="Loading page" className="flex h-full min-h-64 w-full items-center justify-center">
      <LoadingBar />
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {pages.filter(({ path }) => !path.startsWith('/devices/details') && !layoutFor(path)).map(({ path, Page }) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
        {nestedLayouts.map(({ base, Layout }) => (
          <Route key={base} path={base} element={<Layout><Suspense fallback={<PageLoader />}><Outlet /></Suspense></Layout>}>
            {pages.filter(({ path }) => layoutFor(path)?.base === base).map(({ path, Page }) => (
              path === base
                ? <Route key={path} index element={<Page />} />
                : <Route key={path} path={path.slice(base.length + 1)} element={<Page />} />
            ))}
          </Route>
        ))}
        <Route path="/devices/details" element={<DeviceDetailsLayout><Suspense fallback={<PageLoader />}><Outlet /></Suspense></DeviceDetailsLayout>}>
          {pages.filter(({ path }) => path.startsWith('/devices/details')).map(({ path, Page }) => (
            path === '/devices/details'
              ? <Route key={path} index element={<Page />} />
              : <Route key={path} path={path.slice('/devices/details/'.length)} element={<Page />} />
          ))}
        </Route>
        <Route path="*" element={<main className="p-6"><h1 className="text-lg font-semibold">Page not found</h1><Link to="/" className="text-primary underline">Go to dashboard</Link></main>} />
      </Routes>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <RootLayout>
      {/* The layout renders its children inside the content area, so a page chunk that is still
          loading suspends only the page, not the sidebar and header. */}
      <Suspense fallback={<PageLoader />}>
        <AppRoutes />
      </Suspense>
    </RootLayout>
  </BrowserRouter>,
);
