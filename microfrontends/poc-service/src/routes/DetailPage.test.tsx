import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ShellProvider } from '@lamassu/mfe-sdk';
import { fakeShell } from '../test-fixtures';
import { DetailPage } from './DetailPage';

const renderPage = (over = {}) =>
  render(
    <MemoryRouter>
      <ShellProvider value={fakeShell(over)}><DetailPage /></ShellProvider>
    </MemoryRouter>,
  );

describe('DetailPage', () => {
  it('shows what the shell provides: basePath, theme and a capability check', () => {
    renderPage({ theme: 'dark', hasCapability: (key: string) => key === 'pki.ca.ca_certificate' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/detail/i);
    expect(screen.getByText('/poc-service')).toBeInTheDocument();
    expect(screen.getByText('dark')).toBeInTheDocument();
    expect(screen.getByTestId('can-view-cas')).toHaveTextContent('yes');
  });

  it('links back to the module home', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/poc-service');
  });
});
