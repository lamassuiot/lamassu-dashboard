import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAccessProvider } from '@/contexts/PlatformAccessContext';
import { listPolicies } from '@/lib/authz-api';
import { createDefaultRaFormValues, type RaFormIssue, type RaFormValues } from '@/lib/ra-form';
import type { Policy } from '@/types/authz';
import { IssuanceSection } from './IssuanceSection';
import type { RaFormDependencies } from './types';

vi.mock('@/lib/authz-api', () => ({ listPolicies: vi.fn() }));

const policy = (id: string, name: string): Policy => ({ id, name, description: '', rules: [], created_at: '', updated_at: '' });

const deps: RaFormDependencies = {
  cas: [],
  casById: new Map(),
  cryptoEngines: [],
  profiles: [],
  isLoading: false,
  error: null,
  reload: () => {},
};

const canGrant = { 'authz.public.principal_policy': ['grant'] };
const cannotGrant = { 'pki.dmsmanager.dms': ['create', 'update'] };

describe('IssuanceSection', () => {
  beforeEach(() => {
    vi.mocked(listPolicies).mockReset().mockResolvedValue({ list: [policy('policy-a', 'Device SBI Client')], next: '' });
  });

  const principalOn = (overrides: Partial<RaFormValues> = {}): RaFormValues => ({ ...createDefaultRaFormValues(0), createAuthzPrincipal: true, ...overrides });
  const renderWith = (capabilities: Record<string, string[]> | null, values: RaFormValues, issues: RaFormIssue[] = []) => {
    const update = vi.fn();
    const touch = vi.fn();
    render(
      <PlatformAccessProvider globalCapabilities={capabilities}>
        <IssuanceSection values={values} update={update} issues={issues} touch={touch} deps={deps} inlineProfileForm={{} as never} />
      </PlatformAccessProvider>,
    );
    return { update, touch };
  };
  const policyCheckbox = (name: string) => screen.findByRole('checkbox', { name });
  const policyNames = () => screen.getAllByRole('checkbox').map(checkbox => document.querySelector(`label[for="${checkbox.id}"]`)?.textContent);

  it('turns on the authz principal of the RA', () => {
    const { update } = renderWith(null, createDefaultRaFormValues(0));

    const toggle = screen.getByRole('switch', { name: 'Create authz principal' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBeNull();
    fireEvent.click(toggle);

    expect(update).toHaveBeenCalledWith({ createAuthzPrincipal: true });
  });

  it('shows the principal settings under the switch that controls them', async () => {
    renderWith(null, principalOn());

    const toggle = screen.getByRole('switch', { name: 'Create authz principal' });
    expect(toggle.getAttribute('aria-controls')).toBe('createAuthzPrincipal-settings');
    expect(document.getElementById('createAuthzPrincipal-settings')).toContainElement(await policyCheckbox('Device SBI Client'));
  });

  it('hides the policies while the principal is off', () => {
    renderWith(null, createDefaultRaFormValues(0));

    expect(screen.queryByText('Policies')).toBeNull();
    expect(listPolicies).not.toHaveBeenCalled();
  });

  it('warns that every certificate of the Enrollment CA gets the policies', async () => {
    renderWith(canGrant, principalOn());

    await policyCheckbox('Device SBI Client');
    expect(screen.getByText(/Every certificate signed by the Enrollment CA gets these policies/).textContent).toMatch(/this RA.*any other RA on that CA.*anyone else/);
  });

  it('lets a user allowed to grant policies pick those of the principal', async () => {
    const { update } = renderWith(canGrant, principalOn());

    fireEvent.click(await policyCheckbox('Device SBI Client'));
    expect(update).toHaveBeenCalledWith({ authzPolicyIds: ['policy-a'] });

    fireEvent.click(screen.getByRole('button', { name: 'Add attribute' }));
    expect(update).toHaveBeenCalledWith({ authzAttributes: [{ name: '', source: 'x509.subject.cn' }] });
    expect(screen.queryByText(/needs permission to grant authz policies/)).toBeNull();
  });

  it('keeps the policies editable while authentication is disabled', async () => {
    renderWith(null, principalOn());

    expect((await policyCheckbox('Device SBI Client') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('without permission to grant authz policies', () => {
    it('lets the user remove a policy of the principal', async () => {
      const { update } = renderWith(cannotGrant, principalOn({ authzPolicyIds: ['policy-a'] }));

      const checkbox = await policyCheckbox('Device SBI Client');
      expect(checkbox.getAttribute('aria-checked')).toBe('true');
      expect((checkbox as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(checkbox);

      expect(update).toHaveBeenCalledWith({ authzPolicyIds: [] });
    });

    it('does not let the user add a policy', async () => {
      const { update } = renderWith(cannotGrant, principalOn());

      const checkbox = await policyCheckbox('Device SBI Client');
      expect(checkbox.getAttribute('aria-checked')).toBe('false');
      expect((checkbox as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(checkbox);

      expect(update).not.toHaveBeenCalled();
    });

    it('shows the subject attributes read-only', async () => {
      renderWith(cannotGrant, principalOn({ authzAttributes: [{ name: 'client_id', source: 'x509.subject.cn' }] }));

      await policyCheckbox('Device SBI Client');
      expect((screen.getByRole('textbox', { name: 'Attribute 1 name' }) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole('combobox', { name: 'Attribute 1 source' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Remove attribute 1' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Add attribute' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('explains what the user can and cannot change', async () => {
      renderWith(cannotGrant, principalOn());

      await policyCheckbox('Device SBI Client');
      const note = screen.getByText(/needs permission to grant authz policies/).textContent;
      expect(note).toMatch(/You can remove policies, turn the principal off or turn it on without policies\./);
      expect(note).toMatch(/Adding policies, turning the principal on with policies, changing subject attributes or changing the Enrollment CA while the principal is on/);
    });
  });

  describe('policy list', () => {
    it('follows the pages of the policy list', async () => {
      vi.mocked(listPolicies)
        .mockResolvedValueOnce({ list: [policy('policy-a', 'Device SBI Client')], next: 'page-2' })
        .mockResolvedValueOnce({ list: [policy('policy-b', 'Fleet Reader')], next: '' });
      renderWith(canGrant, principalOn());

      expect(await policyCheckbox('Fleet Reader')).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: 'Device SBI Client' })).toBeTruthy();
      expect(listPolicies).toHaveBeenCalledTimes(2);
      expect(listPolicies).toHaveBeenLastCalledWith(expect.objectContaining({ bookmark: 'page-2' }));
    });

    it('sorts the policies by name, ignoring case', async () => {
      vi.mocked(listPolicies).mockResolvedValue({
        list: [policy('p-1', 'beta'), policy('p-2', 'Gamma'), policy('p-3', 'alpha')],
        next: '',
      });
      renderWith(canGrant, principalOn());

      await policyCheckbox('Gamma');
      expect(policyNames()).toEqual(['alpha', 'beta', 'Gamma']);
    });

    it('keeps showing a selected policy that is not in the list, so it can be removed', async () => {
      renderWith(cannotGrant, principalOn({ authzPolicyIds: ['deleted-policy'] }));

      const checkbox = await policyCheckbox('deleted-policy');
      expect(checkbox.getAttribute('aria-checked')).toBe('true');
      expect((checkbox as HTMLButtonElement).disabled).toBe(false);
      expect(policyNames()).toEqual(['Device SBI Client', 'deleted-policy']);
    });

    it('says when authz has no policies', async () => {
      vi.mocked(listPolicies).mockResolvedValue({ list: [], next: '' });
      renderWith(canGrant, principalOn());

      expect(await screen.findByText('No policies are defined in authz.')).toBeTruthy();
      expect(screen.queryAllByRole('checkbox')).toEqual([]);
    });

    it('shows the selected policies instead of the empty state', async () => {
      vi.mocked(listPolicies).mockResolvedValue({ list: [], next: '' });
      renderWith(canGrant, principalOn({ authzPolicyIds: ['policy-a'] }));

      expect(await policyCheckbox('policy-a')).toBeTruthy();
      expect(screen.queryByText('No policies are defined in authz.')).toBeNull();
    });

    it('shows why the policies could not be loaded, along with the selected ones', async () => {
      vi.mocked(listPolicies).mockRejectedValue(new Error('authz is unreachable'));
      renderWith(canGrant, principalOn({ authzPolicyIds: ['policy-a'] }));

      expect(await screen.findByText('Could not load the policies: authz is unreachable')).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: 'policy-a' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.queryByText('No policies are defined in authz.')).toBeNull();
    });
  });

  describe('subject attribute issues', () => {
    const issue: RaFormIssue = { section: 'issuance', severity: 'error', kind: 'invalid', message: 'Subject attribute names must be unique.', field: 'authzAttributes' };

    it('marks the attributes touched when a name loses focus', async () => {
      const { touch } = renderWith(canGrant, principalOn({ authzAttributes: [{ name: '', source: 'x509.subject.cn' }] }));

      await policyCheckbox('Device SBI Client');
      fireEvent.blur(screen.getByRole('textbox', { name: 'Attribute 1 name' }));

      expect(touch).toHaveBeenCalledWith('authzAttributes');
    });

    it('shows an issue next to the attributes while the principal is on', async () => {
      renderWith(canGrant, principalOn(), [issue]);

      await policyCheckbox('Device SBI Client');
      expect(screen.getAllByText(issue.message)).toHaveLength(1);
      expect(document.getElementById('createAuthzPrincipal-settings')).toContainElement(screen.getByText(issue.message));
    });

    it('shows every issue of the attributes at once, not only the first', async () => {
      const second: RaFormIssue = { ...issue, message: 'Every subject attribute of the authz principal needs a name.', kind: 'required' };
      renderWith(canGrant, principalOn(), [second, issue]);

      await policyCheckbox('Device SBI Client');
      expect(screen.getByText(second.message)).toBeTruthy();
      expect(screen.getByText(issue.message)).toBeTruthy();
    });

    it('groups the policies under their label for assistive technology', async () => {
      renderWith(canGrant, principalOn());

      await policyCheckbox('Device SBI Client');
      expect(screen.getByRole('group', { name: 'Policies' })).toContainElement(screen.getByRole('checkbox', { name: 'Device SBI Client' }));
    });

    it('lists an issue with the section while the principal is off, as the attributes are hidden', () => {
      renderWith(canGrant, createDefaultRaFormValues(0), [issue]);

      expect(screen.getAllByText(issue.message)).toHaveLength(1);
    });
  });
});
