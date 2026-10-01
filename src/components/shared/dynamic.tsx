import React, { lazy, Suspense, type ComponentType } from 'react';

type Options = { ssr?: boolean; loading?: ComponentType };

export default function dynamic<P extends object>(
  load: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>,
  options?: Options,
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const module = await load();
    return 'default' in module ? module : { default: module };
  });
  const Loading = options?.loading;

  return function DynamicComponent(props: P) {
    return <Suspense fallback={Loading ? <Loading /> : null}>{React.createElement(Lazy as unknown as ComponentType<Record<string, unknown>>, props as Record<string, unknown>)}</Suspense>;
  };
}
