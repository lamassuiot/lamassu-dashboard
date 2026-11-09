import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SDK_CONTRACT_VERSION } from '@lamassu/mfe-sdk';
import { fakeShell } from './test-fixtures';
import definition from './module';
import manifest from '../module.json';

afterEach(() => vi.restoreAllMocks());

describe('module definition', () => {
  it('declares the contract version of the SDK it was built against', () => {
    expect(definition.contractVersion).toBe(SDK_CONTRACT_VERSION);
  });

  it('renders its home page when mounted under basePath/* like the shell does', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { Root } = definition;
    render(
      <MemoryRouter initialEntries={[manifest.basePath]}>
        <Routes>
          <Route path={`${manifest.basePath}/*`} element={<Root shell={fakeShell({ basePath: manifest.basePath })} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders the detail page for basePath/detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { Root } = definition;
    render(
      <MemoryRouter initialEntries={[`${manifest.basePath}/detail`]}>
        <Routes>
          <Route path={`${manifest.basePath}/*`} element={<Root shell={fakeShell({ basePath: manifest.basePath })} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: /detail/i })).toBeInTheDocument();
  });
});
