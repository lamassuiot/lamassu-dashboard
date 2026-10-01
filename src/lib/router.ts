import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router';

type NavigationOptions = { scroll?: boolean };

export function useRouter() {
  const navigate = useNavigate();

  return useMemo(() => ({
    push: (href: string, options?: NavigationOptions) => navigate(href, { state: { preserveScroll: options?.scroll === false } }),
    replace: (href: string, options?: NavigationOptions) => navigate(href, { replace: true, state: { preserveScroll: options?.scroll === false } }),
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
