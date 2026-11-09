import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShellProvider } from '@lamassu/mfe-sdk';
import { fakeShell } from '../test-fixtures';
import { HomePage } from './HomePage';

const renderPage = () => render(<ShellProvider value={fakeShell()}><HomePage /></ShellProvider>);

afterEach(() => vi.restoreAllMocks());

describe('HomePage', () => {
  it('calls the API once with the shell token and shows a value from the response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ total: 7 }), { status: 200 }));
    renderPage();
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('total')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('https://api.test/ca/v1/stats', { headers: { Authorization: 'Bearer tok' } });
  });

  it('shows nested values as JSON instead of [object Object]', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ cas: { total: 2 } }), { status: 200 }));
    renderPage();
    expect(await screen.findByText('{"total":2}')).toBeInTheDocument();
  });

  it('shows an error message when the API answers 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500');
  });
});
