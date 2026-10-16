import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router';

type NavigationOptions = { scroll?: boolean };

/** React Router treats every string as a route path, so same-origin absolute URLs are reduced to one. */
function toRoutePath(href: string): string {
  if (!/^[a-z][a-z\d+.-]*:/i.test(href)) return href;
  const url = new URL(href);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : href;
}

export function useRouter() {
  const navigate = useNavigate();

  return useMemo(() => ({
    push: (href: string, options?: NavigationOptions) => navigate(toRoutePath(href), { state: { preserveScroll: options?.scroll === false } }),
    replace: (href: string, options?: NavigationOptions) => navigate(toRoutePath(href), { replace: true, state: { preserveScroll: options?.scroll === false } }),
    back: () => navigate(-1),
    forward: () => navigate(1),
  }), [navigate]);
}

export type AppRouterInstance = ReturnType<typeof useRouter>;

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  return useRouterSearchParams()[0];
}
