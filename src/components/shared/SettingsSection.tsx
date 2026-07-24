import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

// The standard settings-form layout used by every RA settings tab: a
// title/description column on the left, fields spanning the remaining two
// columns on the right. Stack multiple sections with a <Separator /> between
// them rather than nesting them behind sub-tab navigation.
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-8">
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="space-y-4 lg:col-span-2">
        {children}
      </div>
    </div>
  );
}
