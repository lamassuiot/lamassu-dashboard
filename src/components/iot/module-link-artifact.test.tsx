import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModuleLinkArtifact } from './module-link-artifact';

const { fetchAllArtifactsMock, linkArtifactToSoftwareModuleMock } = vi.hoisted(() => ({
  fetchAllArtifactsMock: vi.fn(),
  linkArtifactToSoftwareModuleMock: vi.fn(),
}));

vi.mock('@/lib/iot-api', () => ({
  fetchAllArtifacts: fetchAllArtifactsMock,
  linkArtifactToSoftwareModule: linkArtifactToSoftwareModuleMock,
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const artifacts = [
  { id: 'a1', name: 'firmware', version: '1.0.0', filename: 'fw.bin', packs: [{ distribution_set_id: 'p', distribution_set_name: 'other', distribution_set_version: '1.0.0', group_id: 'g' }] },
  { id: 'a2', name: 'config', version: '', filename: 'cfg.json' },
];

describe('ModuleLinkArtifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAllArtifactsMock.mockResolvedValue({ list: artifacts, next: null });
    linkArtifactToSoftwareModuleMock.mockResolvedValue({});
  });

  it('does not read the catalog until it is opened', () => {
    render(<ModuleLinkArtifact groupId="g" packName="demo" moduleKey="application:app" linkedIds={[]} onLinked={vi.fn()} />);
    expect(fetchAllArtifactsMock).not.toHaveBeenCalled();
  });

  it('links the picked artifact to THIS module of THIS set, and reports back', async () => {
    const onLinked = vi.fn();
    render(<ModuleLinkArtifact groupId="g" packName="demo" moduleKey="application:app" linkedIds={['a2']} onLinked={onLinked} />);
    fireEvent.click(screen.getByRole('button', { name: /use an existing artifact/i }));

    await screen.findByText('fw.bin · in 1 distribution set');
    // Already on the module: offered as linked, not as an action.
    expect(screen.getByText('On this module')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^link$/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /^link$/i }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(linkArtifactToSoftwareModuleMock).toHaveBeenCalledWith({
      groupId: 'g', packName: 'demo', moduleKey: 'application:app', artifactId: 'a1',
    });
    expect(screen.getAllByText('On this module')).toHaveLength(2);
  });
});
