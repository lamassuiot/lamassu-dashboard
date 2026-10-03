'use client';

import { KeyRound, Pencil, ShieldCheck } from 'lucide-react';

import { getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { Badge } from '@/components/ui/badge';
import type { ApiRaEstSettings } from '@/lib/dms-api';
import { protocolLabels, type RaFormValues } from '@/lib/ra-form';
import { cn } from '@/lib/utils';

const authModeLabels: Record<ApiRaEstSettings['auth_mode'], string> = {
  CLIENT_CERTIFICATE: 'Client certificate auth',
  EXTERNAL_WEBHOOK: 'Webhook auth',
  CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK: 'Client certificate + webhook auth',
  NO_AUTH: 'No enrollment auth',
};

interface RaFormHeaderProps {
  values: RaFormValues;
  isEditMode: boolean;
  enrollmentCaName?: string;
  onEditIcon: () => void;
}

/** Live preview of the RA being configured: updates as the form changes. */
export function RaFormHeader({ values, isEditMode, enrollmentCaName, onEditIcon }: RaFormHeaderProps) {
  const DeviceIcon = getLucideIconByName(values.deviceIcon.name);
  const title = values.name.trim() || (isEditMode ? 'Registration Authority' : 'New Registration Authority');

  return (
    <div className="flex items-start gap-4 border-b pb-6">
      <button
        type="button"
        onClick={onEditIcon}
        aria-label="Change device icon"
        className="group relative flex size-14 shrink-0 items-center justify-center rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
        style={{ backgroundColor: values.deviceIcon.bgColor }}
      >
        {DeviceIcon && <DeviceIcon className="size-7" style={{ color: values.deviceIcon.color }} />}
        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Pencil className="size-3" />
        </span>
      </button>

      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isEditMode ? 'Edit Registration Authority' : 'Create Registration Authority'}
          </p>
          <h1 className={cn('truncate text-2xl font-semibold tracking-tight', !values.name.trim() && 'text-muted-foreground')}>
            {title}
          </h1>
          {values.id && <code className="mt-1 inline-block rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{values.id}</code>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{protocolLabels[values.protocol]}</Badge>
          <Badge variant="secondary">{values.registrationMode === 'JITP' ? 'JITP' : 'Pre-registration'}</Badge>
          <Badge variant="secondary">{authModeLabels[values.enrollmentAuth.auth_mode]}</Badge>
          {enrollmentCaName && <Badge variant="secondary"><ShieldCheck /> {enrollmentCaName}</Badge>}
          {values.serverKeygen.enabled && <Badge variant="secondary"><KeyRound /> Server keygen</Badge>}
        </div>
      </div>
    </div>
  );
}
