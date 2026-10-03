import type { CA, ApiSigningProfile } from '@/lib/ca-data';
import type { RaFormField, RaFormIssue, RaFormValues } from '@/lib/ra-form';
import type { ApiCryptoEngine } from '@/types/crypto-engine';

export interface RaFormDependencies {
  cas: CA[];
  casById: ReadonlyMap<string, CA>;
  cryptoEngines: ApiCryptoEngine[];
  profiles: ApiSigningProfile[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/** Props shared by every RA form section. */
export interface RaSectionProps {
  values: RaFormValues;
  update: (patch: Partial<RaFormValues>) => void;
  /** Visible issues belonging to this section. */
  issues: readonly RaFormIssue[];
  /** Marks a field as touched so its "required" errors become visible. */
  touch: (field: RaFormField) => void;
  deps: RaFormDependencies;
}

export function fieldError(issues: readonly RaFormIssue[], field: RaFormField): string | undefined {
  return issues.find(issue => issue.field === field && issue.severity === 'error')?.message;
}

export function fieldMessages(issues: readonly RaFormIssue[], field: RaFormField, severity: RaFormIssue['severity']): string[] {
  return issues.filter(issue => issue.field === field && issue.severity === severity).map(issue => issue.message);
}

/** Error/warning props for `EstAuthSettingsEditor`, which renders every auth issue inline. */
export function authEditorIssueProps(issues: readonly RaFormIssue[], field: 'enrollmentAuth' | 'reenrollmentAuth') {
  const errors = fieldMessages(issues, field, 'error');
  return {
    validationErrors: errors,
    timeoutError: errors.find(message => message.includes('timeout')) ?? null,
    validationCaWarning: fieldMessages(issues, field, 'warning')[0] ?? null,
  };
}

/** Issues to list at the bottom of a section: those without a control that shows them inline. */
export function listedIssues(issues: readonly RaFormIssue[], inlineFields: readonly RaFormField[]): RaFormIssue[] {
  return issues.filter(issue => !issue.field || !inlineFields.includes(issue.field));
}
