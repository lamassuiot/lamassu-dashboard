import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import type { ModuleDefinition, ModuleDescriptor, ShellApi } from '@lamassu/mfe-sdk';
import { loadModuleDefinition } from '@/lib/modules/federation';
import { renderModuleRoutes } from './module-routes';

vi.mock('@/lib/modules/federation', () => ({ loadModuleDefinition: vi.fn() }));
vi.mock('@/hooks/useShellApi', () => ({
  useShellApi: (basePath: string): ShellApi => ({
    getAccessToken: () => 'tok',
    apiBaseUrl: 'https://api.test',
    publicApiUrl: 'https://api.test',
    hasCapability: () => true,
    basePath,
    theme: 'light',
    notify: { success: () => undefined, error: () => undefined },
  }),
}));

const poc: ModuleDescriptor = {
  name: 'poc_service',
  entry: '/ui/modules/poc-service/remoteEntry.js',
  basePath: '/poc-service',
  nav: { group: 'ENTERPRISE', label: 'PoC Service' },
};
const definition = (over: Partial<ModuleDefinition> = {}): ModuleDefinition => ({
  contractVersion: 1,
  Root: ({ shell }) => <div>root:{shell.basePath}</div>,
  ...over,
});
const renderHost = (initial = '/poc-service') =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <nav>sidebar</nav>
      <Link to="/poc-service/other">go</Link>
      <Routes>{renderModuleRoutes([poc])}</Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(loadModuleDefinition).mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('RemoteModuleHost', () => {
  it('renders the module Root with the shell api for its basePath', async () => {
    vi.mocked(loadModuleDefinition).mockResolvedValue(definition());
    renderHost('/poc-service/deep/link');
    expect(await screen.findByText('root:/poc-service')).toBeInTheDocument();
    expect(loadModuleDefinition).toHaveBeenCalledWith('poc_service');
  });

  it('shows an error with the module name and a working Retry when loading fails', async () => {
    vi.mocked(loadModuleDefinition).mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(definition());
    renderHost();
    expect(await screen.findByText(/poc_service/)).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.getByText('sidebar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('root:/poc-service')).toBeInTheDocument();
    expect(loadModuleDefinition).toHaveBeenCalledTimes(2);
  });

  it('refuses a module built for another contract version without rendering it', async () => {
    const Root = vi.fn(() => <div>should not render</div>);
    vi.mocked(loadModuleDefinition).mockResolvedValue(definition({ contractVersion: 99, Root }));
    renderHost();
    expect(await screen.findByText(/incompatible/i)).toBeInTheDocument();
    expect(screen.getByText(/99/)).toBeInTheDocument();
    expect(Root).not.toHaveBeenCalled();
  });

  it('contains a render error in the module, keeps the sidebar, and clears it after navigating', async () => {
    let shouldThrow = true;
    const Root = () => {
      if (shouldThrow) throw new Error('kaboom');
      return <div>recovered</div>;
    };
    vi.mocked(loadModuleDefinition).mockResolvedValue(definition({ Root }));
    renderHost();
    expect(await screen.findByText(/kaboom/)).toBeInTheDocument();
    expect(screen.getByText('sidebar')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText('go'));
    expect(await screen.findByText('recovered')).toBeInTheDocument();
    expect(screen.queryByText(/kaboom/)).not.toBeInTheDocument();
  });
});

describe('renderModuleRoutes with two modules', () => {
  it('never renders module A with the shell api of module B when navigating A → B', async () => {
    const renders: string[] = [];
    const a: ModuleDescriptor = { ...poc, name: 'mod_a', basePath: '/a', nav: { group: 'X', label: 'A' } };
    const b: ModuleDescriptor = { ...poc, name: 'mod_b', basePath: '/b', nav: { group: 'X', label: 'B' } };
    vi.mocked(loadModuleDefinition).mockImplementation(async (name) =>
      definition({
        Root: ({ shell }) => {
          renders.push(`${name}:${shell.basePath}`);
          return <div>root-{name}</div>;
        },
      }),
    );
    render(
      <MemoryRouter initialEntries={['/a']}>
        <Link to="/b">to-b</Link>
        <Routes>{renderModuleRoutes([a, b])}</Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('root-mod_a')).toBeInTheDocument();
    fireEvent.click(screen.getByText('to-b'));
    expect(await screen.findByText('root-mod_b')).toBeInTheDocument();
    expect(renders).not.toContain('mod_a:/b');
  });
});

describe('renderModuleRoutes without a matching route', () => {
  it('does not render for an unrelated path', () => {
    vi.mocked(loadModuleDefinition).mockResolvedValue(definition());
    render(
      <MemoryRouter initialEntries={['/other']}>
        <Routes>
          {renderModuleRoutes([poc])}
          <Route path="*" element={<div>not found</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('not found')).toBeInTheDocument();
    expect(loadModuleDefinition).not.toHaveBeenCalled();
  });
});
