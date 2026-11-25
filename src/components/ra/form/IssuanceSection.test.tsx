import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentifierDisplayProvider } from '@/contexts/IdentifierDisplayContext';
import { PlatformAccessProvider } from '@/contexts/PlatformAccessContext';
import { getPolicy, listPolicies } from '@/lib/authz-api';
import { fetchAllRegistrationAuthorities, type ApiRaItem } from '@/lib/dms-api';
import { buildRaPayload, createDefaultRaFormValues, type RaFormIssue, type RaFormValues } from '@/lib/ra-form';
import type { Policy } from '@/types/authz';
import { IssuanceSection } from './IssuanceSection';
import type { RaFormDependencies } from './types';

vi.mock('@/lib/authz-api', () => ({ listPolicies: vi.fn(), getPolicy: vi.fn() }));
vi.mock('@/lib/dms-api', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/dms-api')>()), fetchAllRegistrationAuthorities: vi.fn() }));

const policy = (id: string, name: string): Policy => ({ id, name, description: '', rules: [], created_at: '', updated_at: '' });
const policies: Record<string, Policy> = { 'policy-a': policy('policy-a', 'Device SBI Client'), 'policy-b': policy('policy-b', 'Fleet Reader') };

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

function storedRa(id: string, caId: string, policyIds: string[] | null): ApiRaItem {
  const base = buildRaPayload({ ...createDefaultRaFormValues(0), id, name: `RA ${id}`, enrollmentCaId: caId, createAuthzPrincipal: policyIds !== null, authzPolicyIds: policyIds ?? [] });
  return { ...base, creation_ts: '2026-01-01T00:00:00Z' };
}

describe('IssuanceSection', () => {
  beforeEach(() => {
    vi.mocked(listPolicies).mockReset().mockResolvedValue({ list: Object.values(policies), next: '' });
    vi.mocked(getPolicy).mockReset().mockImplementation(async id => {
      if (!policies[id]) throw new Error('not found');
      return policies[id];
    });
    vi.mocked(fetchAllRegistrationAuthorities).mockReset().mockResolvedValue([]);
  });

  const principalOn = (overrides: Partial<RaFormValues> = {}): RaFormValues => ({ ...createDefaultRaFormValues(0), createAuthzPrincipal: true, ...overrides });
  const renderWith = (capabilities: Record<string, string[]> | null, values: RaFormValues, issues: RaFormIssue[] = []) => {
    const update = vi.fn();
    const touch = vi.fn();
    render(
      <IdentifierDisplayProvider>
        <PlatformAccessProvider globalCapabilities={capabilities}>
          <IssuanceSection values={values} update={update} issues={issues} touch={touch} deps={deps} inlineProfileForm={{} as never} />
        </PlatformAccessProvider>
      </IdentifierDisplayProvider>,
    );
    return { update, touch };
  };
  const addPoliciesButton = () => screen.getByRole('button', { name: 'Add policies' }) as HTMLButtonElement;

  it('turns on the authz principal of the RA', () => {
    const { update } = renderWith(null, createDefaultRaFormValues(0));

    const toggle = screen.getByRole('switch', { name: 'Create authz principal' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBeNull();
    fireEvent.click(toggle);

    expect(update).toHaveBeenCalledWith({ createAuthzPrincipal: true });
  });

  it('shows the principal settings under the switch that controls them', () => {
    renderWith(null, principalOn());

    const toggle = screen.getByRole('switch', { name: 'Create authz principal' });
    expect(toggle.getAttribute('aria-controls')).toBe('createAuthzPrincipal-settings');
    expect(document.getElementById('createAuthzPrincipal-settings')).toContainElement(addPoliciesButton());
  });

  it('hides the policies while the principal is off', () => {
    renderWith(null, createDefaultRaFormValues(0));

    expect(screen.queryByText('Policies')).toBeNull();
    expect(getPolicy).not.toHaveBeenCalled();
  });

  it('warns that every certificate of the Enrollment CA gets the policies', () => {
    renderWith(canGrant, principalOn());

    expect(screen.getByText(/Every certificate signed by the Enrollment CA gets these policies/).textContent).toMatch(/this RA.*any other RA on that CA.*anyone else/);
  });

  it('says a principal without policies allows nothing', () => {
    renderWith(canGrant, principalOn());

    expect(screen.getByText('No policies: devices authenticate but are allowed nothing.')).toBeTruthy();
  });

  it('shows the selected policies by name', async () => {
    renderWith(canGrant, principalOn({ authzPolicyIds: ['policy-a'] }));

    const list = screen.getByRole('group', { name: 'Policies' });
    expect(await within(list).findByText('Device SBI Client')).toBeTruthy();
    expect(within(list).getByText('policy-a')).toBeTruthy();
  });

  it('keeps a policy that can not be read, so it can be removed', async () => {
    const { update } = renderWith(cannotGrant, principalOn({ authzPolicyIds: ['deleted-policy'] }));

    expect(await screen.findByText('deleted-policy · not found or not readable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove deleted-policy' }));
    expect(update).toHaveBeenCalledWith({ authzPolicyIds: [] });
  });

  it('lets a user allowed to grant policies add them from the policy sheet', async () => {
    const { update } = renderWith(canGrant, principalOn({ authzPolicyIds: ['policy-a'] }));

    fireEvent.click(addPoliciesButton());
    const sheet = await screen.findByRole('dialog', { name: 'Add Policies' });
    // A policy the principal already has is not offered again.
    await within(sheet).findByText('Fleet Reader');
    expect(within(sheet).queryByText('Device SBI Client')).toBeNull();
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Select Fleet Reader' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add Policy' }));

    expect(update).toHaveBeenCalledWith({ authzPolicyIds: ['policy-a', 'policy-b'] });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Policies' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Add attribute' }));
    expect(update).toHaveBeenCalledWith({ authzAttributes: [{ name: '', source: 'x509.subject.cn' }] });
    expect(screen.queryByText(/needs permission to grant authz policies/)).toBeNull();
  });

  it('keeps the policies editable while authentication is disabled', () => {
    renderWith(null, principalOn());

    expect(addPoliciesButton().disabled).toBe(false);
  });

  describe('without permission to grant authz policies', () => {
    it('lets the user remove a policy of the principal', async () => {
      const { update } = renderWith(cannotGrant, principalOn({ authzPolicyIds: ['policy-a', 'policy-b'] }));

      fireEvent.click(await screen.findByRole('button', { name: 'Remove Device SBI Client' }));

      expect(update).toHaveBeenCalledWith({ authzPolicyIds: ['policy-b'] });
    });

    it('does not let the user add a policy', () => {
      renderWith(cannotGrant, principalOn());

      expect(addPoliciesButton().disabled).toBe(true);
    });

    it('shows the subject attributes read-only', () => {
      renderWith(cannotGrant, principalOn({ authzAttributes: [{ name: 'client_id', source: 'x509.subject.cn' }] }));

      expect((screen.getByRole('textbox', { name: 'Attribute 1 name' }) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole('combobox', { name: 'Attribute 1 source' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Remove attribute 1' }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Add attribute' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('explains what the user can and cannot change', () => {
      renderWith(cannotGrant, principalOn());

      const note = screen.getByText(/needs permission to grant authz policies/).textContent;
      expect(note).toMatch(/You can remove policies, turn the principal off or turn it on without policies\./);
      expect(note).toMatch(/Adding policies, turning the principal on with policies, changing subject attributes or changing the Enrollment CA while the principal is on/);
    });
  });

  describe('other RAs on the Enrollment CA', () => {
    it('warns that the certificates of this RA get the policies of another RA on the CA', async () => {
      vi.mocked(fetchAllRegistrationAuthorities).mockResolvedValue([storedRa('ra-a', 'ca-x', ['policy-a']), storedRa('ra-c', 'ca-y', ['policy-a'])]);
      renderWith(cannotGrant, { ...createDefaultRaFormValues(0), id: 'ra-b', enrollmentCaId: 'ca-x' });

      const alert = await screen.findByText('Devices of this RA get the policies of another RA');
      expect(alert.closest('[role="alert"]')?.textContent).toMatch(/The authz principal of "RA ra-a" trusts every certificate signed by this CA/);
    });

    it('does not warn about an RA on the CA whose principal grants nothing', async () => {
      vi.mocked(fetchAllRegistrationAuthorities).mockResolvedValue([storedRa('ra-a', 'ca-x', []), storedRa('ra-d', 'ca-x', null)]);
      renderWith(cannotGrant, { ...createDefaultRaFormValues(0), id: 'ra-b', enrollmentCaId: 'ca-x' });

      await waitFor(() => expect(fetchAllRegistrationAuthorities).toHaveBeenCalled());
      expect(screen.queryByText('Devices of this RA get the policies of another RA')).toBeNull();
    });

    it('does not warn an RA about its own principal', async () => {
      vi.mocked(fetchAllRegistrationAuthorities).mockResolvedValue([storedRa('ra-a', 'ca-x', ['policy-a'])]);
      renderWith(canGrant, principalOn({ id: 'ra-a', enrollmentCaId: 'ca-x', authzPolicyIds: ['policy-a'] }));

      await waitFor(() => expect(fetchAllRegistrationAuthorities).toHaveBeenCalled());
      expect(screen.queryByText('Devices of this RA get the policies of another RA')).toBeNull();
      expect(screen.queryByText('Other RAs share this Enrollment CA')).toBeNull();
    });

    it('warns that the policies of this principal reach the certificates of the other RAs on the CA', async () => {
      vi.mocked(fetchAllRegistrationAuthorities).mockResolvedValue([storedRa('ra-b', 'ca-x', null), storedRa('ra-c', 'ca-x', null), storedRa('ra-d', 'ca-x', null)]);
      renderWith(canGrant, principalOn({ id: 'ra-a', enrollmentCaId: 'ca-x', authzPolicyIds: ['policy-a'] }));

      const alert = await screen.findByText('Other RAs share this Enrollment CA');
      expect(alert.closest('[role="alert"]')?.textContent).toMatch(/Certificates issued by "RA ra-b", "RA ra-c" and 1 more also get these policies/);
    });

    it('does not warn about sharing the CA while the principal has no policies', async () => {
      vi.mocked(fetchAllRegistrationAuthorities).mockResolvedValue([storedRa('ra-b', 'ca-x', null)]);
      renderWith(canGrant, principalOn({ id: 'ra-a', enrollmentCaId: 'ca-x' }));

      await waitFor(() => expect(fetchAllRegistrationAuthorities).toHaveBeenCalled());
      expect(screen.queryByText('Other RAs share this Enrollment CA')).toBeNull();
    });

    it('keeps the form usable when the RAs can not be listed', async () => {
      vi.mocked(fetchAllRegistrationAuthorities).mockRejectedValue(new Error('down'));
      renderWith(canGrant, principalOn({ enrollmentCaId: 'ca-x' }));

      await waitFor(() => expect(fetchAllRegistrationAuthorities).toHaveBeenCalled());
      expect(addPoliciesButton().disabled).toBe(false);
    });
  });

  describe('subject attribute issues', () => {
    const issue: RaFormIssue = { section: 'issuance', severity: 'error', kind: 'invalid', message: 'Subject attribute names must be unique.', field: 'authzAttributes' };

    it('marks the attributes touched when a name loses focus', async () => {
      const { touch } = renderWith(canGrant, principalOn({ authzAttributes: [{ name: '', source: 'x509.subject.cn' }] }));

      fireEvent.blur(screen.getByRole('textbox', { name: 'Attribute 1 name' }));

      expect(touch).toHaveBeenCalledWith('authzAttributes');
    });

    it('shows an issue next to the attributes while the principal is on', async () => {
      renderWith(canGrant, principalOn(), [issue]);

      expect(screen.getAllByText(issue.message)).toHaveLength(1);
      expect(document.getElementById('createAuthzPrincipal-settings')).toContainElement(screen.getByText(issue.message));
    });

    it('shows every issue of the attributes at once, not only the first', async () => {
      const second: RaFormIssue = { ...issue, message: 'Every subject attribute of the authz principal needs a name.', kind: 'required' };
      renderWith(canGrant, principalOn(), [second, issue]);

      expect(screen.getByText(second.message)).toBeTruthy();
      expect(screen.getByText(issue.message)).toBeTruthy();
    });

    it('groups the policies under their label for assistive technology', () => {
      renderWith(canGrant, principalOn());

      expect(screen.getByRole('group', { name: 'Policies' })).toContainElement(addPoliciesButton());
    });

    it('lists an issue with the section while the principal is off, as the attributes are hidden', () => {
      renderWith(canGrant, createDefaultRaFormValues(0), [issue]);

      expect(screen.getAllByText(issue.message)).toHaveLength(1);
    });
  });
});
