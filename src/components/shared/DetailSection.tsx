import React from 'react';

/** Detail-page section: title and description on the left, content on the right. */
export function DetailSection({ title, description, aside, children }: Readonly<{
  title: string;
  description: string;
  /** Under the description, such as a button acting on the section. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <section aria-label={title} className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3 lg:gap-10">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      <div className="min-w-0 space-y-4 lg:col-span-2">{children}</div>
    </section>
  );
}
