import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultEstAuthSettings } from '@/lib/dms-form';
import { EstAuthSettingsEditor } from './EstAuthSettingsEditor';

function renderEditor(props: Partial<React.ComponentProps<typeof EstAuthSettingsEditor>> = {}) {
  return render(
    <EstAuthSettingsEditor
      idPrefix="test"
      value={createDefaultEstAuthSettings()}
      onChange={() => {}}
      availableCAs={[]}
      allCryptoEngines={[]}
      isLoadingCAs={false}
      errorCAs={null}
      loadCAsAction={() => {}}
      {...props}
    />,
  );
}

describe('EstAuthSettingsEditor', () => {
  it('shows the Enrollment CA as always included for re-enrollment', () => {
    const value = createDefaultEstAuthSettings();
    value.client_certificate_settings!.validation_cas = ['enroll-ca'];

    renderEditor({ value, implicitEnrollmentCaId: 'enroll-ca' });

    expect(screen.getByText('Always included')).toBeTruthy();
    expect(screen.getByText('Enrollment CA "enroll-ca"')).toBeTruthy();
    // The explicit entry duplicates the pinned row, so it does not count as an additional CA.
    expect(screen.getByText('No additional validation CAs.')).toBeTruthy();
  });

  it('keeps the pinned row before an Enrollment CA is selected', () => {
    renderEditor({ implicitEnrollmentCaId: null });

    expect(screen.getByText('Always included')).toBeTruthy();
    expect(screen.getByText('Enrollment CA (not selected yet)')).toBeTruthy();
  });

  it('omits the pinned row when no implicit CA applies', () => {
    renderEditor();

    expect(screen.queryByText('Always included')).toBeNull();
    expect(screen.getByText('No validation CAs selected.')).toBeTruthy();
  });

  it('combines the two authentication switches into the auth mode', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });

    fireEvent.click(screen.getByRole('switch', { name: 'Call external webhook' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ auth_mode: 'CLIENT_CERTIFICATE_AND_EXTERNAL_WEBHOOK' }));

    fireEvent.click(screen.getByRole('switch', { name: 'Require client certificate' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ auth_mode: 'NO_AUTH' }));
  });

  it('warns when both checks are off', () => {
    renderEditor({ value: { ...createDefaultEstAuthSettings(), auth_mode: 'NO_AUTH' } });

    expect(screen.queryByText('Validation CAs')).toBeNull();
    expect(screen.getByText('No authentication')).toBeTruthy();
    expect(screen.getByText('Any device can request a certificate.')).toBeTruthy();
  });

  it('toggles allow_unverifiable_revocation, off by default', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });

    const toggle = screen.getByRole('switch', { name: 'Allow certificates without revocation information' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Revocation will not be verified')).toBeNull();

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      client_certificate_settings: expect.objectContaining({ allow_unverifiable_revocation: true }),
    }));
  });

  it('warns when allow_unverifiable_revocation is enabled', () => {
    const value = createDefaultEstAuthSettings();
    value.client_certificate_settings!.allow_unverifiable_revocation = true;
    renderEditor({ value });

    expect(screen.getByText('Revocation will not be verified')).toBeTruthy();
  });

  it('warns when expired certificates are allowed', () => {
    const value = createDefaultEstAuthSettings();
    renderEditor({ value });
    expect(screen.queryByText('Expired certificates will be accepted')).toBeNull();

    cleanup();
    value.client_certificate_settings!.allow_expired = true;
    renderEditor({ value });
    expect(screen.getByText('Expired certificates will be accepted')).toBeTruthy();
  });
});
